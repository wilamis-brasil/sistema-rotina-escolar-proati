import { describePlanRoutines, getNotificationTypeLabel } from "../../domain/notifications.js";
import { NOTIF_POPUP_AUTOCLOSE_S, NOTIF_POPUP_FADE_S } from "../../domain/limits.js";
import { el, icon, span } from "../dom.js";
import { refreshIcons } from "../icons.js";

/** @typedef {import("../../domain/notifications.js").NotificationPlan} NotificationPlan */
/** @typedef {{ iconName: string, label: string, onSelect: () => void }} MoreMenuItem */

/**
 * Popups de aviso que aparecem na tela enquanto a aba está aberta.
 * @param {{ root: HTMLElement, callbacks: { onSeen: (p: NotificationPlan) => void, onView: (p: NotificationPlan) => void, onSnooze: (p: NotificationPlan) => void, onMute: (p: NotificationPlan) => void, canSnooze: () => boolean } }} deps
 */
export function createNotificationPopupManager({ root, callbacks }) {
  /** @type {Map<string, HTMLElement>} */
  const openPopups = new Map();

  /** @param {NotificationPlan} plan */
  function show(plan) {
    if (openPopups.has(plan.id)) return;

    /** @type {MoreMenuItem[]} */
    const moreItems = [];
    if (callbacks.canSnooze()) {
      moreItems.push({
        iconName: "alarm-clock",
        label: "Adiar este aviso",
        onSelect: () => {
          callbacks.onSnooze(plan);
          removePopup(plan.id);
        },
      });
    }
    moreItems.push({
      iconName: "bell-off",
      label: "Silenciar avisos desta rotina hoje",
      onSelect: () => {
        callbacks.onMute(plan);
        removePopup(plan.id);
      },
    });

    const primaryAction = button("Marcar como visto", "primary", () => {
      callbacks.onSeen(plan);
      removePopup(plan.id);
    });

    const secondaryAction =
      plan.routines.length === 1
        ? button("Abrir rotina", "secondary", () => {
            callbacks.onView(plan);
            removePopup(plan.id);
          })
        : button("Marcar todos como vistos", "secondary", () => {
            callbacks.onSeen(plan);
            removePopup(plan.id);
          });

    const trailing = moreItems.length === 1 ? trailingSingleAction(moreItems[0]) : moreMenu(plan.id, moreItems);

    const popup = el(
      "section",
      { className: `notification-popup notification-popup-${plan.type}`, attrs: { role: "status", "aria-live": "polite", "data-plan-id": plan.id } },
      [
        el("header", { className: "notification-popup-header" }, [
          el("span", { className: "notification-popup-icon" }, [icon(iconFor(plan))]),
          el("div", { className: "notification-popup-titles" }, [
            el("strong", { text: getNotificationTypeLabel(plan.type) }),
            el("span", { text: `Horário ${plan.time}` }),
          ]),
          closeButton(() => {
            callbacks.onSeen(plan);
            removePopup(plan.id);
          }),
        ]),
        el("div", { className: "notification-popup-body" }, [
          plan.routines.length > 1 ? el("p", { className: "notification-popup-grouped", text: `${plan.routines.length} rotinas agrupadas neste horário` }) : null,
          ...plan.routines.slice(0, 4).map((routine) =>
            el("p", { className: "notification-popup-line" }, [
              el("strong", { text: routine.teacher || "Professor" }),
              el("span", { text: ` · ${routine.room}` }),
              routine.devices.length ? el("small", { text: ` · ${routine.devices.join(", ")}` }) : null,
            ]),
          ),
          plan.routines.length > 4 ? el("p", { className: "notification-popup-line", text: `+${plan.routines.length - 4} outras` }) : null,
          plan.routines.length === 1 && plan.routines[0]?.subject ? el("p", { className: "notification-popup-line", text: `Aula: ${plan.routines[0]?.subject}` }) : null,
        ]),
        el("footer", { className: "notification-popup-actions" }, [primaryAction, secondaryAction, trailing]),
        el("p", { className: "notification-popup-note", text: describePlanRoutines(plan) }),
      ].filter(Boolean),
    );

    openPopups.set(plan.id, popup);
    root.appendChild(popup);
    refreshIcons(popup);

    window.setTimeout(() => {
      if (!openPopups.has(plan.id)) return;
      popup.classList.add("is-fading");
    }, NOTIF_POPUP_FADE_S * 1_000);

    window.setTimeout(() => removePopup(plan.id), NOTIF_POPUP_AUTOCLOSE_S * 1_000);
  }

  /** @param {string} planId */
  function removePopup(planId) {
    const popup = openPopups.get(planId);
    if (!popup) return;
    popup.classList.add("is-leaving");
    window.setTimeout(() => {
      popup.remove();
      openPopups.delete(planId);
    }, 180);
  }

  return {
    show,
    /** @param {string} planId */
    closeAllFor: (planId) => removePopup(planId),
    /** @param {string} planId */
    hasOpen: (planId) => openPopups.has(planId),
  };
}

