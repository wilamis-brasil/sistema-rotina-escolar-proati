const DEFAULT_TIMEOUT_MS = 5200;
const MAX_VISIBLE_TOASTS = 4;

const ICONS = {
  success: "check-circle-2",
  error: "circle-alert",
  warning: "triangle-alert",
  info: "info",
  alarm: "alarm-clock",
};

export function createToastManager({ root = document.querySelector("#toast-root") } = {}) {
  const container = root ?? createRoot();

  function show({ type = "info", title = "", message = "", timeout = DEFAULT_TIMEOUT_MS } = {}) {
    const toast = el("article", {
      className: "toast",
      attrs: {
        "data-type": type,
        role: type === "error" || type === "alarm" ? "alert" : "status",
      },
    }, [
      el("span", { className: "toast-icon" }, [icon(ICONS[type] ?? ICONS.info)]),
      el("div", { className: "toast-copy" }, [
        title ? el("strong", { text: title }) : null,
        message ? el("p", { text: message }) : null,
      ]),
      closeButton(() => remove(toast)),
    ]);

    container.prepend(toast);
    trim();
    refreshIcons();

    if (timeout > 0) {
      window.setTimeout(() => remove(toast), timeout);
    }

    return {
      close: () => remove(toast),
    };
  }

  function clear() {
    container.replaceChildren();
  }

  function trim() {
    [...container.children].slice(MAX_VISIBLE_TOASTS).forEach((node) => node.remove());
  }

  return {
    clear,
    show,
  };
}

function createRoot() {
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

function closeButton(onClick) {
  const button = el("button", {
    className: "toast-close",
    attrs: {
      type: "button",
      "aria-label": "Fechar mensagem",
      title: "Fechar mensagem",
    },
  }, [icon("x")]);
  button.addEventListener("click", onClick);
  return button;
}

function remove(node) {
  if (!node?.isConnected) return;
  node.classList.add("is-leaving");
  window.setTimeout(() => node.remove(), 160);
}

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      node.setAttribute(key, value);
    });
  }

  children.filter(Boolean).forEach((child) => {
    if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  });

  return node;
}

function icon(name) {
  return el("i", { attrs: { "data-lucide": name, "aria-hidden": "true" } });
}

function refreshIcons() {
  if (globalThis.lucide?.createIcons) {
    globalThis.lucide.createIcons();
  }
}
