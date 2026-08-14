// @ts-check

import { normalizeText, sortRoutines, timeToMinutes } from "../../domain/model.js";

/** @typedef {import("../../domain/types.js").Routine} Routine */
/** @typedef {{ startMinutes: number, endMinutes: number | null }} RoutineTimeSegment */
/**
 * @typedef {object} SmartRoutineGroup
 * @property {Routine[]} routines
 * @property {Routine} representative
 * @property {string} timeLabel
 * @property {number} startMinutes
 * @property {number | null} endMinutes
 * @property {boolean} isActiveNow
 */

const TODAY_VISIBLE_ROUTINE_LIMIT = 3;
const TODAY_LOOKAHEAD_MINUTES = 120;

/** @param {Date} [date] @returns {number} */
export function getCurrentMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

/** @param {Routine} routine @returns {number | null} */
export function getRoutineStartMinutes(routine) {
  return timeToMinutes(routine.startTime);
}

/** @param {Routine} routine @returns {number | null} */
function getRoutineEndMinutes(routine) {
  if (!routine.endTime) return null;
  return timeToMinutes(routine.endTime);
}

/** @param {Routine} routine @param {number} currentMinutes @returns {boolean} */
export function isRoutinePendingOrActive(routine, currentMinutes) {
  const startMinutes = getRoutineStartMinutes(routine);
  if (startMinutes === null) return false;
  const endMinutes = getRoutineEndMinutes(routine);
  if (endMinutes !== null) return currentMinutes < endMinutes;
  return currentMinutes <= startMinutes;
}

/** @param {Routine} routine @param {number} currentMinutes @returns {boolean} */
export function isRoutineActiveNow(routine, currentMinutes) {
  const startMinutes = getRoutineStartMinutes(routine);
  if (startMinutes === null) return false;
  const endMinutes = getRoutineEndMinutes(routine);
  if (endMinutes !== null) return startMinutes <= currentMinutes && currentMinutes < endMinutes;
  return currentMinutes === startMinutes;
}

