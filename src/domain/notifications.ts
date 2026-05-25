import { isValidTime, timeToMinutes, normalizeCase } from "./model";
import { NOTIF_TRIGGER_WINDOW, NOTIF_RECENT_DELAY_WINDOW } from "./limits";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  WEEKDAYS,
  type NotificationLogEntry,
  type NotificationSettings,
  type NotificationStatus,
  type NotificationType,
  type Routine,
  type WeekdayId,
} from "./types";

export interface NotificationPlan {
  id: string;
  type: NotificationType;
  date: string;
  weekday: WeekdayId;
  time: string;
  fireMinutes: number;
  status: NotificationStatus;
  routineIds: string[];
  routines: Routine[];
  snoozedUntilMinutes?: number;
  isOverdue: boolean;
}

export interface NotificationContext {
  now: Date;
  weekday: WeekdayId | null;
  todayDate: string;
  settings: NotificationSettings;
  routines: Routine[];
  log: NotificationLogEntry[];
}

const TYPE_LABELS: Record<NotificationType, string> = {
  aviso_antecipado: "Aviso antecipado",
  inicio: "Início da retirada",
  termino: "Término da retirada",
};

export function getNotificationTypeLabel(type: NotificationType): string {
  return TYPE_LABELS[type];
}

export function getNotificationTypeShortLabel(type: NotificationType): string {
  switch (type) {
    case "aviso_antecipado":
      return "Aviso";
    case "inicio":
      return "Início";
    case "termino":
      return "Término";
    default:
      return "";
  }
}

export function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function effectiveLead(routine: Routine, settings: NotificationSettings): number {
  const override = routine.notification?.leadMinutes;
  if (override === null) return 0;
  if (typeof override === "number" && Number.isFinite(override) && override >= 0) {
    return Math.round(override);
  }
  if (Number.isFinite(settings.defaultLeadMinutes) && settings.defaultLeadMinutes >= 0) {
    return Math.round(settings.defaultLeadMinutes);
  }
  return DEFAULT_NOTIFICATION_SETTINGS.defaultLeadMinutes;
}

function isRoutineNotificationEnabled(routine: Routine, settings: NotificationSettings): boolean {
  if (!settings.enabled) return false;
  if (routine.notification?.enabled === false) return false;
  return true;
}

interface BaseSeed {
  type: NotificationType;
  routine: Routine;
  date: string;
  time: string;
  fireMinutes: number;
}

function buildSeeds(routines: Routine[], settings: NotificationSettings, todayDate: string, weekday: WeekdayId): BaseSeed[] {
  const seeds: BaseSeed[] = [];
  routines.forEach((routine) => {
    if (routine.weekday !== weekday) return;
    if (!isRoutineNotificationEnabled(routine, settings)) return;
    if (!isValidTime(routine.startTime)) return;
    const startMinutes = timeToMinutes(routine.startTime);
    if (startMinutes === null) return;

    const leadMinutes = effectiveLead(routine, settings);
    if (leadMinutes > 0) {
      const fireMinutes = startMinutes - leadMinutes;
      if (fireMinutes >= 0) {
        seeds.push({
          type: "aviso_antecipado",
          routine,
          date: todayDate,
          time: minutesToTime(fireMinutes),
          fireMinutes,
        });
      }
    }

    seeds.push({
      type: "inicio",
      routine,
      date: todayDate,
      time: routine.startTime,
      fireMinutes: startMinutes,
    });

    if (isValidTime(routine.endTime)) {
      const endMinutes = timeToMinutes(routine.endTime);
      if (endMinutes !== null && endMinutes > startMinutes) {
        seeds.push({
          type: "termino",
          routine,
          date: todayDate,
          time: routine.endTime,
          fireMinutes: endMinutes,
        });
      }
    }
  });
  return seeds;
}

export function buildNotificationId(
  date: string,
  type: NotificationType,
  time: string,
  routineIds: string[],
): string {
  const sortedIds = [...routineIds].sort();
  return `notif::${date}::${type}::${time}::${sortedIds.join(",")}`;
}

function groupSeeds(
  seeds: BaseSeed[],
  settings: NotificationSettings,
  weekday: WeekdayId,
): NotificationPlan[] {
  const buckets = new Map<string, BaseSeed[]>();

  seeds
    .slice()
    .sort((a, b) => a.fireMinutes - b.fireMinutes)
    .forEach((seed) => {
      const groupKey = settings.groupingEnabled
        ? findGroupKey(buckets, seed, settings.groupingWindowMinutes)
        : `${seed.type}::${seed.date}::${seed.fireMinutes}::${seed.routine.id}`;
      const bucket = buckets.get(groupKey) ?? [];
      bucket.push(seed);
      buckets.set(groupKey, bucket);
    });

  const plans: NotificationPlan[] = [];
  buckets.forEach((bucketSeeds) => {
    const representative = bucketSeeds[0];
    if (!representative) return;
    const routineMap = new Map<string, Routine>();
    bucketSeeds.forEach((seed) => routineMap.set(seed.routine.id, seed.routine));
    const routines = [...routineMap.values()].sort((a, b) =>
      normalizeCase(a.teacher).localeCompare(normalizeCase(b.teacher), "pt-BR"),
    );
    const routineIds = routines.map((routine) => routine.id);
    const id = buildNotificationId(representative.date, representative.type, representative.time, routineIds);
    plans.push({
      id,
      type: representative.type,
      date: representative.date,
      weekday,
      time: representative.time,
      fireMinutes: representative.fireMinutes,
      status: "pendente",
      routineIds,
      routines,
      isOverdue: false,
    });
  });

  return plans.sort((a, b) => a.fireMinutes - b.fireMinutes);
}

