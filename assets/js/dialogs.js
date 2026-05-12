const FOCUSABLE_SELECTOR = [
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "a[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const TONE_ICONS = {
  neutral: "message-square",
  danger: "trash-2",
  warning: "triangle-alert",
  success: "check-circle-2",
  alarm: "alarm-clock",
};

export function createDialogManager({ root = document.querySelector("#dialog-root") } = {}) {
  const container = root ?? createRoot();
  let activeDialog = null;

  function confirm(options = {}) {
    return openDialog({
      tone: "neutral",
      confirmLabel: "Confirmar",
      cancelLabel: "Cancelar",
      ...options,
    });
  }

  function dangerConfirm(options = {}) {
    return openDialog({
      tone: "danger",
      title: "Confirmar ação",
      confirmLabel: "Confirmar",
      cancelLabel: "Cancelar",
      closeOnBackdrop: false,
      ...options,
    });
  }

  function textConfirm(options = {}) {
    return openDialog({
      tone: "danger",
      title: "Confirmar ação",
      confirmLabel: "Confirmar",
      cancelLabel: "Cancelar",
      expectedText: "",
      closeOnBackdrop: false,
      ...options,
    });
  }

  function alert(options = {}) {
    return openDialog({
      tone: "neutral",
      confirmLabel: "Entendi",
      cancelLabel: null,
      role: "alertdialog",
      ...options,
    });
  }

  function alarm(options = {}) {
    return openDialog({
      tone: "alarm",
      title: "Retirada agora",
      confirmLabel: "Entendi",
      cancelLabel: "Silenciar",
      role: "alertdialog",
      closeOnBackdrop: false,
      ...options,
    });
  }

  function closeActive(value = false) {
    if (!activeDialog) return;
    activeDialog.resolve(value);
    activeDialog.cleanup();
    activeDialog = null;
  }

  function openDialog(options) {
    closeActive(false);

    return new Promise((resolve) => {
      const previousFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      const tone = options.tone ?? "neutral";
      const titleId = `dialog-title-${Date.now().toString(36)}`;
      const messageId = `dialog-message-${Date.now().toString(36)}`;

      const confirmButton = button(
        options.confirmLabel ?? "Confirmar",
        tone === "danger" ? "button button-danger" : "button button-primary",
      );
      const cancelButton = options.cancelLabel === null
        ? null
        : button(options.cancelLabel ?? "Cancelar", "button button-secondary");

      const expectedInput = options.expectedText
        ? el("input", {
          attrs: {
            type: "text",
            autocomplete: "off",
            spellcheck: "false",
            "aria-label": `Digite ${options.expectedText} para confirmar`,
          },
        })
        : null;

      if (expectedInput) {
        confirmButton.disabled = true;
        expectedInput.addEventListener("input", () => {
          confirmButton.disabled = expectedInput.value === options.expectedText ? false : true;
        });
      }

      const dialog = el("section", {
        className: "dialog",
        attrs: {
          role: options.role ?? "dialog",
          "aria-modal": "true",
          "aria-labelledby": titleId,
          "aria-describedby": messageId,
          "data-tone": tone,
        },
      }, [
        el("div", { className: "dialog-header" }, [
          el("span", { className: "dialog-icon" }, [icon(options.icon ?? TONE_ICONS[tone] ?? TONE_ICONS.neutral)]),
          el("div", {}, [
            options.kicker ? el("span", { className: "dialog-kicker", text: options.kicker }) : null,
            el("h2", { text: options.title ?? "Mensagem", attrs: { id: titleId } }),
          ]),
        ]),
        options.message ? el("p", { className: "dialog-message", text: options.message, attrs: { id: messageId } }) : null,
        options.details?.length ? detailsList(options.details) : null,
        expectedInput ? textConfirmation(options.expectedText, expectedInput) : null,
        el("div", { className: "dialog-actions" }, [
          cancelButton,
          confirmButton,
        ]),
      ]);

      const backdrop = el("div", { className: "dialog-backdrop" }, [dialog]);
      container.appendChild(backdrop);

      function finish(value) {
        if (activeDialog?.backdrop !== backdrop) return;
        resolve(value);
        cleanup();
        activeDialog = null;
      }

      function cleanup() {
        document.removeEventListener("keydown", onKeydown);
        backdrop.remove();
        if (previousFocus?.isConnected) {
          previousFocus.focus();
        }
      }

      function onKeydown(event) {
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

      refreshIcons();
      window.setTimeout(() => {
        (expectedInput ?? firstFocusable(dialog) ?? dialog).focus();
      }, 0);
    });
  }

  return {
    alert,
    alarm,
    closeActive,
    confirm,
    dangerConfirm,
    textConfirm,
  };
}

function detailsList(details) {
  return el("dl", { className: "dialog-details" }, details.flatMap((item) => [
    el("dt", { text: item.label }),
    el("dd", { text: item.value }),
  ]));
}

function textConfirmation(expectedText, input) {
  return el("label", { className: "dialog-confirmation" }, [
    el("span", { text: `Digite ${expectedText} para confirmar.` }),
    input,
  ]);
}

function trapFocus(event, container) {
  const focusable = [...container.querySelectorAll(FOCUSABLE_SELECTOR)];
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

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

function firstFocusable(container) {
  return container.querySelector(FOCUSABLE_SELECTOR);
}

function createRoot() {
  const root = el("div", { className: "dialog-root", attrs: { id: "dialog-root" } });
  document.body.appendChild(root);
  return root;
}

function button(label, className) {
  return el("button", {
    className,
    attrs: {
      type: "button",
    },
  }, [el("span", { text: label })]);
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
