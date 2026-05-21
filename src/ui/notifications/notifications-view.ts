import type { AppActions } from "../../app/controller";
import { formatDateTime, getTodayWeekdayId } from "../../domain/model";
import {
  buildNotificationId,
  formatIsoDate,
  getDueNotifications,
  getNotificationTypeLabel,
  getNotificationTypeShortLabel,
  getPlanWeekdayLabel,
  getRecentMissed,
  planTodayNotifications,
  summarizeNotifications,
  type NotificationPlan,
  type NotificationSummary,
} from "../../domain/notifications";
import {
  NOTIFICATION_LEAD_PRESETS,
  NOTIFICATION_SOUNDS,
  type AppState,
  type NotificationStatus,
  type NotificationType,
  type Routine,
} from "../../domain/types";
import { el, icon, replaceChildren, span } from "../dom";
import { refreshIcons } from "../icons";
import type { ToastManager } from "../toasts";
import type { UIRefs } from "../ui-refs";
import { buildGoogleCalendarUrl, downloadIcsForRoutine } from "./calendar-export";
import { createNotificationPopupManager } from "./notification-popup";
import { createSoundPlayer } from "./notification-sound";

type NotificationsRefs = Pick<
  UIRefs,
  | "notificationBellButton"
  | "notificationBellBadge"
  | "notificationsStatus"
  | "notificationsSettings"
  | "notificationsUpcoming"
  | "notificationsRecent"
  | "notificationsCalendar"
  | "notificationsTestSound"
  | "notificationsMarkAll"
  | "notificationPopupRoot"
>;

interface NotificationsView {
  bindEvents(): void;
  render(): void;
  start(): void;
  refresh(): void;
}

