import { el, icon } from "./dom.js";
import { refreshIcons } from "./icons.js";

const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

/** @type {Record<string, string>} */
const TONE_ICONS = {
  neutral: "message-square",
  danger: "trash-2",
  warning: "triangle-alert",
  success: "check-circle-2",
};

/** @typedef {{ label: string, value: string }} DialogDetail */

/**
 * @typedef {object} DialogOptions
 * @property {"neutral" | "danger" | "warning" | "success"} [tone]
 * @property {string} [title]
 * @property {string} [message]
 * @property {string} [kicker]
 * @property {string} [icon]
 * @property {string} [confirmLabel]
 * @property {string | null} [cancelLabel]
 * @property {"dialog" | "alertdialog"} [role]
 * @property {boolean} [closeOnBackdrop]
 * @property {string} [expectedText]
 * @property {DialogDetail[]} [details]
 */

/** @typedef {ReturnType<typeof createDialogManager>} DialogManager */

/**
 * Cria o gerenciador de diálogos modais (confirmar, excluir, alertar) com
 * armadilha de foco e fechamento por Escape/clique fora.
 * @param {{ root?: HTMLElement | null }} [options]
 */
export function createDialogManager({ root = document.querySelector("#dialog-root") } = {}) {
  const container = root ?? createRoot();
  /** @type {{ cleanup(): void, resolve(value: boolean): void, backdrop: HTMLElement } | null} */
  let activeDialog = null;

  /** @param {DialogOptions} [options] @returns {Promise<boolean>} */
  function confirm(options = {}) {
    return openDialog({ tone: "neutral", title: "Confirmar esta ação?", confirmLabel: "Confirmar", cancelLabel: "Cancelar", ...options });
  }

  /** @param {DialogOptions} [options] @returns {Promise<boolean>} */
  function dangerConfirm(options = {}) {
    return openDialog({ tone: "danger", title: "Confirmar exclusão?", confirmLabel: "Excluir", cancelLabel: "Cancelar", closeOnBackdrop: false, ...options });
  }

  /** @param {DialogOptions} [options] @returns {Promise<boolean>} */
  function textConfirm(options = {}) {
    return openDialog({ tone: "danger", title: "Confirmar exclusão definitiva?", confirmLabel: "Excluir", cancelLabel: "Cancelar", expectedText: "", closeOnBackdrop: false, ...options });
  }

  /** @param {DialogOptions} [options] @returns {Promise<boolean>} */
  function alert(options = {}) {
    return openDialog({ tone: "neutral", title: "Mensagem do sistema", confirmLabel: "Fechar", cancelLabel: null, role: "alertdialog", ...options });
  }

  /** @param {boolean} [value] */
  function closeActive(value = false) {
    if (!activeDialog) return;
    activeDialog.resolve(value);
    activeDialog.cleanup();
    activeDialog = null;
  }

  /** @param {DialogOptions} options @returns {Promise<boolean>} */
  function openDialog(options) {
    closeActive(false);

    return new Promise((resolve) => {
      const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const tone = options.tone ?? "neutral";
      const titleId = `dialog-title-${Date.now().toString(36)}`;
      const messageId = `dialog-message-${Date.now().toString(36)}`;

      const confirmButton = button(options.confirmLabel ?? "Confirmar", tone === "danger" ? "button button-danger" : "button button-primary");
      const cancelButton = options.cancelLabel === null ? null : button(options.cancelLabel ?? "Cancelar", "button button-secondary");

      const expectedInput = options.expectedText
        ? el("input", { attrs: { type: "text", autocomplete: "off", spellcheck: "false", "aria-label": `Digite ${options.expectedText} em letras maiúsculas para confirmar a exclusão` } })
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
          attrs: { role: options.role ?? "dialog", "aria-modal": "true", "aria-labelledby": titleId, "aria-describedby": messageId, "data-tone": tone },
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

      /** @param {boolean} value */
      function finish(value) {
        if (activeDialog?.backdrop !== backdrop) return;
        resolve(value);
        cleanup();
        activeDialog = null;
      }

      function cleanup() {
        document.removeEventListener("keydown", onKeydown);
        backdrop.remove();
        if (previousFocus?.isConnected) previousFocus.focus();
      }

      /** @param {KeyboardEvent} event */
      function onKeydown(event) {
        if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
          return;
        }
        if (event.key === "Tab") trapFocus(event, dialog);
      }

      cancelButton?.addEventListener("click", () => finish(false));
      confirmButton.addEventListener("click", () => finish(true));
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop && options.closeOnBackdrop !== false) finish(false);
      });
      document.addEventListener("keydown", onKeydown);

      activeDialog = { backdrop, cleanup, resolve };

      refreshIcons(backdrop);
      window.setTimeout(() => {
        (expectedInput ?? firstFocusable(dialog) ?? dialog).focus();
      }, 0);
    });
  }

  return { alert, closeActive, confirm, dangerConfirm, textConfirm };
}

/** @param {DialogDetail[]} details @returns {HTMLElement} */
function detailsList(details) {
  return el(
    "dl",
    { className: "dialog-details" },
    details.flatMap((item) => [el("dt", { text: item.label }), el("dd", { text: item.value })]),
  );
}

/** @param {string} expectedText @param {HTMLInputElement} input @returns {HTMLLabelElement} */
function textConfirmation(expectedText, input) {
  return el("label", { className: "dialog-confirmation" }, [
    el("span", { text: `Para confirmar, digite ${expectedText} em letras maiúsculas:` }),
    input,
  ]);
}

/** @param {KeyboardEvent} event @param {HTMLElement} container */
function trapFocus(event, container) {
  const focusable = [...container.querySelectorAll(FOCUSABLE_SELECTOR)];
  if (!focusable.length) return;

  const first = /** @type {HTMLElement} */ (focusable[0]);
  const last = /** @type {HTMLElement} */ (focusable[focusable.length - 1]);

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

/** @param {HTMLElement} container @returns {HTMLElement | null} */
function firstFocusable(container) {
  return container.querySelector(FOCUSABLE_SELECTOR);
}

/** @returns {HTMLElement} */
function createRoot() {
  const root = el("div", { className: "dialog-root", attrs: { id: "dialog-root" } });
  document.body.appendChild(root);
  return root;
}

/** @param {string} label @param {string} className @returns {HTMLButtonElement} */
function button(label, className) {
  return el("button", { className, attrs: { type: "button" } }, [el("span", { text: label })]);
}
