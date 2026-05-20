import { el, icon } from "./dom";
import { refreshIcons } from "./icons";

const DEFAULT_TIMEOUT_MS = 5200;
const MAX_VISIBLE_TOASTS = 4;

const ICONS: Record<string, string> = {
  success: "check-circle-2",
  error: "circle-alert",
  warning: "triangle-alert",
  info: "info",
};

export interface ToastPayload {
  type?: "success" | "error" | "warning" | "info";
  title?: string;
  message?: string;
  timeout?: number;
}

export interface ToastManager {
  clear(): void;
  show(payload?: ToastPayload): { close(): void };
}

export function createToastManager({
  root = document.querySelector<HTMLElement>("#toast-root"),
}: { root?: HTMLElement | null } = {}): ToastManager {
  const container = root ?? createRoot();

  function show({
    type = "info",
    title = "",
    message = "",
    timeout = DEFAULT_TIMEOUT_MS,
  }: ToastPayload = {}): { close(): void } {
    const toast = el(
      "article",
      {
        className: "toast",
        attrs: {
          "data-type": type,
          role: type === "error" ? "alert" : "status",
        },
      },
      [
        el("span", { className: "toast-icon" }, [icon(ICONS[type] ?? "info")]),
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

    return {
      close: () => remove(toast),
    };
  }

  function clear(): void {
    container.replaceChildren();
  }

  function trim(): void {
    [...container.children].slice(MAX_VISIBLE_TOASTS).forEach((node) => node.remove());
  }

  return {
    clear,
    show,
  };
}

function createRoot(): HTMLElement {
  const root = el("div", {
    className: "toast-root",
    attrs: {
      id: "toast-root",
      "aria-live": "polite",
      "aria-atomic": "false",
    },
  });
  document.body.appendChild(root);
  return root;
}

function closeButton(onClick: () => void): HTMLButtonElement {
  const button = el(
    "button",
    {
      className: "toast-close",
      attrs: {
        type: "button",
        "aria-label": "Fechar mensagem",
        title: "Fechar mensagem",
      },
    },
    [icon("x")],
  );
  button.addEventListener("click", onClick);
  return button;
}

function remove(node: HTMLElement): void {
  if (!node?.isConnected) return;
  node.classList.add("is-leaving");
  window.setTimeout(() => node.remove(), 160);
}
