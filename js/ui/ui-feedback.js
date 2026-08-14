// @ts-check

import { errorText } from "../domain/errors.js";

/** @typedef {import("../domain/types.js").EmptyResult} EmptyResult */
/** @typedef {import("./toasts.js").ToastManager} ToastManager */

/**
 * Apresenta o resultado de uma ação como mensagem inline + toast.
 * @param {ToastManager} toasts
 */
export function createFeedbackPresenter(toasts) {
  /**
   * @param {HTMLElement} node
   * @param {string} message
   * @param {string} type
   */
  function setFeedback(node, message, type) {
    node.textContent = message;
    node.dataset.type = type;
  }

  /**
   * @param {EmptyResult} result
   * @param {HTMLElement} feedbackNode
   * @param {string} successMessage
   * @param {{ errorTitle?: string, successTitle?: string }} [options]
   */
  function showResult(result, feedbackNode, successMessage, options = {}) {
    if (!result.ok) {
      const message = errorText(result);
      setFeedback(feedbackNode, message, "error");
      toasts.show({ type: "error", title: options.errorTitle ?? "Não foi possível concluir a ação", message, timeout: 6800 });
      return;
    }
    setFeedback(feedbackNode, successMessage, "success");
    toasts.show({ type: "success", title: options.successTitle ?? "Ação concluída", message: successMessage, timeout: 3600 });
  }

  return { showResult, setFeedback };
}
