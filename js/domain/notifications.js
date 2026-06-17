// @ts-check

import { isValidTime, normalizeCase, timeToMinutes } from "./model-utils.js";
import { NOTIF_RECENT_DELAY_WINDOW, NOTIF_TRIGGER_WINDOW } from "./limits.js";
import { DEFAULT_NOTIFICATION_SETTINGS, WEEKDAYS } from "./types.js";

/** @typedef {import("./types.js").Routine} Routine */
/** @typedef {import("./types.js").WeekdayId} WeekdayId */
/** @typedef {import("./types.js").NotificationType} NotificationType */
/** @typedef {import("./types.js").NotificationStatus} NotificationStatus */
/** @typedef {import("./types.js").NotificationSettings} NotificationSettings */
/** @typedef {import("./types.js").NotificationLogEntry} NotificationLogEntry */

/**
 * @typedef {object} NotificationPlan
 * @property {string} id
 * @property {NotificationType} type
 * @property {string} date
 * @property {WeekdayId} weekday
 * @property {string} time
 * @property {number} fireMinutes
 * @property {NotificationStatus} status
 * @property {string[]} routineIds
 * @property {Routine[]} routines
 * @property {number} [snoozedUntilMinutes]
 * @property {boolean} isOverdue
 */

/**
 * @typedef {object} NotificationContext
 * @property {Date} now
 * @property {WeekdayId | null} weekday
 * @property {string} todayDate
 * @property {NotificationSettings} settings
 * @property {Routine[]} routines
 * @property {NotificationLogEntry[]} log
 */

/**
 * @typedef {object} NotificationSummary
 * @property {number} total
 * @property {number} pending
 * @property {number} overdue
 * @property {number} unseen
 * @property {NotificationPlan} [nextPending]
 * @property {NotificationPlan[]} recentMissed
 */

/** @type {Record<NotificationType, string>} */
const TYPE_LABELS = {
  aviso_antecipado: "Aviso antecipado",
  inicio: "Início da retirada",
  termino: "Término da retirada",
};

/** @type {Record<NotificationType, string>} */
const TYPE_SHORT_LABELS = {
  aviso_antecipado: "Aviso",
  inicio: "Início",
  termino: "Término",
};

/** @param {NotificationType} type @returns {string} */
export function getNotificationTypeLabel(type) {
  return TYPE_LABELS[type];
}

/** @param {NotificationType} type @returns {string} */
export function getNotificationTypeShortLabel(type) {
  return TYPE_SHORT_LABELS[type] ?? "";
}

/** @param {Date} date @returns {string} data no formato YYYY-MM-DD. */
export function formatIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * ID determinístico de uma notificação (usado para casar com o log persistido).
 * @param {string} date
 * @param {NotificationType} type
 * @param {string} time
 * @param {string[]} routineIds
 * @returns {string}
 */
export function buildNotificationId(date, type, time, routineIds) {
  const sortedIds = [...routineIds].sort();
  return `notif::${date}::${type}::${time}::${sortedIds.join(",")}`;
}

/**
 * @param {Routine} routine
 * @param {NotificationSettings} settings
 * @returns {number} minutos de antecedência efetivos para esta rotina.
 */
function effectiveLead(routine, settings) {
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

/**
 * @param {Routine} routine
 * @param {NotificationSettings} settings
 * @returns {boolean}
 */
function isRoutineNotificationEnabled(routine, settings) {
  if (!settings.enabled) return false;
  if (routine.notification?.enabled === false) return false;
  return true;
}

/**
 * @typedef {object} BaseSeed
 * @property {NotificationType} type
 * @property {Routine} routine
 * @property {string} date
 * @property {string} time
 * @property {number} fireMinutes
 */

/**
 * Gera as "sementes" de notificação do dia: aviso antecipado, início e término.
 * @param {Routine[]} routines
 * @param {NotificationSettings} settings
 * @param {string} todayDate
 * @param {WeekdayId} weekday
 * @returns {BaseSeed[]}
 */
function buildSeeds(routines, settings, todayDate, weekday) {
  /** @type {BaseSeed[]} */
  const seeds = [];
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
        seeds.push({ type: "aviso_antecipado", routine, date: todayDate, time: minutesToTime(fireMinutes), fireMinutes });
      }
    }

    seeds.push({ type: "inicio", routine, date: todayDate, time: routine.startTime, fireMinutes: startMinutes });

    if (isValidTime(routine.endTime)) {
      const endMinutes = timeToMinutes(routine.endTime);
      if (endMinutes !== null && endMinutes > startMinutes) {
        seeds.push({ type: "termino", routine, date: todayDate, time: routine.endTime, fireMinutes: endMinutes });
      }
    }
  });
  return seeds;
}

/**
 * Agrupa sementes próximas (mesmo tipo/data, dentro da janela) em planos.
 * @param {BaseSeed[]} seeds
 * @param {NotificationSettings} settings
 * @param {WeekdayId} weekday
 * @returns {NotificationPlan[]}
 */
