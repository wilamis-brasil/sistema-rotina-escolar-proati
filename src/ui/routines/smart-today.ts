import { normalizeText, sortRoutines, timeToMinutes } from "../../domain/model";
import type { Routine } from "../../domain/types";

const TODAY_VISIBLE_ROUTINE_LIMIT = 3;
const TODAY_LOOKAHEAD_MINUTES = 120;

interface RoutineTimeSegment {
  startMinutes: number;
  endMinutes: number | null;
}

export interface SmartRoutineGroup {
  routines: Routine[];
  representative: Routine;
  timeLabel: string;
  startMinutes: number;
  endMinutes: number | null;
  isActiveNow: boolean;
}

export function getCurrentMinutes(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function getRoutineStartMinutes(routine: Routine): number | null {
  return timeToMinutes(routine.startTime);
}

function getRoutineEndMinutes(routine: Routine): number | null {
  if (!routine.endTime) return null;
  return timeToMinutes(routine.endTime);
}

export function isRoutinePendingOrActive(routine: Routine, currentMinutes: number): boolean {
  const startMinutes = getRoutineStartMinutes(routine);
  if (startMinutes === null) return false;

  const endMinutes = getRoutineEndMinutes(routine);
  if (endMinutes !== null) {
    return currentMinutes < endMinutes;
  }

  return currentMinutes <= startMinutes;
}

export function isRoutineActiveNow(routine: Routine, currentMinutes: number): boolean {
  const startMinutes = getRoutineStartMinutes(routine);
  if (startMinutes === null) return false;

  const endMinutes = getRoutineEndMinutes(routine);
  if (endMinutes !== null) {
    return startMinutes <= currentMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes === startMinutes;
}

function normalizeRoutineDevices(devices: string[]): string[] {
  return [...new Set(devices.map((device) => normalizeText(device).toLocaleLowerCase("pt-BR")).filter(Boolean))].sort(
    (a, b) => a.localeCompare(b, "pt-BR"),
  );
}

function createRoutineGroupKey(routine: Routine): string {
  return JSON.stringify([
    normalizeText(routine.teacher),
    normalizeText(routine.subject),
    normalizeText(routine.room),
    routine.studentCount,
    normalizeRoutineDevices(routine.devices).join("\u0000"),
    normalizeText(routine.notes),
  ]);
}

export function areRoutineConfigsEquivalent(a: Routine, b: Routine): boolean {
  return createRoutineGroupKey(a) === createRoutineGroupKey(b);
}

export function groupEquivalentRoutines(routines: Routine[], currentMinutes = getCurrentMinutes()): SmartRoutineGroup[] {
  const buckets = new Map<string, Routine[]>();

  sortRoutines(routines, "time").forEach((routine) => {
    const key = createRoutineGroupKey(routine);
    const bucket = buckets.get(key) ?? [];
    bucket.push(routine);
    buckets.set(key, bucket);
  });

  return [...buckets.values()].map((group) => createSmartRoutineGroup(group, currentMinutes)).sort(compareSmartRoutineGroups);
}

export function mergeRoutineGroupTimes(group: Pick<SmartRoutineGroup, "routines">): string {
  return buildRoutineTimeLabel(group.routines);
}

export function getVisibleSmartTodayRoutineGroups(
  routines: Routine[],
  currentMinutes = getCurrentMinutes(),
  limit = TODAY_VISIBLE_ROUTINE_LIMIT,
  lookaheadMinutes = TODAY_LOOKAHEAD_MINUTES,
): SmartRoutineGroup[] {
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
  const candidates = visibleRoutines.length ? visibleRoutines : [pendingRoutines[0]!];

  return groupEquivalentRoutines(candidates, currentMinutes).slice(0, limit);
}

function createSmartRoutineGroup(routines: Routine[], currentMinutes: number): SmartRoutineGroup {
  const sorted = sortRoutines(routines, "time").filter((routine) => getRoutineStartMinutes(routine) !== null);
  const representative = sorted[0] ?? routines[0]!;
  const startMinutes = getRoutineStartMinutes(representative) ?? 0;
  const endMinutes = sorted.reduce<number | null>((latestEnd, routine) => {
    const endMinutes = getRoutineEndMinutes(routine);
    if (endMinutes === null) return latestEnd;
    return latestEnd === null || endMinutes > latestEnd ? endMinutes : latestEnd;
  }, null);

  return {
    routines: sorted,
    representative,
    timeLabel: buildRoutineTimeLabel(sorted),
    startMinutes,
    endMinutes,
    isActiveNow: sorted.some((routine) => isRoutineActiveNow(routine, currentMinutes)),
  };
}

function compareSmartRoutineGroups(a: SmartRoutineGroup, b: SmartRoutineGroup): number {
  if (a.isActiveNow !== b.isActiveNow) return a.isActiveNow ? -1 : 1;
  return (
    a.startMinutes - b.startMinutes ||
    normalizeText(a.representative.teacher).localeCompare(normalizeText(b.representative.teacher), "pt-BR") ||
    normalizeText(a.representative.room).localeCompare(normalizeText(b.representative.room), "pt-BR")
  );
}

function buildRoutineTimeLabel(routines: Routine[]): string {
  const segments = sortRoutines(routines, "time")
    .map(toRoutineTimeSegment)
    .filter((segment): segment is RoutineTimeSegment => segment !== null)
    .reduce<RoutineTimeSegment[]>((result, segment) => {
      const last = result.at(-1);
      if (last?.endMinutes !== null && last?.endMinutes !== undefined && segment.endMinutes !== null && segment.startMinutes <= last.endMinutes) {
        last.endMinutes = Math.max(last.endMinutes, segment.endMinutes);
        return result;
      }

      result.push({ ...segment });
      return result;
    }, []);

  return segments.map(formatRoutineTimeSegment).join(" · ");
}

function toRoutineTimeSegment(routine: Routine): RoutineTimeSegment | null {
  const startMinutes = getRoutineStartMinutes(routine);
  if (startMinutes === null) return null;

  return {
    startMinutes,
    endMinutes: getRoutineEndMinutes(routine),
  };
}

function formatRoutineTimeSegment(segment: RoutineTimeSegment): string {
  const start = formatMinutesAsTime(segment.startMinutes);
  if (segment.endMinutes === null) return start;
  return `${start}-${formatMinutesAsTime(segment.endMinutes)}`;
}

function formatMinutesAsTime(minutes: number): string {
  const hours = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const remainder = (minutes % 60).toString().padStart(2, "0");
  return `${hours}:${remainder}`;
}
