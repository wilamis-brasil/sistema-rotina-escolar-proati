// @ts-check

import { isValidTime, sortRoutines, timeToMinutes } from "../../domain/model.js";
import { DEFAULT_NOTIFICATION_SETTINGS, WEEKDAYS } from "../../domain/types.js";

/** @typedef {import("../../domain/types.js").NotificationSettings} NotificationSettings */
/** @typedef {import("../../domain/types.js").Routine} Routine */
/** @typedef {import("../../domain/types.js").WeekdayId} WeekdayId */
/** @typedef {{ year: number, month: number, day: number }} DateParts */
/**
 * @typedef {object} CalendarExportOptions
 * @property {string} startDate
 * @property {string} endDate
 * @property {string} [teacher]
 * @property {string} [room]
 * @property {string[]} [excludedDates]
 * @property {NotificationSettings} [notificationSettings]
 * @property {Date} [timestamp]
 */

const DEFAULT_DURATION_MINUTES = 50;
const TIMEZONE_ID = "America/Sao_Paulo";
const SAO_PAULO_UTC_OFFSET_MINUTES = -180;

/** @param {Date} [fromDate] @returns {{ startDate: string, endDate: string }} */
export function getDefaultCalendarExportRange(fromDate = new Date()) {
  return { startDate: formatDateInputValue(fromDate), endDate: `${fromDate.getFullYear()}-12-31` };
}

/** @param {string} raw @returns {{ dates: string[], invalid: string[] }} */
export function parseExcludedDatesInput(raw) {
  const values = raw.split(/[\s,;]+/).map((value) => value.trim()).filter(Boolean);
  const seen = new Set();
  const dates = [];
  const invalid = [];

  values.forEach((value) => {
    if (!isValidCalendarDateInput(value)) {
      invalid.push(value);
      return;
    }
    if (seen.has(value)) return;
    seen.add(value);
    dates.push(value);
  });

  return { dates, invalid };
}

/** @param {string} value @returns {boolean} */
export function isValidCalendarDateInput(value) {
  return parseDateOnly(value) !== null;
}

/** @param {Routine[]} routines @param {CalendarExportOptions} options @returns {Routine[]} */
export function getCalendarExportRoutines(routines, options) {
  return buildCalendarEvents(routines, options).map((event) => event.routine);
}

/** @param {Routine[]} routines @param {CalendarExportOptions} options @returns {string | null} */
export function buildIcsContent(routines, options) {
  const events = buildCalendarEvents(routines, options);
  if (events.length === 0) return null;
  const exportEndDate = parseDateOnly(options.endDate);
  if (!exportEndDate) return null;

  const timestamp = options.timestamp ?? new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PROATI//Rotinas Escolares//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...buildVTimezoneLines(),
    ...events.flatMap((event) => buildEventLines(event, timestamp, exportEndDate)),
    "END:VCALENDAR",
  ];

  return serializeIcsLines(lines);
}