function groupSeeds(seeds, settings, weekday) {
  /** @type {Map<string, BaseSeed[]>} */
  const buckets = new Map();

  [...seeds]
    .sort((a, b) => a.fireMinutes - b.fireMinutes)
    .forEach((seed) => {
      const groupKey = settings.groupingEnabled
        ? findGroupKey(buckets, seed, settings.groupingWindowMinutes)
        : `${seed.type}::${seed.date}::${seed.fireMinutes}::${seed.routine.id}`;
      const bucket = buckets.get(groupKey) ?? [];
      bucket.push(seed);
      buckets.set(groupKey, bucket);
    });

  /** @type {NotificationPlan[]} */
  const plans = [];
  buckets.forEach((bucketSeeds) => {
    const representative = bucketSeeds[0];
    if (!representative) return;
    /** @type {Map<string, Routine>} */
    const routineMap = new Map();
    bucketSeeds.forEach((seed) => routineMap.set(seed.routine.id, seed.routine));
    const routines = [...routineMap.values()].sort((a, b) =>
      normalizeCase(a.teacher).localeCompare(normalizeCase(b.teacher), "pt-BR"),
    );
    const routineIds = routines.map((routine) => routine.id);
    plans.push({
      id: buildNotificationId(representative.date, representative.type, representative.time, routineIds),
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

/**
 * @param {Map<string, BaseSeed[]>} buckets
 * @param {BaseSeed} seed
 * @param {number} windowMinutes
 * @returns {string}
 */
function findGroupKey(buckets, seed, windowMinutes) {
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

/** @param {number} value @returns {string} */
function minutesToTime(value) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, Math.round(value)));
  const hours = Math.floor(safe / 60).toString().padStart(2, "0");
  const minutes = (safe % 60).toString().padStart(2, "0");
  return `${hours}:${minutes}`;
}

/** @param {NotificationPlan} plan @returns {number} */
function planFireMinutes(plan) {
  return plan.snoozedUntilMinutes ?? plan.fireMinutes;
}

/**
 * Planeja as notificações do dia atual, restaurando status do log e detectando
 * atrasos e adiamentos expirados.
 * @param {NotificationContext} context
 * @returns {NotificationPlan[]}
 */
export function planTodayNotifications(context) {
  const weekday = context.weekday;
  if (!weekday) return [];
  if (!context.settings.enabled) return [];

  const seeds = buildSeeds(context.routines, context.settings, context.todayDate, weekday);
  const plans = groupSeeds(seeds, context.settings, weekday);
  const logIndex = new Map(context.log.map((entry) => [entry.id, entry]));
  const currentMinutes = context.now.getHours() * 60 + context.now.getMinutes();

  return plans.map((plan) => {
    const logEntry = logIndex.get(plan.id);
    let status = plan.status;
    /** @type {number | undefined} */
    let snoozedUntilMinutes;

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

    const effectiveFire = snoozedUntilMinutes ?? plan.fireMinutes;
    const isOverdue =
      status === "pendente" &&
      currentMinutes >= effectiveFire &&
      currentMinutes - effectiveFire <= NOTIF_RECENT_DELAY_WINDOW;

    return { ...plan, status, snoozedUntilMinutes, isOverdue };
  });
}

/**
 * @param {NotificationPlan[]} plans
 * @param {Date} now
 * @returns {NotificationSummary}
 */
export function summarizeNotifications(plans, now) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  let pending = 0;
  let overdue = 0;
  let unseen = 0;
  /** @type {NotificationPlan | undefined} */
  let nextPending;
  /** @type {NotificationPlan[]} */
  const recentMissed = [];

  plans.forEach((plan) => {
    if (plan.status === "pendente" || plan.status === "adiada") pending += 1;
    if (plan.status === "exibida") unseen += 1;
    const fire = planFireMinutes(plan);
    if (plan.isOverdue) {
      overdue += 1;
      if (currentMinutes - fire <= NOTIF_RECENT_DELAY_WINDOW) {
        recentMissed.push(plan);
      }
    }
    if ((plan.status === "pendente" || plan.status === "adiada") && fire >= currentMinutes) {
      const nextFire = nextPending ? planFireMinutes(nextPending) : Number.POSITIVE_INFINITY;
      if (!nextPending || fire < nextFire) {
        nextPending = plan;
      }
    }
  });

  return { total: plans.length, pending, overdue, unseen, nextPending, recentMissed };
}

/**
 * Notificações pendentes que dispararam dentro da janela de gatilho.
 * @param {NotificationPlan[]} plans
 * @param {Date} now
 * @returns {NotificationPlan[]}
 */
export function getDueNotifications(plans, now) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return plans.filter((plan) => {
    if (plan.status !== "pendente") return false;
    const fire = planFireMinutes(plan);
    if (fire > currentMinutes) return false;
    return currentMinutes - fire <= NOTIF_TRIGGER_WINDOW;
  });
}

/**
 * Notificações pendentes recentemente perdidas (dentro da janela informada).
 * @param {NotificationPlan[]} plans
 * @param {Date} now
 * @param {number} [windowMinutes]
 * @returns {NotificationPlan[]}
 */
export function getRecentMissed(plans, now, windowMinutes = NOTIF_RECENT_DELAY_WINDOW) {
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return plans.filter((plan) => {
    if (plan.status !== "pendente") return false;
    const fire = planFireMinutes(plan);
    if (fire >= currentMinutes) return false;
    return currentMinutes - fire <= windowMinutes;
  });
}

/** @param {NotificationPlan} plan @returns {string} */
export function describePlanRoutines(plan) {
  return plan.routines.map((routine) => `${routine.teacher} · ${routine.room}`).join(" / ");
}

/** @param {NotificationPlan} plan @returns {string} */
export function getPlanWeekdayLabel(plan) {
  return WEEKDAYS.find((day) => day.id === plan.weekday)?.label ?? "";
}
