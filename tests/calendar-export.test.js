// @ts-check

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_NOTIFICATION_SETTINGS } from "../js/domain/types.js";
import { buildIcsContent, getCalendarExportRoutines, parseExcludedDatesInput } from "../js/ui/notifications/calendar-export.js";

const timestamp = new Date("2026-05-27T12:00:00.000Z");

const baseRoutine = {
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

const routine = (overrides) => ({ ...baseRoutine, ...overrides });
const settings = (overrides = {}) => ({ ...DEFAULT_NOTIFICATION_SETTINGS, ...overrides });
const options = (overrides = {}) => ({
  startDate: "2026-05-25",
  endDate: "2026-06-30",
  notificationSettings: settings({ defaultLeadMinutes: 10 }),
  timestamp,
  ...overrides,
});

const unfold = (content) => content.replace(/\r\n /g, "");
const eventCount = (content) => content.split("\r\n").filter((line) => line === "BEGIN:VEVENT").length;

describe("calendar export", () => {
  it("gera um VCALENDAR com múltiplos VEVENT recorrentes", () => {
    const content = buildIcsContent(
      [routine({ id: "routine-monday", weekday: "monday" }), routine({ id: "routine-tuesday", weekday: "tuesday", startTime: "09:00", endTime: "10:00" })],
      options(),
    );
    assert.notEqual(content, null);
    const ics = /** @type {string} */ (content);
    assert.equal(eventCount(ics), 2);
    assert.ok(ics.includes("BEGIN:VTIMEZONE"));
    assert.ok(ics.includes("TZID:America/Sao_Paulo"));
    assert.ok(ics.includes("DTSTART;TZID=America/Sao_Paulo:20260525T080000"));
    assert.ok(ics.includes("DTSTART;TZID=America/Sao_Paulo:20260526T090000"));
    assert.ok(ics.includes("RRULE:FREQ=WEEKLY;UNTIL=20260701T025959Z"));
  });

  it("filtra por professor, turma e período", () => {
    const routines = [
      routine({ id: "ana-1a", teacher: "Ana", room: "1A", weekday: "monday" }),
      routine({ id: "ana-1b", teacher: "Ana", room: "1B", weekday: "monday" }),
      routine({ id: "bruno-1a", teacher: "Bruno", room: "1A", weekday: "monday" }),
    ];
    const filtered = getCalendarExportRoutines(routines, options({ teacher: "Ana", room: "1A" }));
    const outsidePeriod = getCalendarExportRoutines(routines, options({ startDate: "2026-05-26", endDate: "2026-05-31" }));
    assert.deepEqual(filtered.map((item) => item.id), ["ana-1a"]);
    assert.deepEqual(outsidePeriod, []);
  });

  it("adiciona RRULE, EXDATE correspondentes e VALARM", () => {
    const content = buildIcsContent([routine({ id: "with-alarm" })], options({ excludedDates: ["2026-06-01", "2026-06-02"], notificationSettings: settings({ defaultLeadMinutes: 15 }) }));
    assert.notEqual(content, null);
    const ics = /** @type {string} */ (content);
    assert.ok(ics.includes("RRULE:FREQ=WEEKLY;UNTIL=20260701T025959Z"));
    assert.ok(ics.includes("EXDATE;TZID=America/Sao_Paulo:20260601T080000"));
    assert.ok(!ics.includes("20260602T080000"));
    assert.ok(ics.includes("BEGIN:VALARM"));
    assert.ok(ics.includes("TRIGGER:-PT15M"));
  });

  it("mantém UID estável entre exportações", () => {
    const first = unfold(/** @type {string} */ (buildIcsContent([routine({ id: "routine-stable" })], options({ timestamp }))));
    const second = unfold(/** @type {string} */ (buildIcsContent([routine({ id: "routine-stable" })], options({ timestamp: new Date("2026-06-01T12:00:00.000Z") }))));
    const firstUid = first.match(/^UID:.+$/m)?.[0];
    const secondUid = second.match(/^UID:.+$/m)?.[0];
    assert.equal(firstUid, "UID:proati-routine-726f7574696e652d737461626c65@sistema-rotina-escolar-proati");
    assert.equal(secondUid, firstUid);
  });

  it("mantém UID único para ids que colidiriam após substituição de caracteres", () => {
    const content = unfold(/** @type {string} */ (buildIcsContent([routine({ id: "a/b" }), routine({ id: "a:b", startTime: "09:00", endTime: "10:00" })], options())));
    const uids = content.match(/^UID:.+$/gm) ?? [];
    assert.deepEqual(uids, [
      "UID:proati-routine-612f62@sistema-rotina-escolar-proati",
      "UID:proati-routine-613a62@sistema-rotina-escolar-proati",
    ]);
    assert.equal(new Set(uids).size, uids.length);
  });

  it("escapa texto e dobra linhas físicas em 75 octetos", () => {
    const content = buildIcsContent(
      [routine({ id: "routine-special", subject: "Matematica, Robotica; Sala \\ A", notes: `Linha 1\nLinha 2, extra; fim \\ ok ${"texto longo ".repeat(12)}` })],
      options(),
    );
    assert.notEqual(content, null);
    const ics = /** @type {string} */ (content);
    const unfolded = unfold(ics);
    assert.ok(unfolded.includes(String.raw`SUMMARY:Retirada PROATI: Matematica\, Robotica\; Sala \\ A`));
    assert.ok(unfolded.includes(String.raw`Linha 1\nLinha 2\, extra\; fim \\ ok`));
    const encoder = new TextEncoder();
    ics.split("\r\n").forEach((line) => assert.ok(encoder.encode(line).length <= 75));
  });

  it("usa duração padrão de 50 minutos quando não há término", () => {
    const content = buildIcsContent([routine({ id: "without-end", endTime: "" })], options());
    assert.notEqual(content, null);
    assert.ok(/** @type {string} */ (content).includes("DTEND;TZID=America/Sao_Paulo:20260525T085000"));
  });

  it("processa datas excluídas e reporta inválidas", () => {
    const parsed = parseExcludedDatesInput("2026-06-01, nope 2026-02-30 2026-06-01");
    assert.deepEqual(parsed.dates, ["2026-06-01"]);
    assert.deepEqual(parsed.invalid, ["nope", "2026-02-30"]);
  });
});