/** @param {Routine[]} routines @param {CalendarExportOptions} options @returns {boolean} */
export function downloadIcsForRoutines(routines, options) {
  const content = buildIcsContent(routines, options);
  if (!content) return false;

  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `rotinas-proati-${formatDateInputValue(new Date())}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}

/** @param {Routine[]} routines @param {CalendarExportOptions} options */
function buildCalendarEvents(routines, options) {
  const context = buildExportContext(options);
  if (!context) return [];

  const filtered = sortRoutines(
    routines.filter((routine) => {
      if (options.teacher && routine.teacher !== options.teacher) return false;
      if (options.room && routine.room !== options.room) return false;
      return true;
    }),
    "weekday-time",
  );

  return filtered.map((routine) => buildEventData(routine, context)).filter((event) => event !== null);
}

/** @param {CalendarExportOptions} options */
function buildExportContext(options) {
  const startDate = parseDateOnly(options.startDate);
  const endDate = parseDateOnly(options.endDate);
  if (!startDate || !endDate) return null;
  if (compareDateParts(startDate, endDate) > 0) return null;

  return {
    startDate,
    endDate,
    excludedDates: normalizeExcludedDates(options.excludedDates ?? []),
    notificationSettings: options.notificationSettings ?? DEFAULT_NOTIFICATION_SETTINGS,
  };
}

/** @param {Routine} routine @param {any} context */
function buildEventData(routine, context) {
  if (!isValidTime(routine.startTime)) return null;
  const startMinutes = timeToMinutes(routine.startTime);
  if (startMinutes === null) return null;

  const startDate = firstDateForWeekdayOnOrAfter(routine.weekday, context.startDate);
  if (!startDate || compareDateParts(startDate, context.endDate) > 0) return null;

  const endMinutesRaw = isValidTime(routine.endTime) ? timeToMinutes(routine.endTime) : null;
  const hadDefinedEnd = endMinutesRaw !== null && endMinutesRaw > startMinutes;
  const finalEndMinutes = hadDefinedEnd ? endMinutesRaw : startMinutes + DEFAULT_DURATION_MINUTES;
  const endDate = addDays(startDate, Math.floor(finalEndMinutes / 1440));
  const endMinutes = finalEndMinutes % 1440;

  const title = `Retirada PROATI: ${routine.subject || routine.teacher || "Rotina"}`;
  const descriptionLines = [
    routine.teacher ? `Professor: ${routine.teacher}` : "",
    routine.subject ? `Aula: ${routine.subject}` : "",
    `Turma: ${routine.room}`,
    `Alunos: ${routine.studentCount}`,
    `Dispositivos: ${routine.devices.join(", ")}`,
    routine.notes ? `Observacoes: ${routine.notes}` : "",
    hadDefinedEnd ? "" : "Duracao padrao (50 min) - termino original nao definido.",
  ].filter(Boolean);

  return {
    routine,
    title,
    startDate,
    endDate,
    startMinutes,
    endMinutes,
    description: descriptionLines.join("\n"),
    location: routine.room,
    excludedDates: context.excludedDates.filter(
      (date) =>
        compareDateParts(date, startDate) >= 0 &&
        compareDateParts(date, context.endDate) <= 0 &&
        weekdayMatches(date, routine.weekday),
    ),
    alarmLeadMinutes: effectiveAlarmLeadMinutes(routine, context.notificationSettings),
  };
}

/** @param {any} event @param {Date} timestamp @param {DateParts} exportEndDate @returns {string[]} */
function buildEventLines(event, timestamp, exportEndDate) {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${buildEventUid(event.routine)}`,
    `DTSTAMP:${formatUtcDateTime(timestamp)}`,
    `CREATED:${formatUtcDateTime(readRoutineDate(event.routine.createdAt, timestamp))}`,
    `LAST-MODIFIED:${formatUtcDateTime(readRoutineDate(event.routine.updatedAt, timestamp))}`,
    `DTSTART;TZID=${TIMEZONE_ID}:${formatLocalDateTime(event.startDate, event.startMinutes)}`,
    `DTEND;TZID=${TIMEZONE_ID}:${formatLocalDateTime(event.endDate, event.endMinutes)}`,
    `RRULE:FREQ=WEEKLY;UNTIL=${formatSaoPauloDateTimeAsUtc(exportEndDate, 23 * 60 + 59, 59)}`,
  ];

  if (event.excludedDates.length > 0) {
    lines.push(`EXDATE;TZID=${TIMEZONE_ID}:${event.excludedDates.map((date) => formatLocalDateTime(date, event.startMinutes)).join(",")}`);
  }

  lines.push(
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    `LOCATION:${escapeIcsText(event.location)}`,
  );

  if (event.alarmLeadMinutes !== null && event.alarmLeadMinutes > 0) {
    lines.push("BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Aviso de retirada PROATI", `TRIGGER:-PT${event.alarmLeadMinutes}M`, "END:VALARM");
  }

  lines.push("END:VEVENT");
  return lines;
}

