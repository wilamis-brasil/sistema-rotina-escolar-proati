import {
  SORT_OPTIONS,
  WEEKDAYS,
  filterRoutines,
  formatDateTime,
  getTodayWeekdayId,
  getWeekdayLabel,
  normalizeText,
  sortRoutines,
  timeToMinutes,
} from "./model.js";
import { createDialogManager } from "./dialogs.js";
import { errorText } from "./errors.js";
import { createToastManager } from "./toasts.js";

export function createUI({ getState, actions, notifications, initialNotice }) {
  const refs = {};
  const dialogs = createDialogManager();
  const toasts = createToastManager();
  const recentAlerts = [];
  let activeView = "today";
  let editingRoutineId = null;
  let selectedDevices = new Set();

  function init() {
    bindRefs();
    bindEvents();
    renderStaticOptions();
    setView(activeView);
    resetRoutineForm();
    if (initialNotice) {
      refs.storageStatus.textContent = initialNotice;
    }
    render();
  }

  function bindRefs() {
    refs.navButtons = document.querySelectorAll(".nav-button");
    refs.views = document.querySelectorAll(".view");
    refs.todayLabel = document.querySelector("#today-label");
    refs.storageStatus = document.querySelector("#storage-status");
    refs.todayMetrics = document.querySelector("#today-metrics");
    refs.notificationStatus = document.querySelector("#notification-status");
    refs.undoDeleteButton = document.querySelector("#undo-delete-button");

    refs.routineFormPanel = document.querySelector("#routine-form-panel");
    refs.routineForm = document.querySelector("#routine-form");
    refs.routineFormTitle = document.querySelector("#routine-form-title");
    refs.routineFormModeLabel = document.querySelector("#routine-form-mode-label");
    refs.routineId = document.querySelector("#routine-id");
    refs.routineWeekday = document.querySelector("#routine-weekday");
    refs.routineStartTime = document.querySelector("#routine-start-time");
    refs.routineEndTime = document.querySelector("#routine-end-time");
    refs.routineTeacher = document.querySelector("#routine-teacher");
    refs.routineRoom = document.querySelector("#routine-room");
    refs.routineStudentCount = document.querySelector("#routine-student-count");
    refs.routineDevices = document.querySelector("#routine-devices");
    refs.routineNewDevice = document.querySelector("#routine-new-device");
    refs.routineNotes = document.querySelector("#routine-notes");
    refs.routineNotificationEnabled = document.querySelector("#routine-notification-enabled");
    refs.routineLeadMode = document.querySelector("#routine-lead-mode");
    refs.routineCustomLeadWrap = document.querySelector("#routine-custom-lead-wrap");
    refs.routineCustomLead = document.querySelector("#routine-custom-lead");
    refs.routineFeedback = document.querySelector("#routine-form-feedback");
    refs.saveRoutineButton = document.querySelector("#save-routine-button span");
    refs.clearRoutineForm = document.querySelector("#clear-routine-form");
    refs.addDeviceToRoutine = document.querySelector("#add-device-to-routine");

    refs.todaySummary = document.querySelector("#today-summary");
    refs.todayRoutines = document.querySelector("#today-routines");
    refs.requestNotificationButton = document.querySelector("#request-notification-button");
    refs.weekRoutines = document.querySelector("#week-routines");
    refs.routineFilter = document.querySelector("#routine-filter");
    refs.routineSort = document.querySelector("#routine-sort");

    refs.teachersDatalist = document.querySelector("#teachers-list");
    refs.roomsDatalist = document.querySelector("#rooms-list");

    refs.teacherForm = document.querySelector("#teacher-form");
    refs.teacherId = document.querySelector("#teacher-id");
    refs.teacherName = document.querySelector("#teacher-name");
    refs.teacherFeedback = document.querySelector("#teacher-feedback");
    refs.teachersListPanel = document.querySelector("#teachers-list-panel");

    refs.roomForm = document.querySelector("#room-form");
    refs.roomId = document.querySelector("#room-id");
    refs.roomName = document.querySelector("#room-name");
    refs.roomStudentCount = document.querySelector("#room-student-count");
    refs.roomFeedback = document.querySelector("#room-feedback");
    refs.roomsListPanel = document.querySelector("#rooms-list-panel");

    refs.deviceForm = document.querySelector("#device-form");
    refs.deviceId = document.querySelector("#device-id");
    refs.deviceName = document.querySelector("#device-name");
    refs.deviceFeedback = document.querySelector("#device-feedback");
    refs.devicesListPanel = document.querySelector("#devices-list-panel");

    refs.settingsForm = document.querySelector("#settings-form");
    refs.settingsNotificationsEnabled = document.querySelector("#settings-notifications-enabled");
    refs.settingsDefaultLead = document.querySelector("#settings-default-lead");
    refs.settingsCustomLeadWrap = document.querySelector("#settings-custom-lead-wrap");
    refs.settingsCustomLead = document.querySelector("#settings-custom-lead");
    refs.settingsSoundEnabled = document.querySelector("#settings-sound-enabled");
    refs.settingsFeedback = document.querySelector("#settings-feedback");
    refs.exportDataButton = document.querySelector("#export-data-button");
    refs.importDataFile = document.querySelector("#import-data-file");
    refs.resetDataButton = document.querySelector("#reset-data-button");

    refs.alertList = document.querySelector("#alert-list");
    refs.clearAlertsButton = document.querySelector("#clear-alerts-button");
    refs.alertDock = document.querySelector(".alert-dock");
  }

  function bindEvents() {
    refs.navButtons.forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.view));
    });

    refs.routineForm.addEventListener("submit", handleRoutineSubmit);
    refs.clearRoutineForm.addEventListener("click", () => {
      resetRoutineForm();
      render();
    });
    refs.addDeviceToRoutine.addEventListener("click", addDeviceFromRoutineInput);
    refs.routineLeadMode.addEventListener("change", renderRoutineLeadMode);
    refs.routineRoom.addEventListener("change", fillStudentCountFromRoom);

    refs.notificationStatus.addEventListener("click", requestNotificationAccess);
    refs.requestNotificationButton.addEventListener("click", requestNotificationAccess);

    refs.routineFilter.addEventListener("input", () => {
      actions.updateUiFilters({ filterText: refs.routineFilter.value });
      renderWeek();
    });
    refs.routineSort.addEventListener("change", () => {
      actions.updateUiFilters({ sortBy: refs.routineSort.value });
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

    document.addEventListener("click", handleDocumentClick);
  }

  function renderStaticOptions() {
    replaceChildren(
      refs.routineWeekday,
      WEEKDAYS.map((day) => option(day.id, day.label)),
    );

    replaceChildren(
      refs.routineSort,
      SORT_OPTIONS.map((item) => option(item.value, item.label)),
    );
  }

  function render() {
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

  function setView(viewId) {
    activeView = viewId;

    refs.navButtons.forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === viewId);
    });

    refs.views.forEach((view) => {
      view.classList.toggle("is-active", view.id === `view-${viewId}`);
    });

    refreshIcons();
  }

  function handleRoutineSubmit(event) {
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

  function collectRoutinePayload() {
    const extraDevice = normalizeText(refs.routineNewDevice.value);
    if (extraDevice) {
      selectedDevices.add(extraDevice);
    }

    let leadMinutes = null;
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

  function resetRoutineForm() {
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

  function fillRoutineForm(routine) {
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

  function startNewRoutine() {
    resetRoutineForm();
    setView("today");
    refs.routineFormPanel.scrollIntoView({ behavior: "smooth", block: "start" });
    refs.routineStartTime.focus();
  }

  function renderRoutineLeadMode() {
    refs.routineCustomLeadWrap.classList.toggle("is-hidden", refs.routineLeadMode.value !== "custom");
  }

  function renderSettingsLeadMode() {
    refs.settingsCustomLeadWrap.classList.toggle("is-hidden", refs.settingsDefaultLead.value !== "custom");
  }

  async function requestNotificationAccess() {
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

  function addDeviceFromRoutineInput() {
    const name = normalizeText(refs.routineNewDevice.value);
    if (!name) return;
    selectedDevices.add(name);
    refs.routineNewDevice.value = "";
    renderRoutineDevices();
  }

  function renderRoutineDevices() {
    if (!refs.routineDevices) return;

    const state = getState();
    const deviceNames = [
      ...state.devices.map((device) => device.name),
      ...selectedDevices,
    ];

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

  function renderDatalists() {
    const state = getState();
    replaceChildren(refs.teachersDatalist, state.teachers.map((teacher) => option(teacher.name, teacher.name)));
    replaceChildren(refs.roomsDatalist, state.rooms.map((room) => option(room.name, room.name)));
  }

  function fillStudentCountFromRoom() {
    const room = getState().rooms.find((item) => item.name === refs.routineRoom.value);
    if (room?.studentCount && !refs.routineStudentCount.value) {
      refs.routineStudentCount.value = String(room.studentCount);
    }
  }

  function renderToday() {
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

    refs.todaySummary.textContent = routines.length === 1
      ? "1 retirada programada."
      : `${routines.length} retiradas programadas.`;

    replaceChildren(
      refs.todayRoutines,
      routines.length ? routines.map((routine) => routineCard(routine)) : [todayEmptyState("Nenhuma rotina cadastrada para hoje.")],
    );
  }

  function renderTodayMetrics() {
    const state = getState();
    const todayId = getTodayWeekdayId();
    const todayRoutines = todayId
      ? sortRoutines(state.routines.filter((routine) => routine.weekday === todayId), "time")
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

  function renderWeek() {
    const state = getState();
    const filtered = sortRoutines(
      filterRoutines(state.routines, state.settings.filterText),
      state.settings.sortBy,
    );

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

  function routineCard(routine, compact = false) {
    const title = `${routine.startTime}${routine.endTime ? `-${routine.endTime}` : ""}`;
    const leadLabel = routine.leadMinutes === null || routine.leadMinutes === undefined
      ? `Global: ${getState().settings.defaultLeadMinutes} min`
      : `${routine.leadMinutes} min`;

    return el("article", { className: compact ? "routine-card is-compact" : "routine-card" }, [
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
          actionButton("trash-2", "Excluir", "Excluir rotina", async () => {
            const confirmed = await dialogs.dangerConfirm({
              title: "Excluir rotina?",
              message: "A rotina será removida da agenda. Você ainda poderá usar Desfazer logo após a exclusão.",
              confirmLabel: "Excluir",
            });
            if (!confirmed) return;

            const result = actions.deleteRoutine(routine.id);
            showResult(result, refs.routineFeedback, "Rotina excluída.");
            render();
          }, "danger"),
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
    ].filter(Boolean));
  }

  function renderCatalogs() {
    const state = getState();
    renderCatalogList("teachers", state.teachers, refs.teachersListPanel);
    renderCatalogList("rooms", state.rooms, refs.roomsListPanel);
    renderCatalogList("devices", state.devices, refs.devicesListPanel);
  }

  function renderCatalogList(kind, items, container) {
    if (!items.length) {
      replaceChildren(container, [emptyState("Nenhum cadastro ainda.")]);
      return;
    }

    replaceChildren(
      container,
      items.map((item) => {
        const caption = kind === "rooms" && item.studentCount
          ? `${item.studentCount} aluno(s) padrão`
          : countUsage(kind, item.name);

        return el("article", { className: "catalog-item" }, [
          el("div", {}, [
            el("strong", { text: item.name }),
            el("span", { text: caption }),
          ]),
          el("div", { className: "routine-actions" }, [
            iconButton("pencil", "Editar", () => startCatalogEdit(kind, item)),
            iconButton("trash-2", "Excluir", async () => {
              const confirmed = await dialogs.dangerConfirm({
                title: "Excluir cadastro?",
                message: "As rotinas já salvas continuarão com o texto atual. Apenas o item do catálogo será removido.",
                confirmLabel: "Excluir",
              });
              if (!confirmed) return;

              const result = actions.deleteCatalogItem(kind, item.id);
              showCatalogResult(kind, result, "Cadastro excluído.");
              render();
            }, "danger"),
          ]),
        ]);
      }),
    );
  }

  function countUsage(kind, name) {
    const routines = getState().routines;
    const count = routines.filter((routine) => {
      if (kind === "teachers") return routine.teacher === name;
      if (kind === "rooms") return routine.room === name;
      return routine.devices.includes(name);
    }).length;

    return count === 1 ? "Usado em 1 rotina" : `Usado em ${count} rotinas`;
  }

  function startCatalogEdit(kind, item) {
    if (kind === "teachers") {
      refs.teacherId.value = item.id;
      refs.teacherName.value = item.name;
      refs.teacherName.focus();
      return;
    }

    if (kind === "rooms") {
      refs.roomId.value = item.id;
      refs.roomName.value = item.name;
      refs.roomStudentCount.value = item.studentCount ?? "";
      refs.roomName.focus();
      return;
    }

    refs.deviceId.value = item.id;
    refs.deviceName.value = item.name;
    refs.deviceName.focus();
  }

  function handleTeacherSubmit(event) {
    event.preventDefault();
    const result = refs.teacherId.value
      ? actions.updateCatalogItem("teachers", refs.teacherId.value, { name: refs.teacherName.value })
      : actions.addCatalogItem("teachers", { name: refs.teacherName.value });

    showCatalogResult("teachers", result, "Professor salvo.");
    if (result.ok) refs.teacherForm.reset();
    render();
  }

  function handleRoomSubmit(event) {
    event.preventDefault();
    const payload = { name: refs.roomName.value, studentCount: refs.roomStudentCount.value };
    const result = refs.roomId.value
      ? actions.updateCatalogItem("rooms", refs.roomId.value, payload)
      : actions.addCatalogItem("rooms", payload);

    showCatalogResult("rooms", result, "Sala salva.");
    if (result.ok) refs.roomForm.reset();
    render();
  }

  function handleDeviceSubmit(event) {
    event.preventDefault();
    const result = refs.deviceId.value
      ? actions.updateCatalogItem("devices", refs.deviceId.value, { name: refs.deviceName.value })
      : actions.addCatalogItem("devices", { name: refs.deviceName.value });

    showCatalogResult("devices", result, "Dispositivo salvo.");
    if (result.ok) refs.deviceForm.reset();
    render();
  }

  function showCatalogResult(kind, result, successMessage) {
    const feedback = {
      teachers: refs.teacherFeedback,
      rooms: refs.roomFeedback,
      devices: refs.deviceFeedback,
    }[kind];
    showResult(result, feedback, successMessage);
  }

  function renderSettings() {
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

  function handleSettingsSubmit(event) {
    event.preventDefault();
    const defaultLeadMinutes = refs.settingsDefaultLead.value === "custom"
      ? refs.settingsCustomLead.value
      : refs.settingsDefaultLead.value;
    const result = actions.updateSettings({
      notificationsEnabled: refs.settingsNotificationsEnabled.checked,
      defaultLeadMinutes,
      soundEnabled: refs.settingsSoundEnabled.checked,
    });

    showResult(result, refs.settingsFeedback, "Configurações salvas.");
    render();
  }

  function handleExport() {
    const blob = new Blob([actions.exportData()], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `kickoff-proati-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function handleImport(event) {
    const [file] = event.target.files;
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
        event.target.value = "";
        return;
      }

      const result = actions.importData(String(reader.result ?? ""));
      showResult(result, refs.settingsFeedback, "Dados importados.");
      event.target.value = "";
      render();
    });
    reader.addEventListener("error", () => {
      showResult(
        { ok: false, errors: ["Não foi possível ler o arquivo selecionado."] },
        refs.settingsFeedback,
        "Dados importados.",
      );
      event.target.value = "";
    });
    reader.readAsText(file);
  }

  async function handleResetData() {
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

  function renderNotificationStatus() {
    const status = notifications.getStatus();
    const isActive = status.type === "enabled" || status.type === "unsupported";
    setButtonLabel(refs.notificationStatus, "Permitir alertas");
    refs.notificationStatus.hidden = isActive;
    refs.notificationStatus.title = status.label;
    refs.notificationStatus.setAttribute("aria-label", "Permitir alertas");
    refs.notificationStatus.dataset.status = status.type;
    refs.requestNotificationButton.hidden = isActive;
  }

  function addAlert(alert) {
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

  async function showAlarm(alert) {
    addAlert(alert);
    try {
      await dialogs.alarm({
        kicker: "Alarme PROATI",
        title: "Retirada agora",
        message: alert.body,
        details: alert.details ?? [],
      });
    } finally {
      notifications.stopSound?.();
    }
  }

  function showToast(payload) {
    toasts.show(payload);
  }

  function renderAlerts() {
    replaceChildren(
      refs.alertList,
      recentAlerts.length
        ? recentAlerts.map((alert) => el("article", { className: "alert-item" }, [
          el("strong", { text: alert.title }),
          el("span", { text: alert.body }),
          el("small", { text: formatDateTime(alert.createdAt) }),
        ]))
        : [emptyState("Nenhum alerta recente.")],
    );
    refs.alertDock.classList.toggle("is-quiet", recentAlerts.length === 0);
  }

  function todayEmptyState(message) {
    const button = el("button", {
      className: "button button-primary button-small",
      attrs: { type: "button" },
    }, [icon("plus"), span("Cadastrar rotina")]);
    button.addEventListener("click", startNewRoutine);

    return el("div", { className: "empty-state empty-state-action" }, [
      el("strong", { text: message }),
      el("span", { text: "Cadastre horários, professor, sala, alunos e dispositivos para não depender de papel." }),
      button,
    ]);
  }

  function handleDocumentClick(event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
  }

  function showResult(result, feedbackNode, successMessage, options = {}) {
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

  function setFeedback(node, message, type) {
    if (!node) return;
    node.textContent = message;
    node.dataset.type = type;
  }

  function detailLine(iconName, text) {
    return el("p", { className: "detail-line" }, [
      icon(iconName),
      span(text),
    ]);
  }

  function emptyState(message) {
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

function replaceChildren(parent, children) {
  parent.replaceChildren(...children.filter(Boolean));
}

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      node.setAttribute(key, value);
    });
  }

  children.forEach((child) => {
    if (child instanceof Node) node.appendChild(child);
    else if (child !== null && child !== undefined) node.appendChild(document.createTextNode(String(child)));
  });

  return node;
}

function span(text) {
  return el("span", { text });
}

function setButtonLabel(button, text) {
  const label = button.querySelector("span");
  if (label) {
    label.textContent = text;
    return;
  }

  button.replaceChildren(icon("bell-ring"), span(text));
}

function option(value, label) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  return node;
}

function icon(name) {
  return el("i", { attrs: { "data-lucide": name, "aria-hidden": "true" } });
}

function iconButton(iconName, label, onClick, variant = "neutral") {
  const button = el("button", {
    className: `icon-button${variant === "danger" ? " is-danger" : ""}`,
    attrs: {
      type: "button",
      "aria-label": label,
      title: label,
    },
  }, [icon(iconName)]);
  button.addEventListener("click", onClick);
  return button;
}

function actionButton(iconName, label, ariaLabel, onClick, variant = "neutral") {
  const button = el("button", {
    className: `action-button${variant === "danger" ? " is-danger" : ""}`,
    attrs: {
      type: "button",
      "aria-label": ariaLabel,
      title: ariaLabel,
    },
  }, [icon(iconName), span(label)]);
  button.addEventListener("click", onClick);
  return button;
}

function metricItem(label, value, helper) {
  return el("div", { className: "metric-item" }, [
    el("span", { text: label }),
    el("strong", { text: value }),
    el("small", { text: helper }),
  ]);
}

function slug(value) {
  return normalizeText(value)
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
}

function refreshIcons() {
  if (globalThis.lucide?.createIcons) {
    globalThis.lucide.createIcons();
  }
}
