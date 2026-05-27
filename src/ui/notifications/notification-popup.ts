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
  canSnooze(): boolean;
}

export interface NotificationPopupManager {
  show(plan: NotificationPlan): void;
  closeAllFor(planId: string): void;
  hasOpen(planId: string): boolean;
}

interface MoreMenuItem {
  iconName: string;
  label: string;
  onSelect(): void;
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

    const moreItems: MoreMenuItem[] = [];
    if (callbacks.canSnooze()) {
      moreItems.push({
        iconName: "alarm-clock",
        label: "Adiar",
        onSelect: () => {
          callbacks.onSnooze(plan);
          removePopup(plan.id);
        },
      });
    }
    moreItems.push({
      iconName: "bell-off",
      label: "Silenciar hoje",
      onSelect: () => {
        callbacks.onMute(plan);
        removePopup(plan.id);
      },
    });

    const primaryAction = button("Marcar vista", "primary", () => {
      callbacks.onSeen(plan);
      removePopup(plan.id);
    });

    const secondaryAction =
      plan.routines.length === 1
        ? button("Ver rotina", "secondary", () => {
            callbacks.onView(plan);
            removePopup(plan.id);
          })
        : button("Marcar todas vistas", "secondary", () => {
            callbacks.onSeen(plan);
            removePopup(plan.id);
          });

    const trailing = moreItems.length === 1
      ? trailingSingleAction(moreItems[0]!)
      : moreMenu(plan.id, moreItems);

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
        el("footer", { className: "notification-popup-actions" }, [primaryAction, secondaryAction, trailing]),
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

function button(label: string, variant: "primary" | "secondary", onClick: () => void): HTMLButtonElement {
  const className =
    variant === "primary"
      ? "button button-primary button-small"
      : "button button-secondary button-small";
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

function trailingSingleAction(item: MoreMenuItem): HTMLElement {
  const btn = el(
    "button",
    {
      className: "button button-secondary button-small",
      attrs: { type: "button", title: item.label, "aria-label": item.label },
    },
    [icon(item.iconName), span(item.label)],
  );
  btn.style.marginLeft = "auto";
  btn.addEventListener("click", item.onSelect);
  return btn;
}

function moreMenu(planId: string, items: MoreMenuItem[]): HTMLElement {
  const panelId = `notification-popup-more-${planId}`;

  const trigger = el(
    "button",
    {
      className: "notification-popup-more-button",
      attrs: {
        type: "button",
        "aria-label": "Mais ações",
        title: "Mais ações",
        "aria-haspopup": "menu",
        "aria-expanded": "false",
        "aria-controls": panelId,
      },
    },
    [icon("more-horizontal")],
  );

  const panel = el(
    "div",
    {
      className: "notification-popup-more-panel",
      attrs: { id: panelId, role: "menu", hidden: "" },
    },
    items.map((item) => {
      const btn = el(
        "button",
        {
          className: "notification-popup-more-item",
          attrs: { type: "button", role: "menuitem" },
        },
        [icon(item.iconName), span(item.label)],
      );
      btn.addEventListener("click", () => {
        closeMenu();
        item.onSelect();
      });
      return btn;
    }),
  );

  const container = el("div", { className: "notification-popup-more" }, [trigger, panel]);

  let open = false;

  function openMenu(): void {
    if (open) return;
    open = true;
    panel.hidden = false;
    trigger.setAttribute("aria-expanded", "true");
    document.addEventListener("click", onDocumentClick, true);
    document.addEventListener("keydown", onKeyDown);
  }

  function closeMenu({ focusTrigger = false }: { focusTrigger?: boolean } = {}): void {
    if (!open) return;
    open = false;
    panel.hidden = true;
    trigger.setAttribute("aria-expanded", "false");
    document.removeEventListener("click", onDocumentClick, true);
    document.removeEventListener("keydown", onKeyDown);
    if (focusTrigger) trigger.focus();
  }

  function onDocumentClick(event: MouseEvent): void {
    if (!(event.target instanceof Node)) return;
    if (container.contains(event.target)) return;
    closeMenu();
  }

  function onKeyDown(event: KeyboardEvent): void {
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
