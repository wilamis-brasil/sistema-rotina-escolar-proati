import { normalizeCase, timeToMinutes } from "../domain/model";
import { WEEKDAYS, type Device, type Routine, type WeekdayId } from "../domain/types";

export interface WeekScheduleTimeSlot {
  key: string;
  label: string;
  startTime: string;
  endTime: string;
  startMinutes: number;
  endMinutes: number | null;
}

export interface WeekScheduleEntry {
  routineId: string;
  deviceName: string;
  weekday: WeekdayId;
  timeKey: string;
  timeLabel: string;
  startTime: string;
  endTime: string;
  subject: string;
  teacher: string;
  room: string;
  studentCount: number;
  notes: string;
}

export interface WeekScheduleCell {
  weekday: WeekdayId;
  entries: WeekScheduleEntry[];
}

export interface WeekScheduleRow {
  timeKey: string;
  timeLabel: string;
  cells: WeekScheduleCell[];
}

export interface WeekScheduleSection {
  deviceName: string;
  routineCount: number;
  rows: WeekScheduleRow[];
}

export interface WeekSchedule {
  timeSlots: WeekScheduleTimeSlot[];
  sections: WeekScheduleSection[];
}

type DeviceOrderItem = Pick<Device, "name"> | string;

export function buildWeekSchedule(
  routines: Routine[],
  deviceOrder: readonly DeviceOrderItem[] = [],
): WeekSchedule {
  const catalogNames = deviceOrder.map(readDeviceName).filter(Boolean);
  const catalogOrder = new Map(catalogNames.map((name, index) => [normalizeCase(name), index]));
  const deviceNames = new Map(catalogNames.map((name) => [normalizeCase(name), name]));
  const timeSlotsByKey = new Map<string, WeekScheduleTimeSlot>();
  const entriesByDevice = new Map<string, WeekScheduleEntry[]>();

  routines.forEach((routine) => {
    const timeSlot = createTimeSlot(routine);
    if (!timeSlot) return;
    timeSlotsByKey.set(timeSlot.key, timeSlot);

    uniqueRoutineDevices(routine).forEach((deviceName) => {
      const deviceKey = normalizeCase(deviceName);
      if (!deviceNames.has(deviceKey)) {
        deviceNames.set(deviceKey, deviceName);
      }

      const entry: WeekScheduleEntry = {
        routineId: routine.id,
        deviceName: deviceNames.get(deviceKey) ?? deviceName,
        weekday: routine.weekday,
        timeKey: timeSlot.key,
        timeLabel: timeSlot.label,
        startTime: routine.startTime,
        endTime: routine.endTime,
        subject: routine.subject,
        teacher: routine.teacher,
        room: routine.room,
        studentCount: routine.studentCount,
        notes: routine.notes,
      };

      const entries = entriesByDevice.get(deviceKey) ?? [];
      entries.push(entry);
      entriesByDevice.set(deviceKey, entries);
    });
  });

  const timeSlots = [...timeSlotsByKey.values()].sort(compareTimeSlots);
  const sections = [...entriesByDevice.entries()]
    .sort(([deviceKeyA], [deviceKeyB]) => compareDeviceKeys(deviceKeyA, deviceKeyB, catalogOrder, deviceNames))
    .map(([deviceKey, entries]) => {
      const entriesByCell = groupEntriesByCell(entries);

      return {
        deviceName: deviceNames.get(deviceKey) ?? entries[0]?.deviceName ?? "",
        routineCount: new Set(entries.map((entry) => entry.routineId)).size,
        rows: timeSlots.map((slot) => ({
          timeKey: slot.key,
          timeLabel: slot.label,
          cells: WEEKDAYS.map((day) => ({
            weekday: day.id,
            entries: entriesByCell.get(cellKey(day.id, slot.key)) ?? [],
          })),
        })),
      };
    });

  return {
    timeSlots,
    sections,
  };
}

function readDeviceName(item: DeviceOrderItem): string {
  return typeof item === "string" ? item : item.name;
}

function uniqueRoutineDevices(routine: Routine): string[] {
  const seen = new Set<string>();
  const devices: string[] = [];

  routine.devices.forEach((device) => {
    const key = normalizeCase(device);
    if (!key || seen.has(key)) return;
    seen.add(key);
    devices.push(device);
  });

  return devices;
}

function createTimeSlot(routine: Routine): WeekScheduleTimeSlot | null {
  const startMinutes = timeToMinutes(routine.startTime);
  if (startMinutes === null) return null;

  const endMinutes = routine.endTime ? timeToMinutes(routine.endTime) : null;
  const endTime = endMinutes === null ? "" : routine.endTime;

  return {
    key: `${routine.startTime}-${endTime}`,
    label: formatTimeRange(routine.startTime, endTime),
    startTime: routine.startTime,
    endTime,
    startMinutes,
    endMinutes,
  };
}

function formatTimeRange(startTime: string, endTime: string): string {
  return endTime ? `${formatSchoolTime(startTime)}-${formatSchoolTime(endTime)}` : formatSchoolTime(startTime);
}

function formatSchoolTime(time: string): string {
  const minutes = timeToMinutes(time);
  if (minutes === null) return time;

  const hours = Math.floor(minutes / 60);
  const minutePart = minutes % 60;
  return minutePart === 0 ? `${hours}H` : `${hours}H${String(minutePart).padStart(2, "0")}`;
}

function compareTimeSlots(a: WeekScheduleTimeSlot, b: WeekScheduleTimeSlot): number {
  return a.startMinutes - b.startMinutes || (a.endMinutes ?? a.startMinutes) - (b.endMinutes ?? b.startMinutes);
}

function compareDeviceKeys(
  deviceKeyA: string,
  deviceKeyB: string,
  catalogOrder: Map<string, number>,
  deviceNames: Map<string, string>,
): number {
  const orderA = catalogOrder.get(deviceKeyA);
  const orderB = catalogOrder.get(deviceKeyB);

  if (orderA !== undefined || orderB !== undefined) {
    return (orderA ?? Number.POSITIVE_INFINITY) - (orderB ?? Number.POSITIVE_INFINITY);
  }

  return (deviceNames.get(deviceKeyA) ?? deviceKeyA).localeCompare(deviceNames.get(deviceKeyB) ?? deviceKeyB, "pt-BR");
}

function groupEntriesByCell(entries: WeekScheduleEntry[]): Map<string, WeekScheduleEntry[]> {
  const grouped = new Map<string, WeekScheduleEntry[]>();

  entries.forEach((entry) => {
    const key = cellKey(entry.weekday, entry.timeKey);
    const cellEntries = grouped.get(key) ?? [];
    cellEntries.push(entry);
    grouped.set(key, cellEntries);
  });

  grouped.forEach((cellEntries) => {
    cellEntries.sort(
      (a, b) =>
        a.teacher.localeCompare(b.teacher, "pt-BR") ||
        a.room.localeCompare(b.room, "pt-BR") ||
        a.routineId.localeCompare(b.routineId, "pt-BR"),
    );
  });

  return grouped;
}

function cellKey(weekday: WeekdayId, timeKey: string): string {
  return `${weekday}::${timeKey}`;
}
