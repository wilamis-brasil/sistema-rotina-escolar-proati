import {
  describePlanRoutines,
  getNotificationTypeLabel,
  type NotificationPlan,
} from "../../domain/notifications";
import { NOTIF_POPUP_FADE_S, NOTIF_POPUP_AUTOCLOSE_S } from "../../domain/limits";
import { el, icon, span } from "../dom";
import { refreshIcons } from "../icons";

export interface NotificationPopupCallbacks {
  onSeen(plan: NotificationPlan): void;
  onView(plan: NotificationPlan): void;
  onSnooze(plan: NotificationPlan): void;
  onMute(plan: NotificationPlan): void;
}

export interface NotificationPopupManager {
  show(plan: NotificationPlan): void;
  closeAllFor(planId: string): void;
  hasOpen(planId: string): boolean;
}

export function createNotificationPopupManager({
  root,
  callbacks,
}: {
  root: HTMLElement;
  callbacks: NotificationPopupCallbacks;
}): NotificationPopupManager {
  const openPopups = new Map<string, HTMLElement>();

  function show(plan: NotificationPlan): void {
    if (openPopups.has(plan.id)) return;

    const popup = el(
      "section",
      {
        className: `notification-popup notification-popup-${plan.type}`,
        attrs: {
          role: "status",
          "aria-live": "polite",
          "data-plan-id": plan.id,
        },
      },
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
          plan.routines.length > 1
            ? el("p", { className: "notification-popup-grouped", text: `${plan.routines.length} rotinas agrupadas` })
            : null,
          ...plan.routines.slice(0, 4).map((routine) =>
            el("p", { className: "notification-popup-line" }, [
              el("strong", { text: routine.teacher || "Professor" }),
              el("span", { text: ` · ${routine.room}` }),
              routine.devices.length ? el("small", { text: ` · ${routine.devices.join(", ")}` }) : null,
            ]),
          ),
          plan.routines.length > 4
            ? el("p", { className: "notification-popup-line", text: `+${plan.routines.length - 4} outras` })
            : null,
          plan.routines.length === 1 && plan.routines[0]?.subject
            ? el("p", { className: "notification-popup-line", text: `Aula: ${plan.routines[0]?.subject}` })
            : null,
        ]),
        el("footer", { className: "notification-popup-actions" }, [
          button("Entendi", "primary", () => {
            callbacks.onSeen(plan);
            removePopup(plan.id);
          }),
          plan.routines.length === 1
            ? button("Ver rotina", "secondary", () => {
                callbacks.onView(plan);
                removePopup(plan.id);
              })
            : button("Marcar todas como vistas", "secondary", () => {
                callbacks.onSeen(plan);
                removePopup(plan.id);
              }),
          button("Adiar", "ghost", () => {
            callbacks.onSnooze(plan);
            removePopup(plan.id);
          }),
          button("Silenciar hoje", "ghost", () => {
            callbacks.onMute(plan);
            removePopup(plan.id);
          }),
        ]),
        el("p", { className: "notification-popup-note", text: describePlanRoutines(plan) }),
      ].filter(Boolean) as Node[],
    );

    openPopups.set(plan.id, popup);
    root.appendChild(popup);
    refreshIcons(popup);

    window.setTimeout(() => {
      if (!openPopups.has(plan.id)) return;
      popup.classList.add("is-fading");
    }, NOTIF_POPUP_FADE_S * 1_000);

    window.setTimeout(() => {
      removePopup(plan.id);
    }, NOTIF_POPUP_AUTOCLOSE_S * 1_000);
  }

  function removePopup(planId: string): void {
    const popup = openPopups.get(planId);
    if (!popup) return;
    popup.classList.add("is-leaving");
    window.setTimeout(() => {
      popup.remove();
      openPopups.delete(planId);
    }, 180);
  }

  function closeAllFor(planId: string): void {
    removePopup(planId);
  }

  function hasOpen(planId: string): boolean {
    return openPopups.has(planId);
  }

  return { show, closeAllFor, hasOpen };
}

function iconFor(plan: NotificationPlan): string {
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

function closeButton(onClick: () => void): HTMLButtonElement {
  const btn = el(
    "button",
    {
      className: "notification-popup-close",
      attrs: {
        type: "button",
        "aria-label": "Fechar notificação",
        title: "Fechar notificação",
      },
    },
    [icon("x")],
  );
  btn.addEventListener("click", onClick);
  return btn;
}

function button(label: string, variant: "primary" | "secondary" | "ghost", onClick: () => void): HTMLButtonElement {
  const className =
    variant === "primary"
      ? "button button-primary button-small"
      : variant === "secondary"
        ? "button button-secondary button-small"
        : "notification-popup-ghost";
  const btn = el(
    "button",
    {
      className,
      attrs: { type: "button" },
    },
    [span(label)],
  );
  btn.addEventListener("click", onClick);
  return btn;
}
