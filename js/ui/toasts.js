import { el, icon } from "./dom.js";
import { refreshIcons } from "./icons.js";

const DEFAULT_TIMEOUT_MS = 5200;
const MAX_VISIBLE_TOASTS = 4;

/** @type {Record<string, string>} */
const TYPE_ICONS = {
  success: "check-circle-2",
  error: "circle-alert",
  warning: "triangle-alert",
  info: "info",
};

/**
 * @typedef {object} ToastPayload
 * @property {"success" | "error" | "warning" | "info"} [type]
 * @property {string} [title]
 * @property {string} [message]
 * @property {number} [timeout]
 */

/** @typedef {{ clear(): void, show(payload?: ToastPayload): { close(): void } }} ToastManager */

/**
 * Cria o gerenciador de toasts (avisos temporários no canto da tela).
 * @param {{ root?: HTMLElement | null }} [options]
 * @returns {ToastManager}
 */
export function createToastManager({ root = document.querySelector("#toast-root") } = {}) {
  const container = root ?? createRoot();

  /** @param {ToastPayload} [payload] */
  function show({ type = "info", title = "", message = "", timeout = DEFAULT_TIMEOUT_MS } = {}) {
    const toast = el(
      "article",
      { className: "toast", attrs: { "data-type": type, role: type === "error" ? "alert" : "status" } },
      [
        el("span", { className: "toast-icon" }, [icon(TYPE_ICONS[type] ?? "info")]),
        el("div", { className: "toast-copy" }, [
          title ? el("strong", { text: title }) : null,
          message ? el("p", { text: message }) : null,
        ]),
        closeButton(() => remove(toast)),
      ],
    );

    container.prepend(toast);
    trim();
    refreshIcons(container);

    if (timeout > 0) {
      window.setTimeout(() => remove(toast), timeout);
    }

    return { close: () => remove(toast) };
  }

  function clear() {
    container.replaceChildren();
  }

  function trim() {
    [...container.children].slice(MAX_VISIBLE_TOASTS).forEach((node) => node.remove());
  }

  return { clear, show };
}

/** @returns {HTMLElement} */
function createRoot() {
  const root = el("div", { className: "toast-root", attrs: { id: "toast-root", "aria-live": "polite", "aria-atomic": "false" } });
  document.body.appendChild(root);
  return root;
}

/** @param {() => void} onClick @returns {HTMLButtonElement} */
function closeButton(onClick) {
  const button = el(
    "button",
    { className: "toast-close", attrs: { type: "button", "aria-label": "Fechar este aviso temporário", title: "Fechar aviso" } },
    [icon("x")],
  );
  button.addEventListener("click", onClick);
  return button;
}

/** @param {HTMLElement} node */
function remove(node) {
  if (!node?.isConnected) return;
  node.classList.add("is-leaving");
  window.setTimeout(() => node.remove(), 160);
}
