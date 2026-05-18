import type { AppActions } from "../app/controller";
import { errorText } from "../domain/errors";
import {
  filterRoutines,
  formatDateTime,
  getTodayWeekdayId,
  getWeekdayLabel,
  normalizeText,
  sortRoutines,
  timeToMinutes,
} from "../domain/model";
import {
  SORT_OPTIONS,
  WEEKDAYS,
  type AppState,
  type CatalogKind,
  type EmptyResult,
  type Routine,
  type RoutinePayload,
} from "../domain/types";
import type { NotificationManager, RoutineAlert } from "../notifications/notification-manager";
import { createDialogManager, type DialogManager } from "./dialogs";
import { el, icon, option, qs, qsa, replaceChildren, span } from "./dom";
import { refreshIcons } from "./icons";
import { createToastManager, type ToastManager, type ToastPayload } from "./toasts";
import { buildWeekSchedule, type WeekScheduleCell, type WeekScheduleEntry, type WeekScheduleSection } from "./week-schedule";

const NAVIGATION_LABELS: Record<string, string> = {
  today: "Home",
  week: "Semana",
  teachers: "Professores",
  rooms: "Salas",
  devices: "Dispositivos",
  settings: "Configurações",
};

const IMPORTED_FIXED_EQUIPMENT_NOTE = "Importado da folha de reserva de equipamentos eletr\u00f4nicos fixos.";
export const TODAY_VISIBLE_ROUTINE_LIMIT = 3;
export const TODAY_LOOKAHEAD_MINUTES = 120;

interface RoutineTimeSegment {
  startMinutes: number;
  endMinutes: number | null;
}

export interface SmartRoutineGroup {
  routines: Routine[];
  representative: Routine;
  timeLabel: string;
  startMinutes: number;
  endMinutes: number | null;
  isActiveNow: boolean;
}