export function createNotificationsView({
  refs,
  getState,
  actions,
  toasts,
  onEditRoutine,
  onNavigateToView,
}: {
  refs: NotificationsRefs;
  getState: () => AppState;
  actions: AppActions;
  toasts: ToastManager;
  onEditRoutine: (routine: Routine) => void;
  onNavigateToView: (viewId: string) => void;
}): NotificationsView {
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
    },
  });
  const sound = createSoundPlayer();
  const playedSoundFor = new Set<string>();
  let timerHandle: number | null = null;
  let lastMissedNoticeDate = "";

  function markStatus(plan: NotificationPlan, status: NotificationStatus, extra?: { snoozedUntil?: string }) {
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
      toasts.show({ type: "error", title: "Falha", message: result.errors.join(" ") });
      return;
    }
    refresh();
  }

  function snooze(plan: NotificationPlan): void {
    const settings = getState().settings.notifications;
    if (!settings.allowSnooze) {
      toasts.show({ type: "info", title: "Adiamento desativado", message: "Ative o adiamento nas configurações." });
      return;
    }
    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes() + settings.defaultSnoozeMinutes;
    const safe = Math.min(23 * 60 + 59, Math.max(0, minutes));
    const hh = String(Math.floor(safe / 60)).padStart(2, "0");
    const mm = String(safe % 60).padStart(2, "0");
    const snoozedUntil = `${hh}:${mm}`;
    markStatus(plan, "adiada", { snoozedUntil });
    toasts.show({ type: "info", title: "Adiada", message: `Reaparece às ${snoozedUntil}.` });
  }

  function muteForToday(plan: NotificationPlan): void {
    const todayDate = formatIsoDate(new Date());
    const state = getState();
    const ids = state.routines
      .filter((routine) => plan.routineIds.includes(routine.id))
      .flatMap((routine) => buildMuteIds(routine, todayDate));
    if (ids.length === 0) return;
    ids.forEach((entry) => {
      actions.recordNotificationStatus(entry);
    });
    refresh();
    toasts.show({ type: "info", title: "Silenciado", message: "Notificações dessa rotina hoje foram marcadas como vistas." });
  }

  function buildMuteIds(routine: Routine, todayDate: string) {
    const result: {
      id: string;
      status: NotificationStatus;
      date: string;
      type: NotificationType;
      time: string;
      routineIds: string[];
    }[] = [];
    const settings = getState().settings.notifications;
    const lead = routine.notification?.leadMinutes ?? settings.defaultLeadMinutes;
    if (lead > 0) {
      result.push({
        id: buildNotificationId(todayDate, "aviso_antecipado", routine.startTime, [routine.id]),
        status: "ignorada",
        date: todayDate,
        type: "aviso_antecipado",
        time: routine.startTime,
        routineIds: [routine.id],
      });
    }
    result.push({
      id: buildNotificationId(todayDate, "inicio", routine.startTime, [routine.id]),
      status: "ignorada",
      date: todayDate,
      type: "inicio",
      time: routine.startTime,
      routineIds: [routine.id],
    });
    if (routine.endTime) {
      result.push({
        id: buildNotificationId(todayDate, "termino", routine.endTime, [routine.id]),
        status: "ignorada",
        date: todayDate,
        type: "termino",
        time: routine.endTime,
        routineIds: [routine.id],
      });
    }
    return result;
  }

  function bindEvents(): void {
    refs.notificationBellButton.addEventListener("click", () => {
      onNavigateToView("notifications");
    });
    refs.notificationsTestSound.addEventListener("click", () => {
      const settings = getState().settings.notifications;
      if (!settings.soundEnabled || settings.soundName === "none") {
        toasts.show({ type: "info", title: "Som desativado", message: "Ative o som para testar." });
        return;
      }
      void sound.play(settings.soundName);
    });
    refs.notificationsMarkAll.addEventListener("click", () => {
      const plans = computePlans();
      const pending = plans.filter((plan) => plan.status === "pendente" || plan.status === "exibida" || plan.status === "adiada");
      if (pending.length === 0) {
        toasts.show({ type: "info", title: "Nada para marcar", message: "Sem notificações pendentes hoje." });
        return;
      }
      pending.forEach((plan) => {
        actions.recordNotificationStatus({
          id: plan.id,
          status: "vista",
          date: plan.date,
          type: plan.type,
          time: plan.time,
          routineIds: plan.routineIds,
        });
      });
      refresh();
      toasts.show({ type: "success", title: "Marcadas", message: `${pending.length} notificações marcadas como vistas.` });
    });
  }

  function computePlans(): NotificationPlan[] {
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

  function render(): void {
    const plans = computePlans();
    const now = new Date();
    const summary = summarizeNotifications(plans, now);
    renderBellBadge(summary);
    renderStatus(summary);
    renderSettings();
    renderUpcoming(plans, now);
    renderRecent(plans, now);
    renderCalendar(plans);
    refreshIcons(refs.notificationsSettings);
    refreshIcons(refs.notificationsUpcoming);
    refreshIcons(refs.notificationsRecent);
    refreshIcons(refs.notificationsCalendar);
  }

  function renderBellBadge(summary: NotificationSummary): void {
    const count = summary.pending + summary.unseen + summary.overdue;
    refs.notificationBellBadge.textContent = String(count);
    refs.notificationBellBadge.hidden = count === 0;
    refs.notificationBellButton.classList.toggle("has-pending", count > 0);
  }

  function renderStatus(summary: NotificationSummary): void {
    const nextLabel = summary.nextPending
      ? `${summary.nextPending.time} · ${getNotificationTypeShortLabel(summary.nextPending.type)}`
      : "Sem próximo aviso";

    replaceChildren(refs.notificationsStatus, [
      statusCard("Próximo aviso", nextLabel, summary.nextPending ? formatDateTime(`${summary.nextPending.date}T${summary.nextPending.time}:00`) : "Sem retiradas pendentes."),
      statusCard("Pendentes hoje", String(summary.pending), summary.overdue ? `${summary.overdue} atrasada(s)` : "Sem atrasos"),
      statusCard("Não vistas", String(summary.unseen), summary.unseen === 0 ? "Tudo conferido" : "Confira a lista abaixo"),
    ]);
  }

  function renderSettings(): void {
    const settings = getState().settings.notifications;

    const enabledToggle = toggleRow("Ativar notificações internas", settings.enabled, (value) => {
      actions.updateNotificationSettings({ enabled: value });
      refresh();
    });

    const leadSelect = el(
      "select",
      { className: "form-input notifications-lead-select" },
      [
        ...NOTIFICATION_LEAD_PRESETS.map((value) => optionNode(String(value), `${value} min antes`, settings.defaultLeadMinutes === value)),
        optionNode("custom", "Personalizado…", !NOTIFICATION_LEAD_PRESETS.some((value) => value === settings.defaultLeadMinutes)),
      ],
    );

    const leadCustom = el("input", {
      className: "form-input notifications-lead-custom",
      attrs: {
        type: "number",
        min: "0",
        max: "240",
        step: "1",
        placeholder: "Minutos antes",
      },
    });
    leadCustom.value = String(settings.defaultLeadMinutes);
    leadCustom.hidden = NOTIFICATION_LEAD_PRESETS.some((value) => value === settings.defaultLeadMinutes);

    leadSelect.addEventListener("change", () => {
      if (leadSelect.value === "custom") {
        leadCustom.hidden = false;
        leadCustom.focus();
        return;
      }
      const next = Number(leadSelect.value);
      if (Number.isFinite(next)) {
        actions.updateNotificationSettings({ defaultLeadMinutes: next });
        refresh();
      }
    });
    leadCustom.addEventListener("change", () => {
      const next = Number(leadCustom.value);
      if (!Number.isFinite(next) || next < 0 || next > 240) {
        toasts.show({ type: "error", title: "Valor inválido", message: "Use um número entre 0 e 240." });
        return;
      }
      actions.updateNotificationSettings({ defaultLeadMinutes: Math.round(next) });
      refresh();
    });

    const soundToggle = toggleRow("Tocar som ao notificar", settings.soundEnabled, (value) => {
      actions.updateNotificationSettings({ soundEnabled: value });
      refresh();
    });

    const soundSelect = el(
      "select",
      { className: "form-input" },
      NOTIFICATION_SOUNDS.map((option) => optionNode(option.value, option.label, settings.soundName === option.value)),
    );
    soundSelect.addEventListener("change", () => {
      actions.updateNotificationSettings({ soundName: soundSelect.value as typeof settings.soundName });
      refresh();
    });

    const groupingToggle = toggleRow("Agrupar notificações próximas", settings.groupingEnabled, (value) => {
      actions.updateNotificationSettings({ groupingEnabled: value });
      refresh();
    });

    const snoozeToggle = toggleRow("Permitir adiamento (snooze)", settings.allowSnooze, (value) => {
      actions.updateNotificationSettings({ allowSnooze: value });
      refresh();
    });

    const snoozeInput = el("input", {
      className: "form-input notifications-snooze-input",
      attrs: { type: "number", min: "1", max: "120", step: "1" },
    });
    snoozeInput.value = String(settings.defaultSnoozeMinutes);
    snoozeInput.addEventListener("change", () => {
      const next = Number(snoozeInput.value);
      if (!Number.isFinite(next) || next < 1 || next > 120) {
        toasts.show({ type: "error", title: "Valor inválido", message: "Use de 1 a 120 minutos." });
        return;
      }
      actions.updateNotificationSettings({ defaultSnoozeMinutes: Math.round(next) });
      refresh();
    });

    replaceChildren(refs.notificationsSettings, [
      el("div", { className: "notifications-settings-grid" }, [
        settingsRow("Estado", [enabledToggle]),
        settingsRow("Antecedência padrão", [leadSelect, leadCustom]),
        settingsRow("Som", [soundToggle, soundSelect]),
        settingsRow("Agrupamento", [groupingToggle]),
        settingsRow("Adiamento", [snoozeToggle, labeledInline("Padrão (min)", snoozeInput)]),
      ]),
    ]);
  }

  function renderUpcoming(plans: NotificationPlan[], now: Date): void {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const upcoming = plans.filter((plan) => {
      if (plan.status === "vista" || plan.status === "ignorada") return false;
      return plan.fireMinutes >= currentMinutes - 5;
    });

    if (upcoming.length === 0) {
      replaceChildren(refs.notificationsUpcoming, [
        el("div", { className: "empty-state", text: "Sem próximas notificações hoje." }),
      ]);
      return;
    }

    replaceChildren(
      refs.notificationsUpcoming,
      upcoming.map((plan) => planCard(plan, { upcoming: true })),
    );
  }

  function renderRecent(plans: NotificationPlan[], now: Date): void {
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const recent = plans.filter((plan) => plan.fireMinutes < currentMinutes);

    if (recent.length === 0) {
      replaceChildren(refs.notificationsRecent, [
        el("div", { className: "empty-state", text: "Sem registro de notificações disparadas hoje." }),
      ]);
      return;
    }

    replaceChildren(
      refs.notificationsRecent,
      recent
        .slice()
        .sort((a, b) => b.fireMinutes - a.fireMinutes)
        .map((plan) => planCard(plan, { upcoming: false })),
    );
  }

  function renderCalendar(plans: NotificationPlan[]): void {
    const target =
      plans.find((plan) => plan.status === "pendente" || plan.status === "adiada") ??
      plans[0];

    if (!target) {
      replaceChildren(refs.notificationsCalendar, [
        el("p", { className: "notice-text", text: "Cadastre rotinas para gerar links de calendário." }),
      ]);
      return;
    }

    const routine = target.routines[0];
    if (!routine) {
      replaceChildren(refs.notificationsCalendar, []);
      return;
    }

    const googleUrl = buildGoogleCalendarUrl(routine);
    const googleLink = el(
      "a",
      {
        className: "button button-secondary button-small",
        attrs: {
          href: googleUrl ?? "#",
          target: "_blank",
          rel: "noopener noreferrer",
        },
      },
      [icon("calendar-days"), span("Google Calendar")],
    );

    const icsButton = el(
      "button",
      { className: "button button-secondary button-small", attrs: { type: "button" } },
      [icon("download"), span("Baixar .ics")],
    );
    icsButton.addEventListener("click", () => {
      if (!downloadIcsForRoutine(routine)) {
        toasts.show({ type: "error", title: "Falha", message: "Não foi possível gerar o arquivo." });
      }
    });

    replaceChildren(refs.notificationsCalendar, [
      el("div", { className: "notifications-calendar-target" }, [
        el("strong", { text: `${routine.subject || routine.teacher || routine.room}` }),
        el("span", { text: `${target.time} · ${getPlanWeekdayLabel(target)}` }),
      ]),
      el("div", { className: "notifications-calendar-actions" }, [googleLink, icsButton]),
    ]);
  }

  function planCard(plan: NotificationPlan, options: { upcoming: boolean }): HTMLElement {
    const statusLabel = labelForStatus(plan);
    const typeLabel = getNotificationTypeLabel(plan.type);
    const routineLabel = plan.routines
      .slice(0, 3)
      .map((routine) => `${routine.teacher} · ${routine.room}`)
      .join("; ");

    const actionsRow = el(
      "div",
      { className: "notifications-list-actions" },
      [
        plan.status === "pendente" || plan.status === "exibida" || plan.status === "adiada"
          ? actionButtonInline("check-circle-2", "Marcar vista", () => markStatus(plan, "vista"))
          : null,
        options.upcoming && plan.routines[0]
          ? actionButtonInline("pencil", "Editar rotina", () => {
              const routine = plan.routines[0];
              if (routine) onEditRoutine(routine);
            })
          : null,
        getState().settings.notifications.allowSnooze && options.upcoming
          ? actionButtonInline("alarm-clock", "Adiar", () => snooze(plan))
          : null,
      ].filter(Boolean) as HTMLElement[],
    );

    return el(
      "article",
      { className: `notifications-card status-${plan.status}` },
      [
        el("div", { className: "notifications-card-top" }, [
          el("strong", { text: `${plan.time} · ${typeLabel}` }),
          el("span", { className: "notifications-status-chip", text: statusLabel }),
        ]),
        el("p", { className: "notifications-card-body", text: routineLabel || "Sem rotina associada." }),
        plan.routines.length > 3
          ? el("p", { className: "notifications-card-extra", text: `+${plan.routines.length - 3} outras rotinas no mesmo horário` })
          : null,
        plan.snoozedUntilMinutes !== undefined
          ? el("p", { className: "notifications-card-extra", text: `Adiada até ${formatMinutes(plan.snoozedUntilMinutes)}` })
          : null,
        actionsRow,
      ].filter(Boolean) as Node[],
    );
  }

  function start(): void {
    if (timerHandle !== null) return;
    tick();
    timerHandle = window.setInterval(tick, 30_000);
    window.addEventListener("focus", tick);
    handleMissedOnOpen();
  }

  function handleMissedOnOpen(): void {
    const now = new Date();
    const todayDate = formatIsoDate(now);
    if (lastMissedNoticeDate === todayDate) return;
    lastMissedNoticeDate = todayDate;

    const plans = computePlans();
    const missed = getRecentMissed(plans, now);
    if (missed.length === 0) return;

    toasts.show({
      type: "warning",
      title: "Você perdeu notificações",
      message: `${missed.length} aviso(s) interno(s) das últimas horas. Veja a Central.`,
      timeout: 9000,
    });
  }

  function tick(): void {
    const plans = computePlans();
    const now = new Date();
    const due = getDueNotifications(plans, now);
    const settings = getState().settings.notifications;

    due.forEach((plan) => {
      if (popups.hasOpen(plan.id)) return;
      popups.show(plan);
      if (plan.status === "pendente") {
        actions.recordNotificationStatus({
          id: plan.id,
          status: "exibida",
          date: plan.date,
          type: plan.type,
          time: plan.time,
          routineIds: plan.routineIds,
        });
      }
      if (settings.soundEnabled && settings.soundName !== "none" && !playedSoundFor.has(plan.id)) {
        playedSoundFor.add(plan.id);
        void sound.play(settings.soundName);
      }
    });
    render();
  }

  function refresh(): void {
    tick();
  }

  return { bindEvents, render, start, refresh };
}

