/** @typedef {import("../../app/controller.js").AppActions} AppActions */
/** @typedef {import("../dialogs.js").DialogManager} DialogManager */

/**
 * Ações de duplicar/excluir rotina com confirmação e feedback.
 * @param {{ actions: any, dialogs: DialogManager, feedback: any, feedbackNode: HTMLElement, onChange: () => void }} deps
 */
export function createRoutineActions({ actions, dialogs, feedback, feedbackNode, onChange }) {
  /** @param {string} routineId */
  function duplicateRoutine(routineId) {
    const result = actions.duplicateRoutine(routineId);
    feedback.showResult(result, feedbackNode, "Rotina duplicada na agenda semanal.", { successTitle: "Rotina duplicada" });
    onChange();
  }

  /** @param {string} routineId */
  async function confirmDeleteRoutine(routineId) {
    const confirmed = await dialogs.dangerConfirm({
      title: "Excluir esta rotina?",
      message: "A rotina sairá da agenda semanal e dos avisos do dia. Use Desfazer logo após a exclusão para recuperá-la.",
      confirmLabel: "Excluir rotina",
    });
    if (!confirmed) return;

    const result = actions.deleteRoutine(routineId);
    feedback.showResult(result, feedbackNode, "Rotina excluída da agenda semanal.", { successTitle: "Rotina excluída" });
    onChange();
  }

  return { duplicateRoutine, confirmDeleteRoutine };
}
