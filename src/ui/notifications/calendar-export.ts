import { isValidTime, timeToMinutes } from "../../domain/model";
import type { Routine, WeekdayId } from "../../domain/types";
import { WEEKDAYS } from "../../domain/types";

const DEFAULT_DURATION_MINUTES = 50;

interface CalendarEventData {
  title: string;
  startDate: Date;
  endDate: Date;
  description: string;
  location: string;
  hadDefinedEnd: boolean;
}

function nextDateForWeekday(weekday: WeekdayId, fromDate = new Date()): Date {
  const target = WEEKDAYS.find((day) => day.id === weekday);
  if (!target) return fromDate;
  const base = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate());
  const diff = (target.jsDay - base.getDay() + 7) % 7 || 7;
  base.setDate(base.getDate() + diff);
  return base;
}

function formatGoogleCalendarDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}00`;
}

function buildEventData(routine: Routine, fromDate = new Date()): CalendarEventData | null {
  if (!isValidTime(routine.startTime)) return null;
  const startMinutes = timeToMinutes(routine.startTime);
  if (startMinutes === null) return null;

  const target = nextDateForWeekday(routine.weekday, fromDate);
  const startDate = new Date(target);
  startDate.setHours(Math.floor(startMinutes / 60), startMinutes % 60, 0, 0);

  const endMinutes = isValidTime(routine.endTime) ? timeToMinutes(routine.endTime) : null;
  const hadDefinedEnd = endMinutes !== null && endMinutes > startMinutes;
  const finalEndMinutes = hadDefinedEnd ? (endMinutes as number) : startMinutes + DEFAULT_DURATION_MINUTES;

  const endDate = new Date(target);
  endDate.setHours(Math.floor(finalEndMinutes / 60), finalEndMinutes % 60, 0, 0);

  const title = `Retirada PROATI: ${routine.subject || routine.teacher || "Rotina"}`;
  const descriptionLines = [
    routine.teacher ? `Professor: ${routine.teacher}` : "",
    routine.subject ? `Aula: ${routine.subject}` : "",
    `Sala/turma: ${routine.room}`,
    `Alunos: ${routine.studentCount}`,
    `Dispositivos: ${routine.devices.join(", ")}`,
    routine.notes ? `Observações: ${routine.notes}` : "",
    hadDefinedEnd ? "" : "Duração padrão (50 min) — término original não definido.",
  ].filter(Boolean);

  return {
    title,
    startDate,
    endDate,
    description: descriptionLines.join("\n"),
    location: routine.room,
    hadDefinedEnd,
  };
}

export function buildGoogleCalendarUrl(routine: Routine, fromDate = new Date()): string | null {
  const data = buildEventData(routine, fromDate);
  if (!data) return null;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: data.title,
    dates: `${formatGoogleCalendarDate(data.startDate)}/${formatGoogleCalendarDate(data.endDate)}`,
    details: data.description,
    location: data.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatIcsDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

export function buildIcsContent(routine: Routine, fromDate = new Date()): string | null {
  const data = buildEventData(routine, fromDate);
  if (!data) return null;
  const uid = `${routine.id}@proati`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PROATI//Notificacoes//PT",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${formatIcsDate(new Date())}`,
    `DTSTART:${formatIcsDate(data.startDate)}`,
    `DTEND:${formatIcsDate(data.endDate)}`,
    `SUMMARY:${escapeIcsText(data.title)}`,
    `DESCRIPTION:${escapeIcsText(data.description)}`,
    `LOCATION:${escapeIcsText(data.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

export function downloadIcsForRoutine(routine: Routine, fromDate = new Date()): boolean {
  const content = buildIcsContent(routine, fromDate);
  if (!content) return false;
  const blob = new Blob([content], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `proati-rotina-${routine.id}.ics`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return true;
}