/** @param {string[]} devices @returns {string[]} */
function normalizeRoutineDevices(devices) {
  return [...new Set(devices.map((device) => normalizeText(device).toLocaleLowerCase("pt-BR")).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
}

/** @param {Routine} routine @returns {string} */
function createRoutineGroupKey(routine) {
  return JSON.stringify([
    normalizeText(routine.teacher),
    normalizeText(routine.subject),
    normalizeText(routine.room),
    routine.studentCount,
    normalizeRoutineDevices(routine.devices).join("\u0000"),
    normalizeText(routine.notes),
  ]);
}

/** @param {Routine} a @param {Routine} b @returns {boolean} */
export function areRoutineConfigsEquivalent(a, b) {
  return createRoutineGroupKey(a) === createRoutineGroupKey(b);
}

/**
 * Agrupa rotinas com configuração equivalente e as ordena (ativas primeiro).
 * @param {Routine[]} routines
 * @param {number} [currentMinutes]
 * @returns {SmartRoutineGroup[]}
 */
export function groupEquivalentRoutines(routines, currentMinutes = getCurrentMinutes()) {
  const buckets = new Map();
  sortRoutines(routines, "time").forEach((routine) => {
    const key = createRoutineGroupKey(routine);
    const bucket = buckets.get(key) ?? [];
    bucket.push(routine);
    buckets.set(key, bucket);
  });
  return [...buckets.values()].map((group) => createSmartRoutineGroup(group, currentMinutes)).sort(compareSmartRoutineGroups);
}

/** @param {Pick<SmartRoutineGroup, "routines">} group @returns {string} */
export function mergeRoutineGroupTimes(group) {
  return buildRoutineTimeLabel(group.routines);
}

/**
 * Grupos de rotinas a destacar em "Hoje": ativas e próximas dentro da janela,
 * limitados a `limit` cartões.
 * @param {Routine[]} routines
 * @param {number} [currentMinutes]
 * @param {number} [limit]
 * @param {number} [lookaheadMinutes]
 * @returns {SmartRoutineGroup[]}
 */
export function getVisibleSmartTodayRoutineGroups(
  routines,
  currentMinutes = getCurrentMinutes(),
  limit = TODAY_VISIBLE_ROUTINE_LIMIT,
  lookaheadMinutes = TODAY_LOOKAHEAD_MINUTES,
) {
  const pendingRoutines = sortRoutines(
    routines.filter((routine) => isRoutinePendingOrActive(routine, currentMinutes)),
    "time",
  );
  if (pendingRoutines.length === 0) return [];

  const visibleRoutines = pendingRoutines.filter((routine) => {
    const startMinutes = getRoutineStartMinutes(routine);
    return (
      isRoutineActiveNow(routine, currentMinutes) ||
      (startMinutes !== null && startMinutes >= currentMinutes && startMinutes <= currentMinutes + lookaheadMinutes)
    );
  });
  const candidates = visibleRoutines.length ? visibleRoutines : [pendingRoutines[0]];

  return groupEquivalentRoutines(candidates, currentMinutes).slice(0, limit);
}

/** @param {Routine[]} routines @param {number} currentMinutes @returns {SmartRoutineGroup} */
function createSmartRoutineGroup(routines, currentMinutes) {
  const sorted = sortRoutines(routines, "time").filter((routine) => getRoutineStartMinutes(routine) !== null);
  const representative = sorted[0] ?? routines[0];
  const startMinutes = getRoutineStartMinutes(representative) ?? 0;
  const endMinutes = sorted.reduce((latestEnd, routine) => {
    const end = getRoutineEndMinutes(routine);
    if (end === null) return latestEnd;
    return latestEnd === null || end > latestEnd ? end : latestEnd;
  }, /** @type {number | null} */ (null));

  return {
    routines: sorted,
    representative,
    timeLabel: buildRoutineTimeLabel(sorted),
    startMinutes,
    endMinutes,
    isActiveNow: sorted.some((routine) => isRoutineActiveNow(routine, currentMinutes)),
  };
}

/** @param {SmartRoutineGroup} a @param {SmartRoutineGroup} b @returns {number} */
function compareSmartRoutineGroups(a, b) {
  if (a.isActiveNow !== b.isActiveNow) return a.isActiveNow ? -1 : 1;
  return (
    a.startMinutes - b.startMinutes ||
    normalizeText(a.representative.teacher).localeCompare(normalizeText(b.representative.teacher), "pt-BR") ||
    normalizeText(a.representative.room).localeCompare(normalizeText(b.representative.room), "pt-BR")
  );
}

/** @param {Routine[]} routines @returns {string} */
function buildRoutineTimeLabel(routines) {
  const segments = sortRoutines(routines, "time")
    .map(toRoutineTimeSegment)
    .filter((segment) => segment !== null)
    .reduce((result, segment) => {
      const last = result.at(-1);
      if (last?.endMinutes != null && segment.endMinutes !== null && segment.startMinutes <= last.endMinutes) {
        last.endMinutes = Math.max(last.endMinutes, segment.endMinutes);
        return result;
      }
      result.push({ ...segment });
      return result;
    }, /** @type {RoutineTimeSegment[]} */ ([]));

  return segments.map(formatRoutineTimeSegment).join(" · ");
}

/** @param {Routine} routine @returns {RoutineTimeSegment | null} */
function toRoutineTimeSegment(routine) {
  const startMinutes = getRoutineStartMinutes(routine);
  if (startMinutes === null) return null;
  return { startMinutes, endMinutes: getRoutineEndMinutes(routine) };
}

/** @param {RoutineTimeSegment} segment @returns {string} */
function formatRoutineTimeSegment(segment) {
  const start = formatMinutesAsTime(segment.startMinutes);
  if (segment.endMinutes === null) return start;
  return `${start}-${formatMinutesAsTime(segment.endMinutes)}`;
}

/** @param {number} minutes @returns {string} */
function formatMinutesAsTime(minutes) {
  const hours = Math.floor(minutes / 60).toString().padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}`;
}
