import { isValidTime, sortRoutines, timeToMinutes } from "../../domain/model";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  WEEKDAYS,
  type NotificationSettings,
  type Routine,
  type WeekdayId,
} from "../../domain/types";

const DEFAULT_DURATION_MINUTES = 50;
const TIMEZONE_ID = "America/Sao_Paulo";
const SAO_PAULO_UTC_OFFSET_MINUTES = -180;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

interface CalendarExportContext {
  startDate: DateParts;
  endDate: DateParts;
  excludedDates: DateParts[];
  notificationSettings: NotificationSettings;
}

interface CalendarEventData {
  routine: Routine;
  title: string;
  startDate: DateParts;
  endDate: DateParts;
  startMinutes: number;
  endMinutes: number;
  description: string;
  location: string;
  excludedDates: DateParts[];
  alarmLeadMinutes: number | null;
}

export interface CalendarExportOptions {
  startDate: string;
  endDate: string;
  teacher?: string;
  room?: string;
  excludedDates?: string[];
  notificationSettings?: NotificationSettings;
  timestamp?: Date;
}

export interface CalendarExportRange {
  startDate: string;
  endDate: string;
}

export interface ParsedExcludedDates {
  dates: string[];
  invalid: string[];
}

export function getDefaultCalendarExportRange(fromDate = new Date()): CalendarExportRange {
  return {
    startDate: formatDateInputValue(fromDate),
    endDate: `${fromDate.getFullYear()}-12-31`,
  };
}

export function parseExcludedDatesInput(raw: string): ParsedExcludedDates {
  const values = raw
    .split(/[\s,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const dates: string[] = [];
  const invalid: string[] = [];

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

export function isValidCalendarDateInput(value: string): boolean {
  return parseDateOnly(value) !== null;
}

export function getCalendarExportRoutines(routines: Routine[], options: CalendarExportOptions): Routine[] {
  return buildCalendarEvents(routines, options).map((event) => event.routine);
}

export function buildIcsContent(routines: Routine[], options: CalendarExportOptions): string | null {
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

export function downloadIcsForRoutines(routines: Routine[], options: CalendarExportOptions): boolean {
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

function buildCalendarEvents(routines: Routine[], options: CalendarExportOptions): CalendarEventData[] {
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

  return filtered
    .map((routine) => buildEventData(routine, context))
    .filter((event): event is CalendarEventData => event !== null);
}

function buildExportContext(options: CalendarExportOptions): CalendarExportContext | null {
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

function buildEventData(routine: Routine, context: CalendarExportContext): CalendarEventData | null {
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
    excludedDates: context.excludedDates.filter((date) =>
      compareDateParts(date, startDate) >= 0 &&
      compareDateParts(date, context.endDate) <= 0 &&
      weekdayMatches(date, routine.weekday),
    ),
    alarmLeadMinutes: effectiveAlarmLeadMinutes(routine, context.notificationSettings),
  };
}

function buildEventLines(event: CalendarEventData, timestamp: Date, exportEndDate: DateParts): string[] {
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
    lines.push(
      `EXDATE;TZID=${TIMEZONE_ID}:${event.excludedDates
        .map((date) => formatLocalDateTime(date, event.startMinutes))
        .join(",")}`,
    );
  }

  lines.push(
    `SUMMARY:${escapeIcsText(event.title)}`,
    `DESCRIPTION:${escapeIcsText(event.description)}`,
    `LOCATION:${escapeIcsText(event.location)}`,
  );

  if (event.alarmLeadMinutes !== null && event.alarmLeadMinutes > 0) {
    lines.push(
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Aviso de retirada PROATI",
      `TRIGGER:-PT${event.alarmLeadMinutes}M`,
      "END:VALARM",
    );
  }

  lines.push("END:VEVENT");
  return lines;
}

function buildVTimezoneLines(): string[] {
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

function effectiveAlarmLeadMinutes(routine: Routine, settings: NotificationSettings): number | null {
  if (!settings.enabled) return null;
  if (routine.notification?.enabled === false) return null;
  if (routine.notification?.leadMinutes === null) return 0;
  if (
    typeof routine.notification?.leadMinutes === "number" &&
    Number.isFinite(routine.notification.leadMinutes) &&
    routine.notification.leadMinutes >= 0
  ) {
    return Math.round(routine.notification.leadMinutes);
  }
  if (Number.isFinite(settings.defaultLeadMinutes) && settings.defaultLeadMinutes >= 0) {
    return Math.round(settings.defaultLeadMinutes);
  }
  return DEFAULT_NOTIFICATION_SETTINGS.defaultLeadMinutes;
}

function buildEventUid(routine: Routine): string {
  const safeId = routine.id.replace(/[^A-Za-z0-9._-]/g, "-") || "sem-id";
  return `proati-${safeId}@sistema-rotina-escolar-proati`;
}

function readRoutineDate(value: string, fallback: Date): Date {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function serializeIcsLines(lines: string[]): string {
  return lines.flatMap(foldIcsLine).join("\r\n");
}

function foldIcsLine(line: string): string[] {
  const encoder = new TextEncoder();
  const folded: string[] = [];
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

function formatLocalDateTime(date: DateParts, minutes: number): string {
  const normalizedMinutes = ((minutes % 1440) + 1440) % 1440;
  const hours = Math.floor(normalizedMinutes / 60);
  const remainder = normalizedMinutes % 60;
  return `${formatCompactDate(date)}T${String(hours).padStart(2, "0")}${String(remainder).padStart(2, "0")}00`;
}

function formatSaoPauloDateTimeAsUtc(date: DateParts, minutes: number, seconds = 0): string {
  const utcMinutes = minutes - SAO_PAULO_UTC_OFFSET_MINUTES;
  const utcDate = addDays(date, Math.floor(utcMinutes / 1440));
  const minuteOfDay = ((utcMinutes % 1440) + 1440) % 1440;
  const hours = Math.floor(minuteOfDay / 60);
  const remainder = minuteOfDay % 60;
  return `${formatCompactDate(utcDate)}T${String(hours).padStart(2, "0")}${String(remainder).padStart(2, "0")}${String(seconds).padStart(2, "0")}Z`;
}

function formatUtcDateTime(date: Date): string {
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

function formatCompactDate(date: DateParts): string {
  return `${date.year}${String(date.month).padStart(2, "0")}${String(date.day).padStart(2, "0")}`;
}

function parseDateOnly(value: string): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return { year, month, day };
}

function normalizeExcludedDates(values: string[]): DateParts[] {
  const seen = new Set<string>();
  return values.reduce<DateParts[]>((result, value) => {
    const parsed = parseDateOnly(value);
    if (!parsed || seen.has(value)) return result;
    seen.add(value);
    result.push(parsed);
    return result;
  }, []);
}

function formatDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date: DateParts, days: number): DateParts {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    year: value.getUTCFullYear(),
    month: value.getUTCMonth() + 1,
    day: value.getUTCDate(),
  };
}

function compareDateParts(a: DateParts, b: DateParts): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

function getUtcWeekday(date: DateParts): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
}

function firstDateForWeekdayOnOrAfter(weekday: WeekdayId, fromDate: DateParts): DateParts | null {
  const target = WEEKDAYS.find((day) => day.id === weekday);
  if (!target) return null;
  const diff = (target.jsDay - getUtcWeekday(fromDate) + 7) % 7;
  return addDays(fromDate, diff);
}

function weekdayMatches(date: DateParts, weekday: WeekdayId): boolean {
  const target = WEEKDAYS.find((day) => day.id === weekday);
  return Boolean(target && getUtcWeekday(date) === target.jsDay);
}