/** @returns {string[]} */
function buildVTimezoneLines() {
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${TIMEZONE_ID}`,
    "BEGIN:STANDARD",
    "DTSTART:20190217T000000",
    "TZOFFSETFROM:-0200",
    "TZOFFSETTO:-0300",
    "TZNAME:-03",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

/** @param {Routine} routine @param {NotificationSettings} settings @returns {number | null} */
function effectiveAlarmLeadMinutes(routine, settings) {
  if (!settings.enabled) return null;
  if (routine.notification?.enabled === false) return null;
  if (routine.notification?.leadMinutes === null) return 0;
  if (typeof routine.notification?.leadMinutes === "number" && Number.isFinite(routine.notification.leadMinutes) && routine.notification.leadMinutes >= 0) {
    return Math.round(routine.notification.leadMinutes);
  }
  if (Number.isFinite(settings.defaultLeadMinutes) && settings.defaultLeadMinutes >= 0) {
    return Math.round(settings.defaultLeadMinutes);
  }
  return DEFAULT_NOTIFICATION_SETTINGS.defaultLeadMinutes;
}

/** @param {Routine} routine @returns {string} */
function buildEventUid(routine) {
  return `proati-routine-${encodeUidComponent(routine.id || "sem-id")}@sistema-rotina-escolar-proati`;
}

/** @param {string} value @returns {string} */
function encodeUidComponent(value) {
  return Array.from(new TextEncoder().encode(value)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** @param {string} value @param {Date} fallback @returns {Date} */
function readRoutineDate(value, fallback) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

/** @param {string} value @returns {string} */
function escapeIcsText(value) {
  return value.replace(/\\/g, "\\\\").replace(/\r\n|\r|\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

/** @param {string[]} lines @returns {string} */
function serializeIcsLines(lines) {
  return lines.flatMap(foldIcsLine).join("\r\n");
}

/** @param {string} line @returns {string[]} */
function foldIcsLine(line) {
  const encoder = new TextEncoder();
  const folded = [];
  let current = "";
  let limit = 75;

  Array.from(line).forEach((char) => {
    const candidate = `${current}${char}`;
    if (current && encoder.encode(candidate).length > limit) {
      folded.push(folded.length === 0 ? current : ` ${current}`);
      current = char;
      limit = 74;
      return;
    }
    current = candidate;
  });

  if (current || folded.length === 0) {
    folded.push(folded.length === 0 ? current : ` ${current}`);
  }

  return folded;
}

/** @param {DateParts} date @param {number} minutes @returns {string} */
function formatLocalDateTime(date, minutes) {
  const normalizedMinutes = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalizedMinutes / 60);
  const remainder = normalizedMinutes % 60;
  return `${formatCompactDate(date)}T${String(hours).padStart(2, "0")}${String(remainder).padStart(2, "0")}00`;
}

/** @param {DateParts} date @param {number} minutes @param {number} [seconds] @returns {string} */
function formatSaoPauloDateTimeAsUtc(date, minutes, seconds = 0) {
  const utcMinutes = minutes - SAO_PAULO_UTC_OFFSET_MINUTES;
  const utcDate = addDays(date, Math.floor(utcMinutes / 1440));
  const minuteOfDay = ((utcMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(minuteOfDay / 60);
  const remainder = minuteOfDay % 60;
  return `${formatCompactDate(utcDate)}T${String(hours).padStart(2, "0")}${String(remainder).padStart(2, "0")}${String(seconds).padStart(2, "0")}Z`;
}

/** @param {Date} date @returns {string} */
function formatUtcDateTime(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    "T",
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    String(date.getUTCSeconds()).padStart(2, "0"),
    "Z",
  ].join("");
}

/** @param {DateParts} date @returns {string} */
function formatCompactDate(date) {
  return `${date.year}${String(date.month).padStart(2, "0")}${String(date.day).padStart(2, "0")}`;
}

/** @param {string} value @returns {DateParts | null} */
function parseDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) {
    return null;
  }
  return { year, month, day };
}

/** @param {string[]} values @returns {DateParts[]} */
function normalizeExcludedDates(values) {
  const seen = new Set();
  return values.reduce((result, value) => {
    const parsed = parseDateOnly(value);
    if (!parsed || seen.has(value)) return result;
    seen.add(value);
    result.push(parsed);
    return result;
  }, /** @type {DateParts[]} */ ([]));
}

/** @param {Date} date @returns {string} */
function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** @param {DateParts} date @param {number} days @returns {DateParts} */
function addDays(date, days) {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

/** @param {DateParts} a @param {DateParts} b @returns {number} */
function compareDateParts(a, b) {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** @param {DateParts} date @returns {number} */
function getUtcWeekday(date) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

/** @param {WeekdayId} weekday @param {DateParts} fromDate @returns {DateParts | null} */
function firstDateForWeekdayOnOrAfter(weekday, fromDate) {
  const target = WEEKDAYS.find((day) => day.id === weekday);
  if (!target) return null;
  const diff = (target.jsDay - getUtcWeekday(fromDate) + 7) % 7;
  return addDays(fromDate, diff);
}

/** @param {DateParts} date @param {WeekdayId} weekday @returns {boolean} */
function weekdayMatches(date, weekday) {
  const target = WEEKDAYS.find((day) => day.id === weekday);
  return Boolean(target && getUtcWeekday(date) === target.jsDay);
}
