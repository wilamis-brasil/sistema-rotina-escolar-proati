import { formatDateTime, getTodayWeekdayId } from "../../domain/model.js";
import {
  formatIsoDate,
  getDueNotifications,
  getNotificationTypeLabel,
  getNotificationTypeShortLabel,
  getRecentMissed,
  planTodayNotifications,
  summarizeNotifications,
} from "../../domain/notifications.js";
import { NOTIF_TICK_INTERVAL_S } from "../../domain/limits.js";
import { el, replaceChildren } from "../dom.js";
import { refreshIcons } from "../icons.js";
import { createNotificationPopupManager } from "./notification-popup.js";
import { createSoundPlayer } from "./notification-sound.js";
import { renderNotificationSettings } from "./notifications-settings.js";
import { createCalendarPanel } from "./notifications-calendar.js";
import { actionButtonInline, formatMinutes, labelForStatus, statusCard } from "./notifications-helpers.js";

/** @typedef {import("../../domain/notifications.js").NotificationPlan} NotificationPlan */
/** @typedef {import("../../domain/notifications.js").NotificationSummary} NotificationSummary */
/** @typedef {import("../../domain/types.js").AppState} AppState */
/** @typedef {import("../../domain/types.js").NotificationStatus} NotificationStatus */
/** @typedef {import("../../domain/types.js").Routine} Routine */

/**
 * Central de avisos: planeja, exibe e responde às notificações do dia (popups,
 * som, status, configurações e exportação para calendário).
 * @param {{ refs: any, getState: () => AppState, actions: any, toasts: any, onEditRoutine: (r: Routine) => void, onNavigateToView: (viewId: string) => void }} deps
 */