export function getCurrentMinutes(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function getRoutineStartMinutes(routine: Routine): number | null {
  return timeToMinutes(routine.startTime);
}

export function getRoutineEndMinutes(routine: Routine): number | null {
  if (!routine.endTime) return null;
  return timeToMinutes(routine.endTime);
}

export function isRoutinePendingOrActive(routine: Routine, currentMinutes: number): boolean {
  const startMinutes = getRoutineStartMinutes(routine);
  if (startMinutes === null) return false;

  const endMinutes = getRoutineEndMinutes(routine);
  if (endMinutes !== null) {
    return currentMinutes < endMinutes;
  }

  return currentMinutes <= startMinutes;
}

export function isRoutineActiveNow(routine: Routine, currentMinutes: number): boolean {
  const startMinutes = getRoutineStartMinutes(routine);
  if (startMinutes === null) return false;

  const endMinutes = getRoutineEndMinutes(routine);
  if (endMinutes !== null) {
    return startMinutes <= currentMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes === startMinutes;
}

export function normalizeRoutineDevices(devices: string[]): string[] {
  return [...new Set(devices.map((device) => normalizeText(device).toLocaleLowerCase("pt-BR")).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
}

function normalizeRoutineGroupNote(note: string): string {
  return normalizeText(note).replace(/\s*\(cópia\)$/iu, "");
}

function hasCopyNoteMarker(note: string): boolean {
  const normalized = normalizeText(note);
  return normalized === "Cópia" || /\s*\(cópia\)$/iu.test(normalized);
}

export function createRoutineGroupKey(routine: Routine): string {
  return JSON.stringify([
    normalizeText(routine.teacher),
    normalizeText(routine.subject),
    normalizeText(routine.room),
    routine.studentCount,
    normalizeRoutineDevices(routine.devices).join("\u0000"),
    normalizeRoutineGroupNote(routine.notes),
    routine.notificationEnabled,
    routine.leadMinutes ?? null,
  ]);
}

export function areRoutineConfigsEquivalent(a: Routine, b: Routine): boolean {
  return createRoutineGroupKey(a) === createRoutineGroupKey(b);
}

export function groupEquivalentRoutines(routines: Routine[], currentMinutes = getCurrentMinutes()): SmartRoutineGroup[] {
  const buckets = new Map<string, Routine[]>();

  sortRoutines(routines, "time").forEach((routine) => {
    const key = createRoutineGroupKey(routine);
    const bucket = buckets.get(key) ?? [];
    bucket.push(routine);
    buckets.set(key, bucket);
  });

  return [...buckets.values()].map((group) => createSmartRoutineGroup(group, currentMinutes)).sort(compareSmartRoutineGroups);
}

export function mergeRoutineGroupTimes(group: Pick<SmartRoutineGroup, "routines">): string {
  return buildRoutineTimeLabel(group.routines);
}

export function getSmartTodayRoutineGroups(routines: Routine[], currentMinutes = getCurrentMinutes()): SmartRoutineGroup[] {
  const pendingRoutines = sortRoutines(
    routines.filter((routine) => isRoutinePendingOrActive(routine, currentMinutes)),
    "time",
  );

  return groupEquivalentRoutines(pendingRoutines, currentMinutes);
}

export function getVisibleSmartTodayRoutineGroups(
  routines: Routine[],
  currentMinutes = getCurrentMinutes(),
  limit = TODAY_VISIBLE_ROUTINE_LIMIT,
  lookaheadMinutes = TODAY_LOOKAHEAD_MINUTES,
): SmartRoutineGroup[] {
  const pendingRoutines = sortRoutines(
    routines.filter((routine) => isRoutinePendingOrActive(routine, currentMinutes)),
    "time",
  );
  if (pendingRoutines.length === 0) return [];

  const visibleRoutines = pendingRoutines.filter((routine) => {
    const startMinutes = getRoutineStartMinutes(routine);
    return (
      isRoutineActiveNow(routine, currentMinutes) ||
      (startMinutes !== null && startMinutes >= currentMinutes && startMinutes <= currentMinutes + lookaheadMinutes)
    );
  });
  const candidates = visibleRoutines.length ? visibleRoutines : [pendingRoutines[0]!];

  return groupEquivalentRoutines(removeCopiedRoutineCardDuplicates(candidates), currentMinutes).slice(0, limit);
}

function removeCopiedRoutineCardDuplicates(routines: Routine[]): Routine[] {
  const selectedByKey = new Map<string, Routine>();
  const passthrough: Routine[] = [];

  sortRoutines(routines, "time").forEach((routine) => {
    const key = JSON.stringify([
      routine.weekday,
      routine.startTime,
      routine.endTime,
      createRoutineGroupKey(routine),
    ]);
    const existing = selectedByKey.get(key);

    if (!existing) {
      selectedByKey.set(key, routine);
      return;
    }

    const existingIsCopy = hasCopyNoteMarker(existing.notes);
    const routineIsCopy = hasCopyNoteMarker(routine.notes);
    if (existingIsCopy || routineIsCopy) {
      if (existingIsCopy && !routineIsCopy) {
        selectedByKey.set(key, routine);
      }
      return;
    }

    passthrough.push(routine);
  });

  return sortRoutines([...selectedByKey.values(), ...passthrough], "time");
}

function createSmartRoutineGroup(routines: Routine[], currentMinutes: number): SmartRoutineGroup {
  const sorted = sortRoutines(routines, "time").filter((routine) => getRoutineStartMinutes(routine) !== null);
  const representative = sorted[0] ?? routines[0]!;
  const startMinutes = getRoutineStartMinutes(representative) ?? 0;
  const endMinutes = sorted.reduce<number | null>((latestEnd, routine) => {
    const endMinutes = getRoutineEndMinutes(routine);
    if (endMinutes === null) return latestEnd;
    return latestEnd === null || endMinutes > latestEnd ? endMinutes : latestEnd;
  }, null);

  return {
    routines: sorted,
    representative,
    timeLabel: buildRoutineTimeLabel(sorted),
    startMinutes,
    endMinutes,
    isActiveNow: sorted.some((routine) => isRoutineActiveNow(routine, currentMinutes)),
  };
}

function compareSmartRoutineGroups(a: SmartRoutineGroup, b: SmartRoutineGroup): number {
  if (a.isActiveNow !== b.isActiveNow) return a.isActiveNow ? -1 : 1;
  return (
    a.startMinutes - b.startMinutes ||
    normalizeText(a.representative.teacher).localeCompare(normalizeText(b.representative.teacher), "pt-BR") ||
    normalizeText(a.representative.room).localeCompare(normalizeText(b.representative.room), "pt-BR")
  );
}

function buildRoutineTimeLabel(routines: Routine[]): string {
  const segments = sortRoutines(routines, "time")
    .map(toRoutineTimeSegment)
    .filter((segment): segment is RoutineTimeSegment => segment !== null)
    .reduce<RoutineTimeSegment[]>((result, segment) => {
      const last = result.at(-1);
      if (last?.endMinutes !== null && last?.endMinutes !== undefined && segment.endMinutes !== null && segment.startMinutes <= last.endMinutes) {
        last.endMinutes = Math.max(last.endMinutes, segment.endMinutes);
        return result;
      }

      result.push({ ...segment });
      return result;
    }, []);

  return segments.map(formatRoutineTimeSegment).join(" \u00b7 ");
}

function toRoutineTimeSegment(routine: Routine): RoutineTimeSegment | null {
  const startMinutes = getRoutineStartMinutes(routine);
  if (startMinutes === null) return null;

  return {
    startMinutes,
    endMinutes: getRoutineEndMinutes(routine),
  };
}

function formatRoutineTimeSegment(segment: RoutineTimeSegment): string {
  const start = formatMinutesAsTime(segment.startMinutes);
  if (segment.endMinutes === null) return start;
  return `${start}-${formatMinutesAsTime(segment.endMinutes)}`;
}

function formatMinutesAsTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}`;
}

interface UIRefs {
  mainMenuButton: HTMLButtonElement;
  mainMenuPanel: HTMLElement;
  mainMenuCurrent: HTMLElement;
  navButtons: NodeListOf<HTMLButtonElement>;
  views: NodeListOf<HTMLElement>;
  todayLabel: HTMLElement;
  storageStatus: HTMLElement;
  todayMetrics: HTMLElement;
  undoDeleteButton: HTMLButtonElement;
  routineFormPanel: HTMLElement;
  routineForm: HTMLFormElement;
  routineFormTitle: HTMLElement;
  routineFormModeLabel: HTMLElement;
  routineId: HTMLInputElement;
  routineWeekday: HTMLSelectElement;
  routineStartTime: HTMLInputElement;
  routineEndTime: HTMLInputElement;
  routineSubject: HTMLInputElement;
  routineTeacher: HTMLInputElement;
  routineRoom: HTMLInputElement;
  routineStudentCount: HTMLInputElement;
  routineDevices: HTMLElement;
  routineNewDevice: HTMLInputElement;
  routineNotes: HTMLTextAreaElement;
  routineNotificationEnabled: HTMLInputElement;
  routineLeadMode: HTMLSelectElement;
  routineCustomLeadWrap: HTMLElement;
  routineCustomLead: HTMLInputElement;
  routineFeedback: HTMLElement;
  saveRoutineButton: HTMLElement;
  clearRoutineForm: HTMLButtonElement;
  addDeviceToRoutine: HTMLButtonElement;
  todaySummary: HTMLElement;
  todayRoutines: HTMLElement;
  requestNotificationButton: HTMLButtonElement;
  weekRoutines: HTMLElement;
  routineFilter: HTMLInputElement;
  routineSort: HTMLSelectElement;
  filterTimeStart: HTMLSelectElement;
  filterTimeEnd: HTMLSelectElement;
  filterTeacher: HTMLSelectElement;
  filterRoom: HTMLSelectElement;
  filterResultsCount: HTMLElement;
  filterClearAll: HTMLButtonElement;
  teachersDatalist: HTMLElement;
  roomsDatalist: HTMLElement;
  subjectsDatalist: HTMLElement;
  teacherForm: HTMLFormElement;
  teacherId: HTMLInputElement;
  teacherName: HTMLInputElement;
  teacherFeedback: HTMLElement;
  teachersListPanel: HTMLElement;
  roomForm: HTMLFormElement;
  roomId: HTMLInputElement;
  roomName: HTMLInputElement;
  roomStudentCount: HTMLInputElement;
  roomFeedback: HTMLElement;
  roomsListPanel: HTMLElement;
  deviceForm: HTMLFormElement;
  deviceId: HTMLInputElement;
  deviceName: HTMLInputElement;
  deviceFeedback: HTMLElement;
  devicesListPanel: HTMLElement;
  settingsForm: HTMLFormElement;
  settingsNotificationsEnabled: HTMLInputElement;
  settingsDefaultLead: HTMLSelectElement;
  settingsCustomLeadWrap: HTMLElement;
  settingsCustomLead: HTMLInputElement;
  settingsSoundEnabled: HTMLInputElement;
  settingsFeedback: HTMLElement;
  exportDataButton: HTMLButtonElement;
  importDataFile: HTMLInputElement;
  resetDataButton: HTMLButtonElement;
  alertList: HTMLElement;
  clearAlertsButton: HTMLButtonElement;
  alertDock: HTMLElement;
}

export interface UIApi {
  init(): void;
  render(): void;
  addAlert(alert: RoutineAlert): void;
  showAlarm(alert: RoutineAlert): Promise<void>;
  showToast(payload: ToastPayload): void;
  renderNotificationStatus(): void;
}

export function createUI({
  getState,
  actions,
  notifications,
  initialNotice,
}: {
  getState: () => AppState;
  actions: AppActions;
  notifications: NotificationManager;
  initialNotice: string;
}): UIApi {
  let refs: UIRefs;
  const dialogs: DialogManager = createDialogManager();
  const toasts: ToastManager = createToastManager();
  const recentAlerts: RoutineAlert[] = [];
  const queuedAlarms: RoutineAlert[] = [];
  let activeView = "today";
  let activeAlarmKey: string | null = null;
  let editingRoutineId: string | null = null;
  let isMainMenuOpen = false;
  let selectedDevices = new Set<string>();

  function init(): void {
    refs = bindRefs();
    bindEvents();
    renderStaticOptions();
    setView(activeView);
    resetRoutineForm();
    if (initialNotice) {
      refs.storageStatus.textContent = initialNotice;
    }
    render();
  }

  function bindRefs(): UIRefs {
    return {
      mainMenuButton: qs("#main-menu-button"),
      mainMenuPanel: qs("#main-menu-panel"),
      mainMenuCurrent: qs("#main-menu-current"),
      navButtons: qsa<HTMLButtonElement>(".nav-button"),
      views: qsa<HTMLElement>(".view"),
      todayLabel: qs("#today-label"),
      storageStatus: qs("#storage-status"),
      todayMetrics: qs("#today-metrics"),
      undoDeleteButton: qs("#undo-delete-button"),
      routineFormPanel: qs("#routine-form-panel"),
      routineForm: qs("#routine-form"),
      routineFormTitle: qs("#routine-form-title"),
      routineFormModeLabel: qs("#routine-form-mode-label"),
      routineId: qs("#routine-id"),
      routineWeekday: qs("#routine-weekday"),
      routineStartTime: qs("#routine-start-time"),
      routineEndTime: qs("#routine-end-time"),
      routineSubject: qs("#routine-subject"),
      routineTeacher: qs("#routine-teacher"),
      routineRoom: qs("#routine-room"),
      routineStudentCount: qs("#routine-student-count"),
      routineDevices: qs("#routine-devices"),
      routineNewDevice: qs("#routine-new-device"),
      routineNotes: qs("#routine-notes"),
      routineNotificationEnabled: qs("#routine-notification-enabled"),
      routineLeadMode: qs("#routine-lead-mode"),
      routineCustomLeadWrap: qs("#routine-custom-lead-wrap"),
      routineCustomLead: qs("#routine-custom-lead"),
      routineFeedback: qs("#routine-form-feedback"),
      saveRoutineButton: qs("#save-routine-button span"),
      clearRoutineForm: qs("#clear-routine-form"),
      addDeviceToRoutine: qs("#add-device-to-routine"),
      todaySummary: qs("#today-summary"),
      todayRoutines: qs("#today-routines"),
      requestNotificationButton: qs("#request-notification-button"),
      weekRoutines: qs("#week-routines"),
      routineFilter: qs("#routine-filter"),
      routineSort: qs("#routine-sort"),
      filterTimeStart: qs("#filter-time-start"),
      filterTimeEnd: qs("#filter-time-end"),
      filterTeacher: qs("#filter-teacher"),
      filterRoom: qs("#filter-room"),
      filterResultsCount: qs("#filter-results-count"),
      filterClearAll: qs("#filter-clear-all"),
      teachersDatalist: qs("#teachers-list"),
      roomsDatalist: qs("#rooms-list"),
      subjectsDatalist: qs("#subjects-list"),
      teacherForm: qs("#teacher-form"),
      teacherId: qs("#teacher-id"),
      teacherName: qs("#teacher-name"),
      teacherFeedback: qs("#teacher-feedback"),
      teachersListPanel: qs("#teachers-list-panel"),
      roomForm: qs("#room-form"),
      roomId: qs("#room-id"),
      roomName: qs("#room-name"),
      roomStudentCount: qs("#room-student-count"),
      roomFeedback: qs("#room-feedback"),
      roomsListPanel: qs("#rooms-list-panel"),
      deviceForm: qs("#device-form"),
      deviceId: qs("#device-id"),
      deviceName: qs("#device-name"),
      deviceFeedback: qs("#device-feedback"),
      devicesListPanel: qs("#devices-list-panel"),
      settingsForm: qs("#settings-form"),
      settingsNotificationsEnabled: qs("#settings-notifications-enabled"),
      settingsDefaultLead: qs("#settings-default-lead"),
      settingsCustomLeadWrap: qs("#settings-custom-lead-wrap"),
      settingsCustomLead: qs("#settings-custom-lead"),
      settingsSoundEnabled: qs("#settings-sound-enabled"),
      settingsFeedback: qs("#settings-feedback"),
      exportDataButton: qs("#export-data-button"),
      importDataFile: qs("#import-data-file"),
      resetDataButton: qs("#reset-data-button"),
      alertList: qs("#alert-list"),
      clearAlertsButton: qs("#clear-alerts-button"),
      alertDock: qs(".alert-dock"),
    };
  }

  function bindEvents(): void {
    refs.mainMenuButton.addEventListener("click", toggleMainMenu);

    refs.navButtons.forEach((button) => {
      button.addEventListener("click", () => {
        setView(button.dataset.view ?? "today");
        closeMainMenu({ focusButton: true });
      });
    });

    document.addEventListener("click", closeMainMenuOnOutsideClick);
    document.addEventListener("keydown", closeMainMenuOnEscape);

    refs.routineForm.addEventListener("submit", handleRoutineSubmit);
    refs.clearRoutineForm.addEventListener("click", () => {
      resetRoutineForm();
      render();
    });
    refs.addDeviceToRoutine.addEventListener("click", addDeviceFromRoutineInput);
    refs.routineLeadMode.addEventListener("change", renderRoutineLeadMode);
    refs.routineRoom.addEventListener("change", fillStudentCountFromRoom);

    refs.requestNotificationButton.addEventListener("click", requestNotificationAccess);

    refs.routineFilter.addEventListener("input", () => {
      actions.updateUiFilters({ filterText: refs.routineFilter.value });
      applyWeekFilters();
    });
    refs.routineSort.addEventListener("change", () => {
      actions.updateUiFilters({ sortBy: refs.routineSort.value as AppState["settings"]["sortBy"] });
      applyWeekFilters();
    });
    qsa<HTMLInputElement>("#filter-weekday-chips input").forEach((cb) =>
      cb.addEventListener("change", applyWeekFilters),
    );
    refs.filterTimeStart.addEventListener("change", applyWeekFilters);
    refs.filterTimeEnd.addEventListener("change", applyWeekFilters);
    refs.filterTeacher.addEventListener("change", applyWeekFilters);
    refs.filterRoom.addEventListener("change", applyWeekFilters);
    qsa<HTMLInputElement>("#filter-device-chips input").forEach((cb) =>
      cb.addEventListener("change", applyWeekFilters),
    );
    refs.filterClearAll.addEventListener("click", clearAllFilters);

    refs.teacherForm.addEventListener("submit", handleTeacherSubmit);
    refs.roomForm.addEventListener("submit", handleRoomSubmit);
    refs.deviceForm.addEventListener("submit", handleDeviceSubmit);

    refs.settingsForm.addEventListener("submit", handleSettingsSubmit);
    refs.settingsDefaultLead.addEventListener("change", renderSettingsLeadMode);
    refs.exportDataButton.addEventListener("click", handleExport);
    refs.importDataFile.addEventListener("change", handleImport);
    refs.resetDataButton.addEventListener("click", handleResetData);
    refs.undoDeleteButton.addEventListener("click", () => {
      const result = actions.undoDeleteRoutine();
      showResult(result, refs.routineFeedback, "Exclusão desfeita.");
      render();
    });

    refs.clearAlertsButton.addEventListener("click", () => {
      recentAlerts.length = 0;
      renderAlerts();
    });
  }

  function renderStaticOptions(): void {
    replaceChildren(
      refs.routineWeekday,
      WEEKDAYS.map((day) => option(day.id, day.label)),
    );
    replaceChildren(
      refs.routineSort,
      SORT_OPTIONS.map((item) => option(item.value, item.label)),
    );
  }

  function render(): void {
    const state = getState();
    const todayId = getTodayWeekdayId();
    const today = todayId ? getWeekdayLabel(todayId) : "Fim de semana";

    refs.todayLabel.textContent = `Hoje: ${today}`;
    refs.undoDeleteButton.hidden = !actions.canUndoDeleteRoutine();
    refs.routineFilter.value = state.settings.filterText;
    refs.routineSort.value = state.settings.sortBy;

    renderTodayMetrics();
    renderDatalists();
    renderRoutineDevices();
    renderToday();
    renderWeek();
    renderCatalogs();
    renderSettings();
    renderNotificationStatus();
    renderAlerts();
    refreshIcons();
  }

  function setView(viewId: string): void {
    activeView = viewId;

    refs.navButtons.forEach((button) => {
      const isCurrent = button.dataset.view === viewId;
      button.classList.toggle("is-active", isCurrent);
      if (isCurrent) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    refs.views.forEach((view) => {
      view.classList.toggle("is-active", view.id === `view-${viewId}`);
    });

    renderMainMenuCurrent();
    refreshIcons();
  }

  function toggleMainMenu(): void {
    setMainMenuOpen(!isMainMenuOpen);
  }

  function setMainMenuOpen(isOpen: boolean): void {
    isMainMenuOpen = isOpen;
    refs.mainMenuButton.setAttribute("aria-expanded", String(isOpen));
    refs.mainMenuPanel.hidden = !isOpen;
  }

  function closeMainMenu({ focusButton = false }: { focusButton?: boolean } = {}): void {
    if (!isMainMenuOpen) return;
    setMainMenuOpen(false);
    if (focusButton) {
      refs.mainMenuButton.focus();
    }
  }

  function closeMainMenuOnOutsideClick(event: MouseEvent): void {
    if (!isMainMenuOpen || !(event.target instanceof Node)) return;
    if (refs.mainMenuButton.contains(event.target) || refs.mainMenuPanel.contains(event.target)) return;
    closeMainMenu();
  }

  function closeMainMenuOnEscape(event: KeyboardEvent): void {
    if (!isMainMenuOpen || event.key !== "Escape") return;
    event.preventDefault();
    closeMainMenu({ focusButton: true });
  }

  function renderMainMenuCurrent(): void {
    const label = NAVIGATION_LABELS[activeView] ?? "Menu";
    refs.mainMenuCurrent.textContent = label;
    refs.mainMenuButton.setAttribute("aria-label", `Abrir menu de navegação. Seção atual: ${label}.`);
  }

  function handleRoutineSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const payload = collectRoutinePayload();
    const result = editingRoutineId
      ? actions.updateRoutine(editingRoutineId, payload)
      : actions.addRoutine(payload);

    if (!result.ok) {
      showResult(result, refs.routineFeedback, "Rotina salva.", {
        errorTitle: "Revise a rotina",
      });
      return;
    }

    resetRoutineForm();
    showResult(result, refs.routineFeedback, "Rotina salva.", {
      successTitle: "Rotina salva",
    });
    refs.storageStatus.textContent = "Dados locais salvos.";
    render();
  }

  function collectRoutinePayload(): RoutinePayload {
    const extraDevice = normalizeText(refs.routineNewDevice.value);
    if (extraDevice) {
      selectedDevices.add(extraDevice);
    }

    let leadMinutes: string | null = null;
    if (refs.routineLeadMode.value === "custom") {
      leadMinutes = refs.routineCustomLead.value;
    } else if (refs.routineLeadMode.value !== "global") {
      leadMinutes = refs.routineLeadMode.value;
    }

    return {
      weekday: refs.routineWeekday.value,
      startTime: refs.routineStartTime.value,
      endTime: refs.routineEndTime.value,
      subject: refs.routineSubject.value,
      teacher: refs.routineTeacher.value,
      room: refs.routineRoom.value,
      studentCount: refs.routineStudentCount.value,
      devices: [...selectedDevices],
      notes: refs.routineNotes.value,
      notificationEnabled: refs.routineNotificationEnabled.checked,
      leadMinutes,
    };
  }

  function resetRoutineForm(): void {
    editingRoutineId = null;
    selectedDevices = new Set();
    refs.routineForm.reset();
    refs.routineId.value = "";
    refs.routineFormTitle.textContent = "Nova rotina";
    refs.routineFormModeLabel.textContent = "Cadastro rápido";
    refs.routineFormPanel.dataset.mode = "create";
    refs.routineWeekday.value = getTodayWeekdayId() ?? WEEKDAYS[0].id;
    refs.routineSubject.value = "";
    refs.routineNotificationEnabled.checked = true;
    refs.routineLeadMode.value = "global";
    refs.routineCustomLead.value = String(getState().settings.defaultLeadMinutes);
    refs.routineNewDevice.value = "";
    refs.saveRoutineButton.textContent = "Salvar rotina";
    setFeedback(refs.routineFeedback, "", "neutral");
    renderRoutineLeadMode();
    renderRoutineDevices();
  }

  function fillRoutineForm(routine: Routine): void {
    editingRoutineId = routine.id;
    selectedDevices = new Set(routine.devices);
    refs.routineFormTitle.textContent = "Editar rotina";
    refs.routineFormModeLabel.textContent = "Atualizando cadastro";
    refs.routineFormPanel.dataset.mode = "edit";
    refs.routineId.value = routine.id;
    refs.routineWeekday.value = routine.weekday;
    refs.routineStartTime.value = routine.startTime;
    refs.routineEndTime.value = routine.endTime;
    refs.routineSubject.value = routine.subject;
    refs.routineTeacher.value = routine.teacher;
    refs.routineRoom.value = routine.room;
    refs.routineStudentCount.value = String(routine.studentCount);
    refs.routineNotes.value = routine.notes;
    refs.routineNotificationEnabled.checked = routine.notificationEnabled;

    if (routine.leadMinutes === null || routine.leadMinutes === undefined) {
      refs.routineLeadMode.value = "global";
    } else if ([5, 10, 15, 20, 30].includes(routine.leadMinutes)) {
      refs.routineLeadMode.value = String(routine.leadMinutes);
    } else {
      refs.routineLeadMode.value = "custom";
      refs.routineCustomLead.value = String(routine.leadMinutes);
    }

    refs.saveRoutineButton.textContent = "Atualizar rotina";
    setView("today");
    renderRoutineLeadMode();
    renderRoutineDevices();
    refs.routineForm.scrollIntoView({ behavior: "smooth", block: "start" });
    refs.routineStartTime.focus();
  }

  function startNewRoutine(): void {
    resetRoutineForm();
    setView("today");
    refs.routineFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    refs.routineStartTime.focus();
  }

  function renderRoutineLeadMode(): void {
    refs.routineCustomLeadWrap.classList.toggle("is-hidden", refs.routineLeadMode.value !== "custom");
  }

  function renderSettingsLeadMode(): void {
    refs.settingsCustomLeadWrap.classList.toggle("is-hidden", refs.settingsDefaultLead.value !== "custom");
  }

  async function requestNotificationAccess(): Promise<void> {
    const settings = getState().settings;
    const updateResult = actions.updateSettings({
      notificationsEnabled: true,
      defaultLeadMinutes: settings.defaultLeadMinutes,
      soundEnabled: settings.soundEnabled,
    });
    if (!updateResult.ok) {
      showResult(updateResult, refs.settingsFeedback, "Alertas visuais ativados.");
      render();
      return;
    }

    const result = await notifications.requestPermission();
    if (!result.ok) {
      setFeedback(refs.settingsFeedback, result.message, "success");
      toasts.show({
        type: "warning",
        title: "Alertas visuais ativos",
        message: result.message,
      });
      render();
      return;
    }

    setFeedback(refs.settingsFeedback, result.message, "success");
    toasts.show({
      type: "success",
      title: "Notificações do navegador ativas",
      message: result.message,
      timeout: 3600,
    });
    render();
  }

  function addDeviceFromRoutineInput(): void {
    const name = normalizeText(refs.routineNewDevice.value);
    if (!name) return;
    selectedDevices.add(name);
    refs.routineNewDevice.value = "";
    renderRoutineDevices();
  }

  function renderRoutineDevices(): void {
    const state = getState();
    const deviceNames = [...state.devices.map((device) => device.name), ...selectedDevices];

    replaceChildren(
      refs.routineDevices,
      [...new Set(deviceNames)].map((name) => {
        const id = `routine-device-${slug(name)}`;
        const input = el("input", {
          attrs: {
            id,
            type: "checkbox",
            value: name,
          },
        });
        input.checked = selectedDevices.has(name);
        input.addEventListener("change", () => {
          if (input.checked) selectedDevices.add(name);
          else selectedDevices.delete(name);
        });

        return el("label", { className: "check-pill" }, [input, span(name)]);
      }),
    );
  }

  function renderDatalists(): void {
    const state = getState();
    replaceChildren(
      refs.teachersDatalist,
      state.teachers.map((teacher) => option(teacher.name, teacher.name)),
    );
    replaceChildren(
      refs.roomsDatalist,
      state.rooms.map((room) => option(room.name, room.name)),
    );
    replaceChildren(
      refs.subjectsDatalist,
      uniqueRoutineSubjects(state.routines).map((subject) => option(subject, subject)),
    );
  }

  function fillStudentCountFromRoom(): void {
    const room = getState().rooms.find((item) => item.name === refs.routineRoom.value);
    if (room?.studentCount && !refs.routineStudentCount.value) {
      refs.routineStudentCount.value = String(room.studentCount);
    }
  }

  function renderToday(): void {
    const state = getState();
    const todayId = getTodayWeekdayId();

    if (!todayId) {
      refs.todaySummary.textContent = "Sábado e domingo ficam fora da rotina padrão.";
      replaceChildren(refs.todayRoutines, [todayEmptyState("Sem rotina de dia útil para hoje.")]);
      return;
    }

    const todayRoutines = sortRoutines(
      state.routines.filter((routine) => routine.weekday === todayId),
      "time",
    );
    const currentMinutes = getCurrentMinutes();
    const pendingRoutines = todayRoutines.filter((routine) => isRoutinePendingOrActive(routine, currentMinutes));
    const visibleGroups = getVisibleSmartTodayRoutineGroups(todayRoutines, currentMinutes);

    refs.todaySummary.textContent = todaySummaryText(todayRoutines.length, pendingRoutines, visibleGroups, currentMinutes);

    replaceChildren(
      refs.todayRoutines,
      visibleGroups.length
        ? visibleGroups.map((group) => smartRoutineCard(group))
        : [todayEmptyState(todayRoutines.length ? "Nenhuma retirada pendente para hoje." : "Nenhuma rotina cadastrada para hoje.")],
    );
  }

  function renderTodayMetrics(): void {
    const state = getState();
    const todayId = getTodayWeekdayId();
    const todayRoutines = todayId
      ? sortRoutines(
          state.routines.filter((routine) => routine.weekday === todayId),
          "time",
        )
      : [];
    const currentMinutes = getCurrentMinutes();
    const pendingRoutines = todayRoutines.filter((routine) => isRoutinePendingOrActive(routine, currentMinutes));
    const activeRoutine = pendingRoutines.find((routine) => isRoutineActiveNow(routine, currentMinutes));
    const nextRoutine = activeRoutine
      ? { ...activeRoutine, startTime: "Agora" }
      : pendingRoutines.find((routine) => (getRoutineStartMinutes(routine) ?? 0) >= currentMinutes);
    const activeAlerts = state.routines.filter((routine) => routine.notificationEnabled).length;

    replaceChildren(refs.todayMetrics, [
      metricItem("Hoje", pendingRoutines.length.toString(), pendingRoutines.length === 1 ? "pendente" : "pendentes"),
      metricItem("Próxima", nextRoutine ? nextRoutine.startTime : "Livre", nextRoutine ? nextRoutine.room : "sem pendência"),
      metricItem("Semana", state.routines.length.toString(), state.routines.length === 1 ? "rotina" : "rotinas"),
      metricItem("Alertas", activeAlerts.toString(), state.settings.notificationsEnabled ? "ativos" : "pausados"),
    ]);
  }

  function todaySummaryText(
    totalTodayRoutines: number,
    pendingRoutines: Routine[],
    visibleGroups: SmartRoutineGroup[],
    currentMinutes: number,
  ): string {
    if (pendingRoutines.length === 0) {
      return totalTodayRoutines > 0 ? "Nenhuma retirada pendente para hoje." : "Nenhuma rotina cadastrada para hoje.";
    }

    const activeNow = pendingRoutines.some((routine) => isRoutineActiveNow(routine, currentMinutes));
    const nextRoutine = pendingRoutines.find((routine) => {
      const startMinutes = getRoutineStartMinutes(routine);
      if (startMinutes === null) return false;
      return activeNow ? startMinutes > currentMinutes : startMinutes >= currentMinutes;
    });
    const cardsLabel =
      visibleGroups.length === 1 ? "1 card inteligente agora." : `${visibleGroups.length} cards inteligentes agora.`;
    const pendingLabel =
      pendingRoutines.length === 1 ? "1 retirada restante hoje." : `${pendingRoutines.length} retiradas restantes hoje.`;
    const nextLabel = activeNow
      ? nextRoutine
        ? `Há retirada em andamento. Próxima às ${nextRoutine.startTime}.`
        : "Há retirada em andamento."
      : nextRoutine
        ? `Próxima retirada às ${nextRoutine.startTime}.`
        : "";

    return [cardsLabel, pendingLabel, nextLabel].filter(Boolean).join(" ");
  }

  function renderWeek(): void {
    populateWeekFilters();
    applyWeekFilters();
  }

  function populateWeekFilters(): void {
    const state = getState();

    const prevTeacher = refs.filterTeacher.value;
    replaceChildren(refs.filterTeacher, [
      option("", "Todos"),
      ...state.teachers.map((t) => option(t.name, t.name)),
    ]);
    refs.filterTeacher.value = prevTeacher;

    const prevRoom = refs.filterRoom.value;
    replaceChildren(refs.filterRoom, [
      option("", "Todas"),
      ...state.rooms.map((r) => option(r.name, r.name)),
    ]);
    refs.filterRoom.value = prevRoom;

    const startTimes = [...new Set(state.routines.map((r) => r.startTime))]
      .filter(Boolean)
      .sort();
    const prevStart = refs.filterTimeStart.value;
    replaceChildren(refs.filterTimeStart, [
      option("", "Início"),
      ...startTimes.map((t) => option(t, t)),
    ]);
    refs.filterTimeStart.value = prevStart;

    const endTimes = [...new Set(state.routines.map((r) => r.endTime))]
      .filter(Boolean)
      .sort();
    const prevEnd = refs.filterTimeEnd.value;
    replaceChildren(refs.filterTimeEnd, [
      option("", "Fim"),
      ...endTimes.map((t) => option(t, t)),
    ]);
    refs.filterTimeEnd.value = prevEnd;
  }

  function applyWeekFilters(): void {
    const state = getState();
    let routines = filterRoutines(state.routines, refs.routineFilter.value);

    const checkedDays = new Set(
      [...qsa<HTMLInputElement>("#filter-weekday-chips input:checked")].map((cb) => cb.value),
    );
    if (checkedDays.size > 0) {
      routines = routines.filter((r) => checkedDays.has(r.weekday));
    }

    if (refs.filterTimeStart.value) {
      routines = routines.filter((r) => r.startTime >= refs.filterTimeStart.value);
    }
    if (refs.filterTimeEnd.value) {
      routines = routines.filter((r) => !r.endTime || r.endTime <= refs.filterTimeEnd.value);
    }

    if (refs.filterTeacher.value) {
      routines = routines.filter((r) => r.teacher === refs.filterTeacher.value);
    }

    if (refs.filterRoom.value) {
      routines = routines.filter((r) => r.room === refs.filterRoom.value);
    }

    const checkedDevices = new Set(
      [...qsa<HTMLInputElement>("#filter-device-chips input:checked")].map((cb) => cb.value),
    );
    if (checkedDevices.size > 0) {
      routines = routines.filter((r) => r.devices.some((d) => checkedDevices.has(d)));
    }

    const sorted = sortRoutines(routines, state.settings.sortBy);
    const schedule = buildWeekSchedule(sorted, state.devices);
    const routineById = new Map(sorted.map((r) => [r.id, r]));

    replaceChildren(
      refs.weekRoutines,
      schedule.sections.length
        ? schedule.sections.map((section) => renderEquipmentSection(section, routineById))
        : [weeklyScheduleEmptyState()],
    );

    const total = state.routines.length;
    const shown = routines.length;
    refs.filterResultsCount.textContent =
      shown < total
        ? `${shown} de ${total} rotina${total !== 1 ? "s" : ""}`
        : `${total} rotina${total !== 1 ? "s" : ""}`;

    const hasFilters =
      !!refs.routineFilter.value ||
      checkedDays.size > 0 ||
      !!refs.filterTimeStart.value ||
      !!refs.filterTimeEnd.value ||
      !!refs.filterTeacher.value ||
      !!refs.filterRoom.value ||
      checkedDevices.size > 0;
    refs.filterClearAll.hidden = !hasFilters;
    refreshIcons(refs.weekRoutines);
  }

  function clearAllFilters(): void {
    refs.routineFilter.value = "";
    actions.updateUiFilters({ filterText: "" });
    qsa<HTMLInputElement>("#filter-weekday-chips input").forEach((cb) => {
      cb.checked = false;
    });
    refs.filterTimeStart.value = "";
    refs.filterTimeEnd.value = "";
    refs.filterTeacher.value = "";
    refs.filterRoom.value = "";
    qsa<HTMLInputElement>("#filter-device-chips input").forEach((cb) => {
      cb.checked = false;
    });
    applyWeekFilters();
  }

  function renderEquipmentSection(section: WeekScheduleSection, routineById: Map<string, Routine>): HTMLElement {
    const titleId = `schedule-equipment-${slug(section.deviceName)}`;

    return el("section", { className: "equipment-section", attrs: { "aria-labelledby": titleId } }, [
      el("header", { className: "equipment-section-header" }, [
        el("div", {}, [
          el("span", { className: "equipment-kicker", text: "Equipamento" }),
          el("h3", { text: section.deviceName, attrs: { id: titleId } }),
        ]),
        el("span", {
          className: "equipment-count",
          text: section.routineCount === 1 ? "1 reserva" : `${section.routineCount} reservas`,
        }),
      ]),
      el("div", { className: "schedule-table-wrap" }, [
        el("table", { className: "schedule-table" }, [
          renderScheduleColgroup(),
          renderScheduleHead(),
          el(
            "tbody",
            {},
            section.rows.map((row) =>
              el("tr", {}, [
                el("th", { className: "schedule-time-cell", text: row.timeLabel, attrs: { scope: "row" } }),
                ...row.cells.flatMap((cell) => renderScheduleDayCells(cell, routineById)),
              ]),
            ),
          ),
        ]),
      ]),
    ]);
  }

  function renderScheduleColgroup(): HTMLTableColElement {
    return el("colgroup", {}, [
      el("col", { className: "schedule-time-col" }),
      ...WEEKDAYS.flatMap(() => [
        el("col", { className: "schedule-room-col" }),
        el("col", { className: "schedule-teacher-col" }),
      ]),
    ]);
  }

  function renderScheduleHead(): HTMLTableSectionElement {
    return el("thead", {}, [
      el("tr", {}, [
        el("th", {
          className: "schedule-time-header",
          text: "Horário",
          attrs: { scope: "col", rowspan: "2" },
        }),
        ...WEEKDAYS.map((day) =>
          el("th", {
            className: "schedule-day-header",
            text: day.label,
            attrs: { scope: "colgroup", colspan: "2" },
          }),
        ),
      ]),
      el(
        "tr",
        {},
        WEEKDAYS.flatMap(() => [
          el("th", { className: "schedule-subheader", text: "Sala/Turma", attrs: { scope: "col" } }),
          el("th", { className: "schedule-subheader", text: "Professor", attrs: { scope: "col" } }),
        ]),
      ),
    ]);
  }

  function renderScheduleDayCells(cell: WeekScheduleCell, routineById: Map<string, Routine>): HTMLTableCellElement[] {
    return [
      el(
        "td",
        { className: cell.entries.length ? "schedule-cell schedule-room-cell" : "schedule-cell schedule-room-cell is-empty" },
        cell.entries.length ? cell.entries.map(renderRoomEntry) : [span("")],
      ),
      el(
        "td",
        { className: cell.entries.length ? "schedule-cell schedule-teacher-cell" : "schedule-cell schedule-teacher-cell is-empty" },
        cell.entries.length ? cell.entries.map((entry) => renderTeacherEntry(entry, routineById)) : [span("")],
      ),
    ];
  }

  function renderRoomEntry(entry: WeekScheduleEntry): HTMLElement {
    return el("div", { className: "schedule-cell-entry" }, [
      el("strong", { text: entry.room }),
      el("small", { text: `${entry.studentCount} aluno(s)` }),
    ]);
  }

  function renderTeacherEntry(entry: WeekScheduleEntry, routineById: Map<string, Routine>): HTMLElement {
    const routine = routineById.get(entry.routineId);
    const notes = entry.notes === IMPORTED_FIXED_EQUIPMENT_NOTE ? "" : entry.notes;

    return el("div", { className: "schedule-cell-entry schedule-teacher-entry" }, [
      el("strong", { text: entry.teacher }),
      entry.subject ? el("small", { text: `Aula: ${entry.subject}` }) : null,
      notes ? el("small", { text: notes }) : null,
      routine ? scheduleEntryActions(routine) : null,
    ]);
  }

  function scheduleEntryActions(routine: Routine): HTMLElement {
    const copyButton = iconButton("copy", "Duplicar reserva", () => duplicateRoutine(routine));
    const editButton = iconButton("pencil", "Editar reserva", () => fillRoutineForm(routine));
    const deleteButton = iconButton("trash-2", "Excluir reserva", () => confirmDeleteRoutine(routine), "danger");

    return el("div", { className: "schedule-entry-actions" }, [copyButton, editButton, deleteButton]);
  }

  function weeklyScheduleEmptyState(): HTMLElement {
    return el("div", { className: "weekly-schedule-empty" }, [
      el("strong", { text: "Nenhuma reserva encontrada." }),
      el("span", { text: "Ajuste o filtro ou cadastre uma rotina para montar a matriz semanal por equipamento." }),
    ]);
  }

  function duplicateRoutine(routine: Routine): void {
    const result = actions.duplicateRoutine(routine.id);
    showResult(result, refs.routineFeedback, "Rotina duplicada.");
    render();
  }

  async function confirmDeleteRoutine(routine: Routine): Promise<void> {
    const confirmed = await dialogs.dangerConfirm({
      title: "Excluir rotina?",
      message:
        "A rotina será removida da agenda. Você ainda poderá usar Desfazer logo após a exclusão.",
      confirmLabel: "Excluir",
    });
    if (!confirmed) return;

    const result = actions.deleteRoutine(routine.id);
    showResult(result, refs.routineFeedback, "Rotina excluída.");
    render();
  }

  function smartRoutineCard(group: SmartRoutineGroup): HTMLElement {
    if (group.routines.length === 1) {
      return routineCard(group.representative);
    }

    const routine = group.representative;
    const leadLabel = routineLeadLabel(routine);
    const groupedLabel =
      group.routines.length === 2 ? "2 retiradas agrupadas" : `${group.routines.length} horários agrupados`;

    return el(
      "article",
      { className: "routine-card routine-card-smart" },
      [
        el("div", { className: "routine-card-top" }, [
          el("div", {}, [
            el("strong", { className: "routine-time", text: group.timeLabel }),
            el("span", { className: "routine-day", text: getWeekdayLabel(routine.weekday) }),
          ]),
          el("div", { className: "routine-group-status" }, [
            el("span", { className: "routine-group-badge", text: "Agrupado" }),
          ]),
        ]),
        detailLine("user", routine.teacher),
        routine.subject ? detailLine("book-open-check", `Aula: ${routine.subject}`) : null,
        detailLine("map-pin", routine.room),
        detailLine("users", `${routine.studentCount} aluno(s)`),
        detailLine("laptop", routine.devices.join(", ")),
        routine.notes ? detailLine("file-text", routine.notes) : null,
        el("div", { className: "routine-meta" }, [
          el("span", { text: routine.notificationEnabled ? `Alerta ${leadLabel}` : "Alerta desativado" }),
          el("span", { text: groupedLabel }),
          el("span", { text: `Atualizado: ${formatDateTime(latestRoutineUpdatedAt(group.routines))}` }),
        ]),
        el("p", { className: "routine-group-note" }, [
          icon("info"),
          span("Use a Rotina semanal para editar horários individuais."),
        ]),
      ].filter(Boolean),
    );
  }

  function routineCard(routine: Routine): HTMLElement {
    const title = `${routine.startTime}${routine.endTime ? `-${routine.endTime}` : ""}`;
    const leadLabel =
      routine.leadMinutes === null || routine.leadMinutes === undefined
        ? `Global: ${getState().settings.defaultLeadMinutes} min`
        : `${routine.leadMinutes} min`;

    return el(
      "article",
      { className: "routine-card" },
      [
        el("div", { className: "routine-card-top" }, [
          el("div", {}, [
            el("strong", { className: "routine-time", text: title }),
            el("span", { className: "routine-day", text: getWeekdayLabel(routine.weekday) }),
          ]),
          el("div", { className: "routine-actions" }, [
            actionButton("copy", "Duplicar", "Duplicar rotina", () => duplicateRoutine(routine)),
            actionButton("pencil", "Editar", "Editar rotina", () => fillRoutineForm(routine)),
            actionButton(
              "trash-2",
              "Excluir",
              "Excluir rotina",
              async () => {
                const confirmed = await dialogs.dangerConfirm({
                  title: "Excluir rotina?",
                  message:
                    "A rotina será removida da agenda. Você ainda poderá usar Desfazer logo após a exclusão.",
                  confirmLabel: "Excluir",
                });
                if (!confirmed) return;

                const result = actions.deleteRoutine(routine.id);
                showResult(result, refs.routineFeedback, "Rotina excluída.");
                render();
              },
              "danger",
            ),
          ]),
        ]),
        detailLine("user", routine.teacher),
        routine.subject ? detailLine("book-open-check", `Aula: ${routine.subject}`) : null,
        detailLine("map-pin", routine.room),
        detailLine("users", `${routine.studentCount} aluno(s)`),
        detailLine("laptop", routine.devices.join(", ")),
        routine.notes ? detailLine("file-text", routine.notes) : null,
        el("div", { className: "routine-meta" }, [
          el("span", { text: routine.notificationEnabled ? `Alerta ${leadLabel}` : "Alerta desativado" }),
          el("span", { text: `Atualizado: ${formatDateTime(routine.updatedAt)}` }),
        ]),
      ].filter(Boolean),
    );
  }

  function routineLeadLabel(routine: Routine): string {
    return routine.leadMinutes === null || routine.leadMinutes === undefined
      ? `Global: ${getState().settings.defaultLeadMinutes} min`
      : `${routine.leadMinutes} min`;
  }

  function latestRoutineUpdatedAt(routines: Routine[]): string {
    return routines.reduce((latest, routine) => (routine.updatedAt > latest ? routine.updatedAt : latest), routines[0]?.updatedAt ?? "");
  }

  function renderCatalogs(): void {
    const state = getState();
    renderCatalogList("teachers", state.teachers, refs.teachersListPanel);
    renderCatalogList("rooms", state.rooms, refs.roomsListPanel);
    renderCatalogList("devices", state.devices, refs.devicesListPanel);
  }

  function renderCatalogList(kind: CatalogKind, items: AppState[CatalogKind], container: HTMLElement): void {
    if (!items.length) {
      replaceChildren(container, [emptyState("Nenhum cadastro ainda.")]);
      return;
    }

    replaceChildren(
      container,
      items.map((item) => {
        const caption =
          kind === "rooms" && "studentCount" in item && item.studentCount
            ? `${item.studentCount} aluno(s) padrão`
            : countUsage(kind, item.name);

        return el("article", { className: "catalog-item" }, [
          el("div", {}, [el("strong", { text: item.name }), el("span", { text: caption })]),
          el("div", { className: "routine-actions" }, [
            iconButton("pencil", "Editar", () => startCatalogEdit(kind, item)),
            iconButton(
              "trash-2",
              "Excluir",
              async () => {
                const confirmed = await dialogs.dangerConfirm({
                  title: "Excluir cadastro?",
                  message: "As rotinas já salvas continuarão com o texto atual. Apenas o item do catálogo será removido.",
                  confirmLabel: "Excluir",
                });
                if (!confirmed) return;

                const result = actions.deleteCatalogItem(kind, item.id);
                showCatalogResult(kind, result, "Cadastro excluído.");
                render();
              },
              "danger",
            ),
          ]),
        ]);
      }),
    );
  }

  function countUsage(kind: CatalogKind, name: string): string {
    const count = getState().routines.filter((routine) => {
      if (kind === "teachers") return routine.teacher === name;
      if (kind === "rooms") return routine.room === name;
      return routine.devices.includes(name);
    }).length;

    return count === 1 ? "Usado em 1 rotina" : `Usado em ${count} rotinas`;
  }

  function startCatalogEdit(kind: CatalogKind, item: AppState[CatalogKind][number]): void {
    if (kind === "teachers") {
      refs.teacherId.value = item.id;
      refs.teacherName.value = item.name;
      refs.teacherName.focus();
      return;
    }

    if (kind === "rooms") {
      refs.roomId.value = item.id;
      refs.roomName.value = item.name;
      refs.roomStudentCount.value = "studentCount" in item && item.studentCount ? String(item.studentCount) : "";
      refs.roomName.focus();
      return;
    }

    refs.deviceId.value = item.id;
    refs.deviceName.value = item.name;
    refs.deviceName.focus();
  }

  function handleTeacherSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const result = refs.teacherId.value
      ? actions.updateCatalogItem("teachers", refs.teacherId.value, { name: refs.teacherName.value })
      : actions.addCatalogItem("teachers", { name: refs.teacherName.value });

    showCatalogResult("teachers", result, "Professor salvo.");
    if (result.ok) refs.teacherForm.reset();
    render();
  }

  function handleRoomSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const payload = { name: refs.roomName.value, studentCount: refs.roomStudentCount.value };
    const result = refs.roomId.value
      ? actions.updateCatalogItem("rooms", refs.roomId.value, payload)
      : actions.addCatalogItem("rooms", payload);

    showCatalogResult("rooms", result, "Sala salva.");
    if (result.ok) refs.roomForm.reset();
    render();
  }

  function handleDeviceSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const result = refs.deviceId.value
      ? actions.updateCatalogItem("devices", refs.deviceId.value, { name: refs.deviceName.value })
      : actions.addCatalogItem("devices", { name: refs.deviceName.value });

    showCatalogResult("devices", result, "Dispositivo salvo.");
    if (result.ok) refs.deviceForm.reset();
    render();
  }

  function showCatalogResult(kind: CatalogKind, result: EmptyResult, successMessage: string): void {
    const feedback = {
      teachers: refs.teacherFeedback,
      rooms: refs.roomFeedback,
      devices: refs.deviceFeedback,
    }[kind];
    showResult(result, feedback, successMessage);
  }

  function renderSettings(): void {
    const settings = getState().settings;
    refs.settingsNotificationsEnabled.checked = settings.notificationsEnabled;
    refs.settingsSoundEnabled.checked = settings.soundEnabled;

    if ([5, 10, 15, 20, 30].includes(settings.defaultLeadMinutes)) {
      refs.settingsDefaultLead.value = String(settings.defaultLeadMinutes);
    } else {
      refs.settingsDefaultLead.value = "custom";
      refs.settingsCustomLead.value = String(settings.defaultLeadMinutes);
    }

    renderSettingsLeadMode();
  }

  async function handleSettingsSubmit(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const defaultLeadMinutes =
      refs.settingsDefaultLead.value === "custom" ? refs.settingsCustomLead.value : refs.settingsDefaultLead.value;
    const wantsNotifications = refs.settingsNotificationsEnabled.checked;
    const result = actions.updateSettings({
      notificationsEnabled: wantsNotifications,
      defaultLeadMinutes,
      soundEnabled: refs.settingsSoundEnabled.checked,
    });

    showResult(result, refs.settingsFeedback, "Configurações salvas.");
    if (result.ok && wantsNotifications && notifications.getStatus().type === "pending") {
      const permission = await notifications.requestPermission();
      if (!permission.ok) {
        setFeedback(refs.settingsFeedback, permission.message, "success");
        toasts.show({
          type: "warning",
          title: "Alertas visuais ativos",
          message: permission.message,
        });
      }
    }
    render();
  }

  function handleExport(): void {
    const blob = new Blob([actions.exportData()], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `kickoff-proati-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function handleImport(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : refs.importDataFile;
    const [file] = input.files ?? [];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      const confirmed = await dialogs.confirm({
        tone: "warning",
        title: "Importar dados?",
        message: "A importação substituirá as rotinas, catálogos e configurações locais deste navegador.",
        confirmLabel: "Importar",
      });
      if (!confirmed) {
        input.value = "";
        return;
      }

      const result = actions.importData(String(reader.result ?? ""));
      showResult(result, refs.settingsFeedback, "Dados importados.");
      input.value = "";
      render();
    });
    reader.addEventListener("error", () => {
      showResult(
        { ok: false, errors: ["Não foi possível ler o arquivo selecionado."] },
        refs.settingsFeedback,
        "Dados importados.",
      );
      input.value = "";
    });
    reader.readAsText(file);
  }

  async function handleResetData(): Promise<void> {
    const confirmed = await dialogs.textConfirm({
      title: "Apagar dados locais?",
      message: "Esta ação remove todas as rotinas, professores, salas, dispositivos e configurações salvas neste navegador.",
      expectedText: "APAGAR",
      confirmLabel: "Apagar dados",
    });
    if (!confirmed) return;

    const result = actions.resetData();
    showResult(result, refs.settingsFeedback, "Dados locais apagados.");
    resetRoutineForm();
    render();
  }

  function renderNotificationStatus(): void {
    const status = notifications.getStatus();
    const isActive = status.type === "enabled" || status.type === "unsupported";
    const buttonLabel = refs.requestNotificationButton.querySelector("span");
    refs.requestNotificationButton.hidden = isActive;
    refs.requestNotificationButton.title = status.label;
    refs.requestNotificationButton.dataset.status = status.type;
    if (buttonLabel) {
      buttonLabel.textContent =
        status.type === "denied"
          ? "Permissão bloqueada"
          : status.type === "disabled"
            ? "Alertas pausados"
            : "Permitir navegador";
    }
  }

  function addAlert(alert: RoutineAlert): void {
    if (!recentAlerts.some((item) => item.key === alert.key)) {
      recentAlerts.unshift(alert);
    }
    recentAlerts.splice(5);
    renderAlerts();
    toasts.show({
      type: alert.type === "exact" ? "alarm" : "warning",
      title: alert.title,
      message: alert.body,
      timeout: alert.type === "exact" ? 9000 : 6200,
    });
  }

  async function showAlarm(alert: RoutineAlert): Promise<void> {
    if (activeAlarmKey === alert.key || queuedAlarms.some((item) => item.key === alert.key)) {
      return;
    }

    queuedAlarms.push(alert);
    await drainAlarmQueue();
  }

  async function drainAlarmQueue(): Promise<void> {
    if (activeAlarmKey) return;
    const alert = queuedAlarms.shift();
    if (!alert) return;

    activeAlarmKey = alert.key;
    addAlert(alert);
    try {
      await dialogs.alarm({
        kicker: "Alarme PROATI",
        title: alert.title,
        message: alert.body,
        details: alert.details,
        confirmLabel: "Confirmar",
        cancelLabel: "Fechar",
      });
    } finally {
      notifications.acknowledgeAlert(alert.key);
      activeAlarmKey = null;
      void drainAlarmQueue();
    }
  }

  function showToast(payload: ToastPayload): void {
    toasts.show(payload);
  }

  function renderAlerts(): void {
    replaceChildren(
      refs.alertList,
      recentAlerts.length
        ? recentAlerts.map((alert) =>
            el("article", { className: "alert-item" }, [
              el("strong", { text: alert.title }),
              el("span", { text: alert.body }),
              el("small", { text: formatDateTime(alert.createdAt) }),
            ]),
          )
        : [emptyState("Nenhum alerta recente.")],
    );
    refs.alertDock.classList.toggle("is-quiet", recentAlerts.length === 0);
  }

  function todayEmptyState(message: string): HTMLElement {
    const button = el(
      "button",
      {
        className: "button button-primary button-small",
        attrs: { type: "button" },
      },
      [icon("plus"), span("Cadastrar rotina")],
    );
    button.addEventListener("click", startNewRoutine);

    return el("div", { className: "empty-state empty-state-action" }, [
      el("strong", { text: message }),
      el("span", {
        text: "Cadastre horários, professor, sala, alunos e dispositivos para não depender de papel.",
      }),
      button,
    ]);
  }

  function showResult(
    result: EmptyResult,
    feedbackNode: HTMLElement,
    successMessage: string,
    options: { errorTitle?: string; successTitle?: string } = {},
  ): void {
    if (!result.ok) {
      const message = errorText(result);
      setFeedback(feedbackNode, message, "error");
      toasts.show({
        type: "error",
        title: options.errorTitle ?? "Ação não concluída",
        message,
        timeout: 6800,
      });
      return;
    }
    setFeedback(feedbackNode, successMessage, "success");
    toasts.show({
      type: "success",
      title: options.successTitle ?? "Tudo certo",
      message: successMessage,
      timeout: 3600,
    });
    refs.storageStatus.textContent = "Dados locais salvos.";
  }

  function setFeedback(node: HTMLElement, message: string, type: string): void {
    node.textContent = message;
    node.dataset.type = type;
  }

  function detailLine(iconName: string, text: string): HTMLElement {
    return el("p", { className: "detail-line" }, [icon(iconName), span(text)]);
  }

  function uniqueRoutineSubjects(routines: Routine[]): string[] {
    const seen = new Set<string>();
    const subjects: string[] = [];

    routines.forEach((routine) => {
      const subject = normalizeText(routine.subject);
      const key = subject.toLocaleLowerCase("pt-BR");
      if (!subject || seen.has(key)) return;
      seen.add(key);
      subjects.push(subject);
    });

    return subjects.sort((a, b) => a.localeCompare(b, "pt-BR"));
  }

  function emptyState(message: string): HTMLElement {
    return el("div", { className: "empty-state", text: message });
  }

  return {
    init,
    render,
    addAlert,
    showAlarm,
    showToast,
    renderNotificationStatus,
  };
}

function iconButton(
  iconName: string,
  label: string,
  onClick: () => void | Promise<void>,
  variant = "neutral",
): HTMLButtonElement {
  const button = el(
    "button",
    {
      className: `icon-button${variant === "danger" ? " is-danger" : ""}`,
      attrs: {
        type: "button",
        "aria-label": label,
        title: label,
      },
    },
    [icon(iconName)],
  );
  button.addEventListener("click", () => void onClick());
  return button;
}

function actionButton(
  iconName: string,
  label: string,
  ariaLabel: string,
  onClick: () => void | Promise<void>,
  variant = "neutral",
): HTMLButtonElement {
  const button = el(
    "button",
    {
      className: `action-button${variant === "danger" ? " is-danger" : ""}`,
      attrs: {
        type: "button",
        "aria-label": ariaLabel,
        title: ariaLabel,
      },
    },
    [icon(iconName), span(label)],
  );
  button.addEventListener("click", () => void onClick());
  return button;
}

function metricItem(label: string, value: string, helper: string): HTMLElement {
  return el("div", { className: "metric-item" }, [
    el("span", { text: label }),
    el("strong", { text: value }),
    el("small", { text: helper }),
  ]);
}

function slug(value: string): string {
  return normalizeText(value)
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
}