function findGroupKey(
  buckets: Map<string, BaseSeed[]>,
  seed: BaseSeed,
  windowMinutes: number,
): string {
  for (const [key, group] of buckets.entries()) {
    const sample = group[0];
    if (!sample) continue;
    if (sample.type !== seed.type) continue;
    if (sample.date !== seed.date) continue;
    if (Math.abs(sample.fireMinutes - seed.fireMinutes) <= Math.max(0, windowMinutes)) {
      return key;
    }
  }
  return `${seed.type}::${seed.date}::${seed.fireMinutes}::${seed.routine.id}`;
}

function minutesToTime(value: number): string {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  const hours = Math.floor(safe / 60).toString().padStart(2, "0");
  const minutes = (safe % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function planTodayNotifications(context: NotificationContext): NotificationPlan[] {
  const weekday = context.weekday;
  if (!weekday) return [];
  if (!context.settings.enabled) return [];

  const seeds = buildSeeds(context.routines, context.settings, context.todayDate, weekday);
  const plans = groupSeeds(seeds, context.settings, weekday);
  const logIndex = new Map(context.log.map((entry) => [entry.id, entry]));
  const currentMinutes = context.now.getHours() * 60 + context.now.getMinutes();

  return plans.map((plan) => {
    const logEntry = logIndex.get(plan.id);
    let status: NotificationStatus = plan.status;
    let snoozedUntilMinutes: number | undefined;

    if (logEntry) {
      if (logEntry.status === "adiada" && logEntry.snoozedUntil) {
        const minutes = timeToMinutes(logEntry.snoozedUntil);
        if (minutes !== null) {
          snoozedUntilMinutes = minutes;
          status = currentMinutes >= minutes ? "pendente" : "adiada";
        } else {
          status = "adiada";
        }
      } else {
        status = logEntry.status;
      }
    }

    const isOverdue =
      status === "pendente" &&
      currentMinutes >= plan.fireMinutes &&
      currentMinutes - plan.fireMinutes <= NOTIF_RECENT_DELAY_WINDOW;

    return {
      ...plan,
      status,
      snoozedUntilMinutes,
      isOverdue,
    };
  });
}

export interface NotificationSummary {
  total: number;
  pending: number;
  overdue: number;
  unseen: number;
  nextPending?: NotificationPlan;
  recentMissed: NotificationPlan[];
}

export function summarizeNotifications(plans: NotificationPlan[], now: Date): NotificationSummary {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let pending = 0;
  let overdue = 0;
  let unseen = 0;
  let nextPending: NotificationPlan | undefined;
  const recentMissed: NotificationPlan[] = [];

  plans.forEach((plan) => {
    if (plan.status === "pendente" || plan.status === "adiada") pending += 1;
    if (plan.status === "exibida") unseen += 1;
    if (plan.isOverdue) {
      overdue += 1;
      if (currentMinutes - plan.fireMinutes <= NOTIF_RECENT_DELAY_WINDOW) {
        recentMissed.push(plan);
      }
    }
    if ((plan.status === "pendente" || plan.status === "adiada") && plan.fireMinutes >= currentMinutes) {
      if (!nextPending || plan.fireMinutes < nextPending.fireMinutes) {
        nextPending = plan;
      }
    }
  });

  return {
    total: plans.length,
    pending,
    overdue,
    unseen,
    nextPending,
    recentMissed,
  };
}

export function getDueNotifications(plans: NotificationPlan[], now: Date): NotificationPlan[] {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return plans.filter((plan) => {
    if (plan.status !== "pendente") return false;
    if (plan.fireMinutes > currentMinutes) return false;
    return currentMinutes - plan.fireMinutes <= NOTIF_TRIGGER_WINDOW;
  });
}

export function getRecentMissed(plans: NotificationPlan[], now: Date, windowMinutes = NOTIF_RECENT_DELAY_WINDOW): NotificationPlan[] {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return plans.filter((plan) => {
    if (plan.status !== "pendente") return false;
    if (plan.fireMinutes >= currentMinutes) return false;
    return currentMinutes - plan.fireMinutes <= windowMinutes;
  });
}

export function describePlanRoutines(plan: NotificationPlan): string {
  return plan.routines
    .map((routine) => `${routine.teacher} · ${routine.room}`)
    .join(" / ");
}

export function getPlanWeekdayLabel(plan: NotificationPlan): string {
  return WEEKDAYS.find((day) => day.id === plan.weekday)?.label ?? "";
}

