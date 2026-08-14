// @ts-check

import { getTodayWeekdayId, getWeekdayLabel } from "../domain/model.js";
import { SORT_OPTIONS, WEEKDAYS } from "../domain/types.js";
import { createCatalogsView } from "./catalogs/catalogs-view.js";
import { createDialogManager } from "./dialogs.js";
import { option, replaceChildren } from "./dom.js";
import { refreshIcons } from "./icons.js";
import { createMaintenanceView } from "./maintenance/maintenance-view.js";
import { createNavigation } from "./navigation.js";
import { createNotificationsView } from "./notifications/notifications-view.js";
import { createRoutineActions } from "./routines/routine-actions.js";
import { createRoutineForm } from "./routines/routine-form.js";
import { createTodayView } from "./routines/today-view.js";
import { createSettingsView } from "./settings/settings-view.js";
import { createToastManager } from "./toasts.js";
import { createFeedbackPresenter } from "./ui-feedback.js";
import { bindRefs } from "./ui-refs.js";
import { createWeekView } from "./week/week-view.js";

/** @typedef {import("../domain/types.js").AppState} AppState */

/**
 * Compõe a aplicação: instancia cada view com suas dependências, conecta os
 * eventos e expõe `init`/`render`. É o único lugar que conhece todas as views.
 * @param {{ getState: () => AppState, actions: any }} deps
 * @returns {{ init: () => void, render: () => void }}
 */
export function createUI({ getState, actions }) {
  /** @type {ReturnType<typeof bindRefs>} */
  let refs;
  const dialogs = createDialogManager();
  const toasts = createToastManager();

  let navigation;
  let feedback;
  let routineForm;
  let routineActions;
  let todayView;
  let weekView;
  let catalogsView;
  let maintenanceView;
  let notificationsView;
  let settingsView;

  function init() {
    refs = bindRefs();
    feedback = createFeedbackPresenter(toasts);
    navigation = createNavigation({ refs });
    routineActions = createRoutineActions({ actions, dialogs, feedback, feedbackNode: refs.routineFeedback, onChange: render });
    routineForm = createRoutineForm({ refs, getState, actions, navigation, feedback, onChange: render });
    todayView = createTodayView({
      refs,
      getState,
      callbacks: {
        onEdit: (routine) => routineForm.fill(routine),
        onDuplicate: routineActions.duplicateRoutine,
        onDelete: routineActions.confirmDeleteRoutine,
        onStartNewRoutine: () => routineForm.startNew(),
      },
    });
    weekView = createWeekView({
      refs,
      getState,
      actions,
      callbacks: {
        onEdit: (routine) => routineForm.fill(routine),
        onDuplicate: routineActions.duplicateRoutine,
        onDelete: routineActions.confirmDeleteRoutine,
      },
    });
    catalogsView = createCatalogsView({ refs, getState, actions, dialogs, feedback, onChange: render });
    maintenanceView = createMaintenanceView({ refs, getState, actions, dialogs, toasts, onChange: render });
    settingsView = createSettingsView({
      refs,
      actions,
      dialogs,
      feedback,
      onResetData: () => {
        routineForm.reset();
        render();
      },
      onImported: render,
    });
    notificationsView = createNotificationsView({
      refs,
      getState,
      actions,
      toasts,
      onEditRoutine: (routine) => routineForm.fill(routine),
      onNavigateToView: (viewId) => navigation.setView(viewId),
    });

    bindEvents();
    renderStaticOptions();
    navigation.setView("today");
    routineForm.reset();
    render();
    notificationsView.start();
  }

  function bindEvents() {
    navigation.bindEvents();
    routineForm.bindEvents();
    weekView.bindEvents();
    catalogsView.bindEvents();
    maintenanceView.bindEvents();
    settingsView.bindEvents();
    notificationsView.bindEvents();

    refs.undoDeleteButton.addEventListener("click", () => {
      const result = actions.undoDeleteRoutine();
      feedback.showResult(result, refs.routineFeedback, "Exclusão desfeita.");
      render();
    });
  }

  function renderStaticOptions() {
    replaceChildren(refs.routineWeekday, WEEKDAYS.map((day) => option(day.id, day.label)));
    replaceChildren(refs.routineSort, SORT_OPTIONS.map((item) => option(item.value, item.label)));
  }

  function render() {
    const state = getState();
    const todayId = getTodayWeekdayId();
    const today = todayId ? getWeekdayLabel(todayId) : "Fim de semana";

    refs.todayLabel.textContent = `Hoje: ${today}`;
    refs.undoDeleteButton.hidden = !actions.canUndoDeleteRoutine();
    refs.routineFilter.value = state.settings.filterText;
    refs.routineSort.value = state.settings.sortBy;

    todayView.renderMetrics();
    routineForm.renderDatalists();
    routineForm.renderDevices();
    todayView.render();
    weekView.render();
    catalogsView.render();
    maintenanceView.render();
    notificationsView.render();
    refreshIcons();
  }

  return { init, render };
}
