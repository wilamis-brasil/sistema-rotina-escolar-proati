import { el, icon } from "./dom";
import { refreshIcons } from "./icons";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const TONE_ICONS: Record<string, string> = {
  neutral: "message-square",
  danger: "trash-2",
  warning: "triangle-alert",
  success: "check-circle-2",
};

export interface DialogDetail {
  label: string;
  value: string;
}

export interface DialogOptions {
  tone?: "neutral" | "danger" | "warning" | "success";
  title?: string;
  message?: string;
  kicker?: string;
  icon?: string;
  confirmLabel?: string;
  cancelLabel?: string | null;
  role?: "dialog" | "alertdialog";
  closeOnBackdrop?: boolean;
  expectedText?: string;
  details?: DialogDetail[];
}

export interface DialogManager {
  alert(options?: DialogOptions): Promise<boolean>;
  closeActive(value?: boolean): void;
  confirm(options?: DialogOptions): Promise<boolean>;
  dangerConfirm(options?: DialogOptions): Promise<boolean>;
  textConfirm(options?: DialogOptions): Promise<boolean>;
}

export function createDialogManager({
  root = document.querySelector<HTMLElement>("#dialog-root"),
}: { root?: HTMLElement | null } = {}): DialogManager {
  const container = root ?? createRoot();
  let activeDialog: { cleanup(): void; resolve(value: boolean): void; backdrop: HTMLElement } | null = null;

  function confirm(options: DialogOptions = {}): Promise<boolean> {
    return openDialog({
      tone: "neutral",
      title: "Confirmar esta ação?",
      confirmLabel: "Confirmar",
      cancelLabel: "Cancelar",
      ...options,
    });
  }

  function dangerConfirm(options: DialogOptions = {}): Promise<boolean> {
    return openDialog({
      tone: "danger",
      title: "Confirmar exclusão?",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      closeOnBackdrop: false,
      ...options,
    });
  }

  function textConfirm(options: DialogOptions = {}): Promise<boolean> {
    return openDialog({
      tone: "danger",
      title: "Confirmar exclusão definitiva?",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      expectedText: "",
      closeOnBackdrop: false,
      ...options,
    });
  }

  function alert(options: DialogOptions = {}): Promise<boolean> {
    return openDialog({
      tone: "neutral",
      title: "Mensagem do sistema",
      confirmLabel: "Fechar",
      cancelLabel: null,
      role: "alertdialog",
      ...options,
    });
  }

  function closeActive(value = false): void {
    if (!activeDialog) return;
    activeDialog.resolve(value);
    activeDialog.cleanup();
    activeDialog = null;
  }

  function openDialog(options: DialogOptions): Promise<boolean> {
    closeActive(false);

    return new Promise((resolve) => {
      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const tone = options.tone ?? "neutral";
      const titleId = `dialog-title-${Date.now().toString(36)}`;
      const messageId = `dialog-message-${Date.now().toString(36)}`;

      const confirmButton = button(
        options.confirmLabel ?? "Confirmar",
        tone === "danger" ? "button button-danger" : "button button-primary",
      );
      const cancelButton =
        options.cancelLabel === null ? null : button(options.cancelLabel ?? "Cancelar", "button button-secondary");

      const expectedInput = options.expectedText
        ? el("input", {
            attrs: {
              type: "text",
              autocomplete: "off",
              spellcheck: "false",
              "aria-label": `Digite ${options.expectedText} em letras maiúsculas para confirmar a exclusão`,
            },
          })
        : null;

      if (expectedInput) {
        confirmButton.disabled = true;
        expectedInput.addEventListener("input", () => {
          confirmButton.disabled = expectedInput.value !== options.expectedText;
        });
      }

      const dialog = el(
        "section",
        {
          className: "dialog",
          attrs: {
            role: options.role ?? "dialog",
            "aria-modal": "true",
            "aria-labelledby": titleId,
            "aria-describedby": messageId,
            "data-tone": tone,
          },
        },
        [
          el("div", { className: "dialog-header" }, [
            el("span", { className: "dialog-icon" }, [icon(options.icon ?? TONE_ICONS[tone] ?? "message-square")]),
            el("div", {}, [
              options.kicker ? el("span", { className: "dialog-kicker", text: options.kicker }) : null,
              el("h2", { text: options.title ?? "Mensagem do sistema", attrs: { id: titleId } }),
            ]),
          ]),
          options.message ? el("p", { className: "dialog-message", text: options.message, attrs: { id: messageId } }) : null,
          options.details?.length ? detailsList(options.details) : null,
          expectedInput ? textConfirmation(options.expectedText ?? "", expectedInput) : null,
          el("div", { className: "dialog-actions" }, [cancelButton, confirmButton]),
        ],
      );

      const backdrop = el("div", { className: "dialog-backdrop" }, [dialog]);
      container.appendChild(backdrop);

      function finish(value: boolean): void {
        if (activeDialog?.backdrop !== backdrop) return;
        resolve(value);
        cleanup();
        activeDialog = null;
      }

      function cleanup(): void {
        document.removeEventListener("keydown", onKeydown);
        backdrop.remove();
        if (previousFocus?.isConnected) {
          previousFocus.focus();
        }
      }

      function onKeydown(event: KeyboardEvent): void {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
          return;
        }

        if (event.key === "Tab") {
          trapFocus(event, dialog);
        }
      }

      cancelButton?.addEventListener("click", () => finish(false));
      confirmButton.addEventListener("click", () => finish(true));
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop && options.closeOnBackdrop !== false) {
          finish(false);
        }
      });
      document.addEventListener("keydown", onKeydown);

      activeDialog = {
        backdrop,
        cleanup,
        resolve,
      };

      refreshIcons(backdrop);
      window.setTimeout(() => {
        (expectedInput ?? firstFocusable(dialog) ?? dialog).focus();
      }, 0);
    });
  }

  return {
    alert,
    closeActive,
    confirm,
    dangerConfirm,
    textConfirm,
  };
}

function detailsList(details: DialogDetail[]): HTMLElement {
  return el(
    "dl",
    { className: "dialog-details" },
    details.flatMap((item) => [el("dt", { text: item.label }), el("dd", { text: item.value })]),
  );
}

function textConfirmation(expectedText: string, input: HTMLInputElement): HTMLLabelElement {
  return el("label", { className: "dialog-confirmation" }, [
    el("span", { text: `Para confirmar, digite ${expectedText} em letras maiúsculas:` }),
    input,
  ]);
}

function trapFocus(event: KeyboardEvent, container: HTMLElement): void {
  const focusable = [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)];
  if (!focusable.length) return;

  const first = focusable[0]!;
  const last = focusable[focusable.length - 1]!;

  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function firstFocusable(container: HTMLElement): HTMLElement | null {
  return container.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
}

function createRoot(): HTMLElement {
  const root = el("div", { className: "dialog-root", attrs: { id: "dialog-root" } });
  document.body.appendChild(root);
  return root;
}

function button(label: string, className: string): HTMLButtonElement {
  return el(
    "button",
    {
      className,
      attrs: {
        type: "button",
      },
    },
    [el("span", { text: label })],
  );
}
