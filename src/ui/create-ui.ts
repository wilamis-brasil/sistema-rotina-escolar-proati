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
import { SORT_OPTIONS, WEEKDAYS, type AppState, type CatalogKind, type EmptyResult, type Routine, type RoutinePayload } from "../domain/types";
import type { NotificationManager, RoutineAlert } from "../notifications/notification-manager";
import { createDialogManager, type DialogManager } from "./dialogs";
import { el, icon, option, qs, qsa, replaceChildren, span } from "./dom";
import { refreshIcons } from "./icons";
import { createToastManager, type ToastManager, type ToastPayload } from "./toasts";

const NAVIGATION_LABELS: Record<string, string> = {
  today: "Home",
  week: "Semana",
  teachers: "Professores",
  rooms: "Salas",
  devices: "Dispositivos",
  settings: "Configurações",
};

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
  teachersDatalist: HTMLElement;
  roomsDatalist: HTMLElement;
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
  let activeView = "today";
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
      teachersDatalist: qs("#teachers-list"),
      roomsDatalist: qs("#rooms-list"),
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
      renderWeek();
    });
    refs.routineSort.addEventListener("change", () => {
      actions.updateUiFilters({ sortBy: refs.routineSort.value as AppState["settings"]["sortBy"] });
      renderWeek();
    });

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
    const result = await notifications.requestPermission();
    if (!result.ok) {
      setFeedback(refs.settingsFeedback, result.message, "error");
      toasts.show({
        type: "warning",
        title: "Alertas do navegador indisponíveis",
        message: result.message,
      });
      renderNotificationStatus();
      return;
    }

    const settings = getState().settings;
    const updateResult = actions.updateSettings({
      notificationsEnabled: true,
      defaultLeadMinutes: settings.defaultLeadMinutes,
      soundEnabled: settings.soundEnabled,
    });

    showResult(updateResult, refs.settingsFeedback, result.message);
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

    const routines = sortRoutines(
      state.routines.filter((routine) => routine.weekday === todayId),
      "time",
    );

    refs.todaySummary.textContent =
      routines.length === 1 ? "1 retirada programada." : `${routines.length} retiradas programadas.`;

    replaceChildren(
      refs.todayRoutines,
      routines.length ? routines.map((routine) => routineCard(routine)) : [todayEmptyState("Nenhuma rotina cadastrada para hoje.")],
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
    const currentMinutes = new Date().getHours() * 60 + new Date().getMinutes();
    const nextRoutine = todayRoutines.find((routine) => (timeToMinutes(routine.startTime) ?? 0) >= currentMinutes);
    const activeAlerts = state.routines.filter((routine) => routine.notificationEnabled).length;

    replaceChildren(refs.todayMetrics, [
      metricItem("Hoje", todayRoutines.length.toString(), todayRoutines.length === 1 ? "retirada" : "retiradas"),
      metricItem("Próxima", nextRoutine ? nextRoutine.startTime : "Livre", nextRoutine ? nextRoutine.room : "sem pendência"),
      metricItem("Semana", state.routines.length.toString(), state.routines.length === 1 ? "rotina" : "rotinas"),
      metricItem("Alertas", activeAlerts.toString(), state.settings.notificationsEnabled ? "ativos" : "pausados"),
    ]);
  }

  function renderWeek(): void {
    const state = getState();
    const filtered = sortRoutines(filterRoutines(state.routines, state.settings.filterText), state.settings.sortBy);

    replaceChildren(
      refs.weekRoutines,
      WEEKDAYS.map((day) => {
        const routines = filtered.filter((routine) => routine.weekday === day.id);
        return el("section", { className: "day-column" }, [
          el("header", { className: "day-column-header" }, [
            el("strong", { text: day.shortLabel }),
            el("span", { text: routines.length.toString() }),
          ]),
          el(
            "div",
            { className: "day-routines" },
            routines.length ? routines.map((routine) => routineCard(routine, true)) : [emptyState("Sem registros.")],
          ),
        ]);
      }),
    );
  }

  function routineCard(routine: Routine, compact = false): HTMLElement {
    const title = `${routine.startTime}${routine.endTime ? `-${routine.endTime}` : ""}`;
    const leadLabel =
      routine.leadMinutes === null || routine.leadMinutes === undefined
        ? `Global: ${getState().settings.defaultLeadMinutes} min`
        : `${routine.leadMinutes} min`;

    return el(
      "article",
      { className: compact ? "routine-card is-compact" : "routine-card" },
      [
        el("div", { className: "routine-card-top" }, [
          el("div", {}, [
            el("strong", { className: "routine-time", text: title }),
            el("span", { className: "routine-day", text: getWeekdayLabel(routine.weekday) }),
          ]),
          el("div", { className: "routine-actions" }, [
            actionButton("copy", "Duplicar", "Duplicar rotina", () => {
              const result = actions.duplicateRoutine(routine.id);
              showResult(result, refs.routineFeedback, "Rotina duplicada.");
              render();
            }),
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
    const routines = getState().routines;
    const count = routines.filter((routine) => {
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

  function handleSettingsSubmit(event: SubmitEvent): void {
    event.preventDefault();
    const defaultLeadMinutes =
      refs.settingsDefaultLead.value === "custom" ? refs.settingsCustomLead.value : refs.settingsDefaultLead.value;
    const result = actions.updateSettings({
      notificationsEnabled: refs.settingsNotificationsEnabled.checked,
      defaultLeadMinutes,
      soundEnabled: refs.settingsSoundEnabled.checked,
    });

    showResult(result, refs.settingsFeedback, "Configurações salvas.");
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
    refs.requestNotificationButton.hidden = isActive;
    refs.requestNotificationButton.title = status.label;
    refs.requestNotificationButton.dataset.status = status.type;
  }

  function addAlert(alert: RoutineAlert): void {
    recentAlerts.unshift(alert);
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
    addAlert(alert);
    try {
      await dialogs.alarm({
        kicker: "Alarme PROATI",
        title: "Retirada agora",
        message: alert.body,
        details: alert.details,
      });
    } finally {
      notifications.stopSound();
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