/** @param {NotificationPlan} plan @returns {string} */
function iconFor(plan) {
  switch (plan.type) {
    case "aviso_antecipado":
      return "bell-ring";
    case "inicio":
      return "alarm-clock";
    case "termino":
      return "check-circle-2";
    default:
      return "info";
  }
}

/** @param {() => void} onClick @returns {HTMLButtonElement} */
function closeButton(onClick) {
  const btn = el(
    "button",
    { className: "notification-popup-close", attrs: { type: "button", "aria-label": "Fechar aviso e marcar como visto", title: "Fechar aviso" } },
    [icon("x")],
  );
  btn.addEventListener("click", onClick);
  return btn;
}

/** @param {string} label @param {"primary" | "secondary"} variant @param {() => void} onClick @returns {HTMLButtonElement} */
function button(label, variant, onClick) {
  const className = variant === "primary" ? "button button-primary button-small" : "button button-secondary button-small";
  const btn = el("button", { className, attrs: { type: "button" } }, [span(label)]);
  btn.addEventListener("click", onClick);
  return btn;
}

/** @param {MoreMenuItem} item @returns {HTMLElement} */
function trailingSingleAction(item) {
  const btn = el(
    "button",
    { className: "button button-secondary button-small notification-popup-trailing", attrs: { type: "button", title: item.label, "aria-label": item.label } },
    [icon(item.iconName), span(item.label)],
  );
  btn.addEventListener("click", item.onSelect);
  return btn;
}

/** @param {string} planId @param {MoreMenuItem[]} items @returns {HTMLElement} */
function moreMenu(planId, items) {
  const panelId = `notification-popup-more-${planId}`;

  const trigger = el(
    "button",
    {
      className: "notification-popup-more-button",
      attrs: { type: "button", "aria-label": "Mais ações para este aviso", title: "Mais ações", "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": panelId },
    },
    [icon("more-horizontal")],
  );

  const panel = el(
    "div",
    { className: "notification-popup-more-panel", attrs: { id: panelId, role: "menu", hidden: "" } },
    items.map((item) => {
      const btn = el("button", { className: "notification-popup-more-item", attrs: { type: "button", role: "menuitem" } }, [icon(item.iconName), span(item.label)]);
      btn.addEventListener("click", () => {
        closeMenu();
        item.onSelect();
      });
      return btn;
    }),
  );

  const container = el("div", { className: "notification-popup-more" }, [trigger, panel]);
  let open = false;

  function openMenu() {
    if (open) return;
    open = true;
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("keydown", onKeyDown);
  }

  /** @param {{ focusTrigger?: boolean }} [options] */
  function closeMenu({ focusTrigger = false } = {}) {
    if (!open) return;
    open = false;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("keydown", onKeyDown);
    if (focusTrigger) trigger.focus();
  }

  /** @param {MouseEvent} event */
  function onDocumentClick(event) {
    if (!(event.target instanceof Node)) return;
    if (container.contains(event.target)) return;
    closeMenu();
  }

  /** @param {KeyboardEvent} event */
  function onKeyDown(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu({ focusTrigger: true });
    }
  }

  trigger.addEventListener("click", (event) => {
    event.stopPropagation();
    if (open) closeMenu({ focusTrigger: true });
    else openMenu();
  });

  return container;
}
