import { describe, expect, it } from "vitest";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  type NotificationSettings,
  type Routine,
} from "../../domain/types";
import {
  buildIcsContent,
  getCalendarExportRoutines,
  parseExcludedDatesInput,
  type CalendarExportOptions,
} from "./calendar-export";

const timestamp = new Date("2026-05-27T12:00:00.000Z");

const baseRoutine: Routine = {
  id: "routine-1",
  weekday: "monday",
  startTime: "08:00",
  endTime: "09:00",
  subject: "Matematica",
  teacher: "Ana",
  room: "1A",
  studentCount: 30,
  devices: ["Notebook"],
  notes: "",
  createdAt: "2026-05-13T10:00:00.000Z",
  updatedAt: "2026-05-20T10:00:00.000Z",
};

function routine(overrides: Partial<Routine>): Routine {
  return { ...baseRoutine, ...overrides };
}

function settings(overrides: Partial<NotificationSettings> = {}): NotificationSettings {
  return { ...DEFAULT_NOTIFICATION_SETTINGS, ...overrides };
}

function options(overrides: Partial<CalendarExportOptions> = {}): CalendarExportOptions {
  return {
    startDate: "2026-05-25",
    endDate: "2026-06-30",
    notificationSettings: settings({ defaultLeadMinutes: 10 }),
    timestamp,
    ...overrides,
  };
}

function unfold(content: string): string {
  return content.replace(/\r\n /g, "");
}

function eventCount(content: string): number {
  return content.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length;
}

describe("calendar export", () => {
  it("generates one VCALENDAR with multiple recurring VEVENT entries", () => {
    const content = buildIcsContent(
      [
        routine({ id: "routine-monday", weekday: "monday" }),
        routine({ id: "routine-tuesday", weekday: "tuesday", startTime: "09:00", endTime: "10:00" }),
      ],
      options(),
    );

    expect(content).not.toBeNull();
    const ics = content!;
    expect(eventCount(ics)).toBe(2);
    expect(ics).toContain("BEGIN:VTIMEZONE");
    expect(ics).toContain("TZID:America/Sao_Paulo");
    expect(ics).toContain("DTSTART;TZID=America/Sao_Paulo:20260525T080000");
    expect(ics).toContain("DTSTART;TZID=America/Sao_Paulo:20260526T090000");
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20260701T025959Z");
  });

  it("filters by teacher, room and export period", () => {
    const routines = [
      routine({ id: "ana-1a", teacher: "Ana", room: "1A", weekday: "monday" }),
      routine({ id: "ana-1b", teacher: "Ana", room: "1B", weekday: "monday" }),
      routine({ id: "bruno-1a", teacher: "Bruno", room: "1A", weekday: "monday" }),
    ];

    const filtered = getCalendarExportRoutines(
      routines,
      options({ teacher: "Ana", room: "1A" }),
    );
    const outsidePeriod = getCalendarExportRoutines(
      routines,
      options({ startDate: "2026-05-26", endDate: "2026-05-31" }),
    );

    expect(filtered.map((item) => item.id)).toEqual(["ana-1a"]);
    expect(outsidePeriod).toEqual([]);
  });

  it("adds RRULE, matching EXDATE entries and VALARM", () => {
    const content = buildIcsContent(
      [routine({ id: "with-alarm" })],
      options({
        excludedDates: ["2026-06-01", "2026-06-02"],
        notificationSettings: settings({ defaultLeadMinutes: 15 }),
      }),
    );

    expect(content).not.toBeNull();
    const ics = content!;
    expect(ics).toContain("RRULE:FREQ=WEEKLY;UNTIL=20260701T025959Z");
    expect(ics).toContain("EXDATE;TZID=America/Sao_Paulo:20260601T080000");
    expect(ics).not.toContain("20260602T080000");
    expect(ics).toContain("BEGIN:VALARM");
    expect(ics).toContain("TRIGGER:-PT15M");
  });

  it("keeps UID stable across exports", () => {
    const first = unfold(buildIcsContent([routine({ id: "routine-stable" })], options({ timestamp }))!);
    const second = unfold(
      buildIcsContent(
        [routine({ id: "routine-stable" })],
        options({ timestamp: new Date("2026-06-01T12:00:00.000Z") }),
      )!,
    );

    const firstUid = first.match(/^UID:.+$/m)?.[0];
    const secondUid = second.match(/^UID:.+$/m)?.[0];

    expect(firstUid).toBe("UID:proati-routine-stable@sistema-rotina-escolar-proati");
    expect(secondUid).toBe(firstUid);
  });

  it("escapes text and folds physical lines to 75 octets", () => {
    const content = buildIcsContent(
      [
        routine({
          id: "routine-special",
          subject: "Matematica, Robotica; Sala \\ A",
          notes: `Linha 1
Linha 2, extra; fim \\ ok ${"texto longo ".repeat(12)}`,
        }),
      ],
      options(),
    );

    expect(content).not.toBeNull();
    const ics = content!;
    const unfolded = unfold(ics);
    expect(unfolded).toContain(String.raw`SUMMARY:Retirada PROATI: Matematica\, Robotica\; Sala \\ A`);
    expect(unfolded).toContain(String.raw`Linha 1\nLinha 2\, extra\; fim \\ ok`);

    const encoder = new TextEncoder();
    ics.split("\r\n").forEach((line) => {
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    });
  });

  it("uses a 50 minute default duration when end time is missing", () => {
    const content = buildIcsContent(
      [routine({ id: "without-end", endTime: "" })],
      options(),
    );

    expect(content).not.toBeNull();
    expect(content).toContain("DTEND;TZID=America/Sao_Paulo:20260525T085000");
  });

  it("parses excluded dates and reports invalid entries", () => {
    const parsed = parseExcludedDatesInput("2026-06-01, nope 2026-02-30 2026-06-01");

    expect(parsed.dates).toEqual(["2026-06-01"]);
    expect(parsed.invalid).toEqual(["nope", "2026-02-30"]);
  });
});
