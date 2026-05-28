import type { AppActions } from "../app/controller";
import { getTodayWeekdayId, getWeekdayLabel } from "../domain/model";
import { SORT_OPTIONS, WEEKDAYS, type AppState } from "../domain/types";
import { createCatalogsView } from "./catalogs/catalogs-view";
import { createDialogManager } from "./dialogs";
import { option, replaceChildren } from "./dom";
import { refreshIcons } from "./icons";
import { createMaintenanceView } from "./maintenance/maintenance-view";
import { createNavigation } from "./navigation";
import { createNotificationsView } from "./notifications/notifications-view";
import { createRoutineActions } from "./routines/routine-actions";
import { createRoutineForm } from "./routines/routine-form";
import { createTodayView } from "./routines/today-view";
import { createSettingsView } from "./settings/settings-view";
import { createToastManager } from "./toasts";
import { createFeedbackPresenter } from "./ui-feedback";
import { bindRefs, type UIRefs } from "./ui-refs";
import { createWeekView } from "./week/week-view";

interface UIApi {
  init(): void;
  render(): void;
}

export function createUI({
  getState,
  actions,
}: {
  getState: () => AppState;
  actions: AppActions;
}): UIApi {
  let refs: UIRefs;
  const dialogs = createDialogManager();
  const toasts = createToastManager();

  let navigation!: ReturnType<typeof createNavigation>;
  let feedback!: ReturnType<typeof createFeedbackPresenter>;
  let routineForm!: ReturnType<typeof createRoutineForm>;
  let routineActions!: ReturnType<typeof createRoutineActions>;
  let todayView!: ReturnType<typeof createTodayView>;
  let weekView!: ReturnType<typeof createWeekView>;
  let catalogsView!: ReturnType<typeof createCatalogsView>;
  let maintenanceView!: ReturnType<typeof createMaintenanceView>;
  let notificationsView!: ReturnType<typeof createNotificationsView>;
  let settingsView!: ReturnType<typeof createSettingsView>;

  function init(): void {
    refs = bindRefs();
    feedback = createFeedbackPresenter(toasts);
    navigation = createNavigation({ refs });
    routineActions = createRoutineActions({
      actions,
      dialogs,
      feedback,
      feedbackNode: refs.routineFeedback,
      onChange: render,
    });
    routineForm = createRoutineForm({
      refs,
      getState,
      actions,
      navigation,
      feedback,
      onChange: render,
    });
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
    catalogsView = createCatalogsView({
      refs,
      getState,
      actions,
      dialogs,
      feedback,
      onChange: render,
    });
    maintenanceView = createMaintenanceView({
      refs,
      getState,
      actions,
      dialogs,
      toasts,
      onChange: render,
    });
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

  function bindEvents(): void {
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

  return {
    init,
    render,
  };
}