function statusCard(label: string, value: string, helper: string): HTMLElement {
  return el("div", { className: "notifications-status-card" }, [
    el("span", { className: "eyebrow", text: label }),
    el("strong", { text: value }),
    el("small", { text: helper }),
  ]);
}

function settingsRow(title: string, controls: Node[]): HTMLElement {
  return el("div", { className: "notifications-setting" }, [
    el("strong", { className: "notifications-setting-title", text: title }),
    el("div", { className: "notifications-setting-controls" }, controls),
  ]);
}

function toggleRow(label: string, checked: boolean, onChange: (value: boolean) => void): HTMLElement {
  const input = el("input", { attrs: { type: "checkbox" } });
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return el("label", { className: "notifications-toggle" }, [input, span(label)]);
}

function optionNode(value: string, label: string, selected = false): HTMLOptionElement {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  if (selected) node.selected = true;
  return node;
}

function labeledInline(label: string, control: HTMLElement): HTMLElement {
  return el("label", { className: "notifications-inline-field" }, [el("span", { text: label }), control]);
}

function actionButtonInline(iconName: string, label: string, onClick: () => void): HTMLButtonElement {
  const btn = el(
    "button",
    { className: "button button-secondary button-small", attrs: { type: "button" } },
    [icon(iconName), span(label)],
  );
  btn.addEventListener("click", onClick);
  return btn;
}

function labelForStatus(plan: NotificationPlan): string {
  if (plan.isOverdue && plan.status === "pendente") return "Atrasada";
  switch (plan.status) {
    case "pendente":
      return "Pendente";
    case "exibida":
      return "Exibida";
    case "vista":
      return "Vista";
    case "adiada":
      return "Adiada";
    case "ignorada":
      return "Ignorada";
    case "desativada":
      return "Desativada";
    default:
      return plan.status;
  }
}

function formatMinutes(value: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, value));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
