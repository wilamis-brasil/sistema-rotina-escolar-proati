import { errorText } from "../domain/errors";
import type { EmptyResult } from "../domain/types";
import type { ToastManager } from "./toasts";

export interface FeedbackPresenter {
  showResult(
    result: EmptyResult,
    feedbackNode: HTMLElement,
    successMessage: string,
    options?: { errorTitle?: string; successTitle?: string },
  ): void;
  setFeedback(node: HTMLElement, message: string, type: string): void;
}

export function createFeedbackPresenter(toasts: ToastManager): FeedbackPresenter {
  function setFeedback(node: HTMLElement, message: string, type: string): void {
    node.textContent = message;
    node.dataset.type = type;
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
  }

  return { showResult, setFeedback };
}