export function createNotificationsView({ refs, getState, actions, toasts, onEditRoutine, onNavigateToView }) {
  const popups = createNotificationPopupManager({
    root: refs.notificationPopupRoot,
    callbacks: {
      onSeen: (plan) => markStatus(plan, "vista"),
      onView: (plan) => {
        markStatus(plan, "vista");
        const routine = plan.routines[0];
        if (routine) onEditRoutine(routine);
      },
      onSnooze: (plan) => snooze(plan),
      onMute: (plan) => muteForToday(plan),
      canSnooze: () => getState().settings.notifications.allowSnooze,
    },
  });
  const sound = createSoundPlayer();
  const playedSoundFor = new Set();
  const calendarPanel = createCalendarPanel({ container: refs.notificationsCalendar, getState, toasts });

  /** @type {number | null} */
  let timerHandle = null;
  let lastMissedNoticeDate = "";

  /** @param {NotificationPlan} plan @param {NotificationStatus} status @param {{ snoozedUntil?: string }} [extra] */
  function markStatus(plan, status, extra) {
    const result = actions.recordNotificationStatus({
      id: plan.id,
      status,
      date: plan.date,
      type: plan.type,
      time: plan.time,
      routineIds: plan.routineIds,
      ...(extra?.snoozedUntil ? { snoozedUntil: extra.snoozedUntil } : {}),
    });
    if (!result.ok) {
      toasts.show({ type: "error", title: "Não foi possível atualizar o aviso", message: result.errors.join(" ") });
      return;
    }
    refresh();
  }

  /** @param {NotificationPlan} plan */
  function snooze(plan) {
    const settings = getState().settings.notifications;
    if (!settings.allowSnooze) {
      toasts.show({ type: "info", title: "Adiamento desativado", message: "Ative o adiamento de avisos nas configurações da central." });
      return;
    }
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes() + settings.defaultSnoozeMinutes;
    const safe = Math.min(23 * 60 + 59, Math.max(0, minutes));
    const snoozedUntil = `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
    markStatus(plan, "adiada", { snoozedUntil });
    toasts.show({ type: "info", title: "Aviso adiado", message: `Reaparece às ${snoozedUntil}.` });
  }

  /** @param {NotificationPlan} plan */
  function muteForToday(plan) {
    const affected = computePlans().filter((p) => p.routineIds.some((id) => plan.routineIds.includes(id)));
    if (affected.length === 0) return;
    affected.forEach((p) => {
      actions.recordNotificationStatus({ id: p.id, status: "ignorada", date: p.date, type: p.type, time: p.time, routineIds: p.routineIds });
    });
    refresh();
    toasts.show({
      type: "info",
      title: "Avisos silenciados hoje",
      message: "Os próximos avisos desta rotina ficam marcados como vistos pelo restante do dia.",
    });
  }

  function bindEvents() {
    refs.notificationBellButton.addEventListener("click", () => onNavigateToView("notifications"));

    refs.notificationsTestSound.addEventListener("click", () => {
      const settings = getState().settings.notifications;
      if (!settings.soundEnabled || settings.soundName === "none") {
        toasts.show({ type: "info", title: "Som desativado", message: "Ative o som dos avisos nas configurações para ouvir o teste." });
        return;
      }
      void sound.play(settings.soundName);
    });

    refs.notificationsMarkAll.addEventListener("click", () => {
      const pending = computePlans().filter((plan) => plan.status === "pendente" || plan.status === "exibida" || plan.status === "adiada");
      if (pending.length === 0) {
        toasts.show({ type: "info", title: "Nenhum aviso pendente", message: "Não há avisos para marcar como vistos no momento." });
        return;
      }
      const result = actions.markAllNotificationsAsSeen(
        pending.map((plan) => ({ id: plan.id, date: plan.date, type: plan.type, time: plan.time, routineIds: plan.routineIds })),
      );
      if (!result.ok) {
        toasts.show({ type: "error", title: "Não foi possível atualizar os avisos", message: result.errors.join(" ") });
        return;
      }
      refresh();
      const plural = pending.length === 1 ? "" : "s";
      toasts.show({ type: "success", title: "Avisos atualizados", message: `${pending.length} aviso${plural} marcado${plural} como visto${plural}.` });
    });
  }

  /** @returns {NotificationPlan[]} */
  function computePlans() {
    const state = getState();
    const now = new Date();
    return planTodayNotifications({
      now,
      weekday: getTodayWeekdayId(now),
      todayDate: formatIsoDate(now),
      settings: state.settings.notifications,
      routines: state.routines,
      log: state.notificationLog ?? [],
    });
  }

  function render() {
    const plans = computePlans();
    const now = new Date();
    const summary = summarizeNotifications(plans, now);
    renderBellBadge(summary);
    renderStatus(summary);
    renderNotificationSettings({ container: refs.notificationsSettings, settings: getState().settings.notifications, actions, toasts, refresh });
    renderUpcoming(plans, now);
    renderRecent(plans, now);
    if (!calendarPanel.isFocused()) calendarPanel.render();
    refreshIcons(refs.notificationsSettings);
    refreshIcons(refs.notificationsUpcoming);
    refreshIcons(refs.notificationsRecent);
    refreshIcons(refs.notificationsCalendar);
  }

  /** @param {NotificationSummary} summary */
  function renderBellBadge(summary) {
    const count = summary.pending + summary.unseen + summary.overdue;
    refs.notificationBellBadge.textContent = String(count);
    refs.notificationBellBadge.hidden = count === 0;
    refs.notificationBellButton.classList.toggle("has-pending", count > 0);
  }

  /** @param {NotificationSummary} summary */
  function renderStatus(summary) {
    const nextLabel = summary.nextPending
      ? `${summary.nextPending.time} · ${getNotificationTypeShortLabel(summary.nextPending.type)}`
      : "Sem próximo aviso";

    replaceChildren(refs.notificationsStatus, [
      statusCard(
        "Próximo aviso",
        nextLabel,
        summary.nextPending ? formatDateTime(`${summary.nextPending.date}T${summary.nextPending.time}:00`) : "Sem retiradas pendentes hoje.",
      ),
      statusCard("Avisos pendentes hoje", String(summary.pending), summary.overdue ? `${summary.overdue} atrasado(s)` : "Nenhum em atraso"),
      statusCard("Avisos não vistos", String(summary.unseen), summary.unseen === 0 ? "Tudo em dia" : "Veja a lista abaixo"),
    ]);
  }

  /** @param {NotificationPlan[]} plans @param {Date} now */
  function renderUpcoming(plans, now) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const upcoming = plans.filter((plan) => {
      if (plan.status === "vista" || plan.status === "ignorada") return false;
      return plan.fireMinutes >= currentMinutes - 5;
    });

    if (upcoming.length === 0) {
      replaceChildren(refs.notificationsUpcoming, [el("div", { className: "empty-state", text: "Nenhum próximo aviso para hoje." })]);
      return;
    }
    replaceChildren(refs.notificationsUpcoming, upcoming.map((plan) => planCard(plan, { upcoming: true })));
  }

  /** @param {NotificationPlan[]} plans @param {Date} now */
  function renderRecent(plans, now) {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const recent = plans.filter((plan) => plan.fireMinutes < currentMinutes);

    if (recent.length === 0) {
      replaceChildren(refs.notificationsRecent, [el("div", { className: "empty-state", text: "Nenhum aviso foi exibido hoje." })]);
      return;
    }
    replaceChildren(
      refs.notificationsRecent,
      [...recent].sort((a, b) => b.fireMinutes - a.fireMinutes).map((plan) => planCard(plan, { upcoming: false })),
    );
  }

  /** @param {NotificationPlan} plan @param {{ upcoming: boolean }} options @returns {HTMLElement} */
  function planCard(plan, options) {
    const typeLabel = getNotificationTypeLabel(plan.type);
    const routineLabel = plan.routines.slice(0, 3).map((routine) => `${routine.teacher} · ${routine.room}`).join("; ");

    const actionsRow = el(
      "div",
      { className: "notifications-list-actions" },
      [
        plan.status === "pendente" || plan.status === "exibida" || plan.status === "adiada"
          ? actionButtonInline("check-circle-2", "Marcar como visto", () => markStatus(plan, "vista"))
          : null,
        options.upcoming && plan.routines[0]
          ? actionButtonInline("pencil", "Editar rotina deste aviso", () => {
              const routine = plan.routines[0];
              if (routine) onEditRoutine(routine);
            })
          : null,
        getState().settings.notifications.allowSnooze && options.upcoming ? actionButtonInline("alarm-clock", "Adiar aviso", () => snooze(plan)) : null,
      ].filter(Boolean),
    );

    return el(
      "article",
      { className: `notifications-card status-${plan.status}` },
      [
        el("div", { className: "notifications-card-top" }, [
          el("strong", { text: `${plan.time} · ${typeLabel}` }),
          el("span", { className: "notifications-status-chip", text: labelForStatus(plan) }),
        ]),
        el("p", { className: "notifications-card-body", text: routineLabel || "Sem rotina associada." }),
        plan.routines.length > 3 ? el("p", { className: "notifications-card-extra", text: `+${plan.routines.length - 3} outras rotinas no mesmo horário` }) : null,
        plan.snoozedUntilMinutes !== undefined ? el("p", { className: "notifications-card-extra", text: `Adiado até ${formatMinutes(plan.snoozedUntilMinutes)}` }) : null,
        actionsRow,
      ].filter(Boolean),
    );
  }

  function start() {
    if (timerHandle !== null) return;
    tick();
    timerHandle = window.setInterval(tick, NOTIF_TICK_INTERVAL_S * 1_000);
    window.addEventListener("focus", tick);
    handleMissedOnOpen();
  }

  function handleMissedOnOpen() {
    const now = new Date();
    const todayDate = formatIsoDate(now);
    if (lastMissedNoticeDate === todayDate) return;
    lastMissedNoticeDate = todayDate;

    const missed = getRecentMissed(computePlans(), now);
    if (missed.length === 0) return;
    toasts.show({
      type: "warning",
      title: "Avisos perdidos",
      message: `${missed.length} aviso${missed.length === 1 ? "" : "s"} das últimas horas. Veja a Central de avisos.`,
      timeout: 9000,
    });
  }

  function tick() {
    const plans = computePlans();
    const now = new Date();
    const due = getDueNotifications(plans, now);
    const settings = getState().settings.notifications;

    due.forEach((plan) => {
      if (popups.hasOpen(plan.id)) return;
      popups.show(plan);
      if (plan.status === "pendente") {
        actions.recordNotificationStatus({ id: plan.id, status: "exibida", date: plan.date, type: plan.type, time: plan.time, routineIds: plan.routineIds });
      }
      if (settings.soundEnabled && settings.soundName !== "none" && !playedSoundFor.has(plan.id)) {
        playedSoundFor.add(plan.id);
        void sound.play(settings.soundName);
      }
    });
    render();
  }

  function refresh() {
    tick();
  }

  return { bindEvents, render, start, refresh };
}
