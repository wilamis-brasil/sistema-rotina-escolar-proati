import type { AppActions } from "../../app/controller";
import type { DialogManager } from "../dialogs";
import type { FeedbackPresenter } from "../ui-feedback";

interface RoutineActions {
  duplicateRoutine(routineId: string): void;
  confirmDeleteRoutine(routineId: string): Promise<void>;
}

export function createRoutineActions({
  actions,
  dialogs,
  feedback,
  feedbackNode,
  onChange,
}: {
  actions: AppActions;
  dialogs: DialogManager;
  feedback: FeedbackPresenter;
  feedbackNode: HTMLElement;
  onChange: () => void;
}): RoutineActions {
  function duplicateRoutine(routineId: string): void {
    const result = actions.duplicateRoutine(routineId);
    feedback.showResult(result, feedbackNode, "Rotina duplicada.");
    onChange();
  }

  async function confirmDeleteRoutine(routineId: string): Promise<void> {
    const confirmed = await dialogs.dangerConfirm({
      title: "Excluir rotina?",
      message: "A rotina será removida da agenda. Você ainda poderá usar Desfazer logo após a exclusão.",
      confirmLabel: "Excluir",
    });
    if (!confirmed) return;

    const result = actions.deleteRoutine(routineId);
    feedback.showResult(result, feedbackNode, "Rotina excluída.");
    onChange();
  }

  return { duplicateRoutine, confirmDeleteRoutine };
}
