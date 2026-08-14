// @ts-check

import { normalizeCase, timeToMinutes } from "../domain/model.js";
import { WEEKDAYS } from "../domain/types.js";

/** @typedef {import("../domain/types.js").Routine} Routine */
/** @typedef {import("../domain/types.js").WeekdayId} WeekdayId */

/**
 * Monta a grade semanal: rotinas agrupadas por equipamento, com linhas de
 * horário globais e células por dia da semana. Função pura.
 * @param {Routine[]} routines
 * @param {ReadonlyArray<{ name: string } | string>} [deviceOrder]
 */
export function buildWeekSchedule(routines, deviceOrder = []) {
  const catalogNames = deviceOrder.map(readDeviceName).filter(Boolean);
  const catalogOrder = new Map(catalogNames.map((name, index) => [normalizeCase(name), index]));
  const deviceNames = new Map(catalogNames.map((name) => [normalizeCase(name), name]));
  const timeSlotsByKey = new Map();
  const entriesByDevice = new Map();

  routines.forEach((routine) => {
    const timeSlot = createTimeSlot(routine);
    if (!timeSlot) return;
    timeSlotsByKey.set(timeSlot.key, timeSlot);

    uniqueRoutineDevices(routine).forEach((deviceName) => {
      const deviceKey = normalizeCase(deviceName);
      if (!deviceNames.has(deviceKey)) deviceNames.set(deviceKey, deviceName);

      const entries = entriesByDevice.get(deviceKey) ?? [];
      entries.push({
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
      });
      entriesByDevice.set(deviceKey, entries);
    });
  });

  const timeSlots = [...timeSlotsByKey.values()].sort(compareTimeSlots);
  const sections = [...entriesByDevice.entries()]
    .sort(([keyA], [keyB]) => compareDeviceKeys(keyA, keyB, catalogOrder, deviceNames))
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

  return { timeSlots, sections };
}

/** @param {{ name: string } | string} item @returns {string} */
function readDeviceName(item) {
  return typeof item === "string" ? item : item.name;
}

/** @param {Routine} routine @returns {string[]} */
function uniqueRoutineDevices(routine) {
  const seen = new Set();
  const devices = [];
  routine.devices.forEach((device) => {
    const key = normalizeCase(device);
    if (!key || seen.has(key)) return;
    seen.add(key);
    devices.push(device);
  });
  return devices;
}

/** @param {Routine} routine */
function createTimeSlot(routine) {
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

/** @param {string} startTime @param {string} endTime @returns {string} */
function formatTimeRange(startTime, endTime) {
  return endTime ? `${formatSchoolTime(startTime)}-${formatSchoolTime(endTime)}` : formatSchoolTime(startTime);
}

/** @param {string} time @returns {string} */
function formatSchoolTime(time) {
  const minutes = timeToMinutes(time);
  if (minutes === null) return time;
  const hours = Math.floor(minutes / 60);
  const minutePart = minutes % 60;
  return minutePart === 0 ? `${hours}H` : `${hours}H${String(minutePart).padStart(2, "0")}`;
}

function compareTimeSlots(a, b) {
  return a.startMinutes - b.startMinutes || (a.endMinutes ?? a.startMinutes) - (b.endMinutes ?? b.startMinutes);
}

/**
 * @param {string} keyA @param {string} keyB
 * @param {Map<string, number>} catalogOrder @param {Map<string, string>} deviceNames
 */
function compareDeviceKeys(keyA, keyB, catalogOrder, deviceNames) {
  const orderA = catalogOrder.get(keyA);
  const orderB = catalogOrder.get(keyB);
  if (orderA !== undefined || orderB !== undefined) {
    return (orderA ?? Number.POSITIVE_INFINITY) - (orderB ?? Number.POSITIVE_INFINITY);
  }
  return (deviceNames.get(keyA) ?? keyA).localeCompare(deviceNames.get(keyB) ?? keyB, "pt-BR");
}

function groupEntriesByCell(entries) {
  const grouped = new Map();
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

/** @param {WeekdayId} weekday @param {string} timeKey @returns {string} */
function cellKey(weekday, timeKey) {
  return `${weekday}::${timeKey}`;
}
