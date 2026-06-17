// @ts-check

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildWeekSchedule } from "../js/ui/week-schedule.js";

const baseRoutine = {
  id: "routine-1",
  weekday: "monday",
  startTime: "07:00",
  endTime: "07:50",
  subject: "Matemática",
  teacher: "Jussara",
  room: "8B",
  studentCount: 28,
  devices: ["Notebook"],
  notes: "",
  createdAt: "2026-05-13T10:00:00.000Z",
  updatedAt: "2026-05-13T10:00:00.000Z",
};

const routine = (overrides) => ({ ...baseRoutine, ...overrides });

describe("buildWeekSchedule", () => {
  it("agrupa por equipamento e duplica rotinas multi-dispositivo em cada seção", () => {
    const schedule = buildWeekSchedule([routine({ id: "routine-multi", devices: ["Notebook", "Chromebook"] })], ["Chromebook", "Notebook"]);
    assert.deepEqual(schedule.sections.map((s) => s.deviceName), ["Chromebook", "Notebook"]);
    assert.deepEqual(schedule.sections.map((s) => s.routineCount), [1, 1]);
  });

  it("usa a ordem do catálogo e ordem alfabética para fora do catálogo", () => {
    const schedule = buildWeekSchedule(
      [routine({ id: "routine-1", devices: ["Projetor"] }), routine({ id: "routine-2", devices: ["Tablet"] }), routine({ id: "routine-3", devices: ["Chromebook"] })],
      ["Notebook", "Chromebook", "Tablet"],
    );
    assert.deepEqual(schedule.sections.map((s) => s.deviceName), ["Chromebook", "Tablet", "Projetor"]);
  });

  it("cria linhas de horário globais ordenadas por início para todas as seções", () => {
    const schedule = buildWeekSchedule(
      [routine({ id: "routine-late", startTime: "10:40", endTime: "11:30", devices: ["Notebook"] }), routine({ id: "routine-early", startTime: "07:50", endTime: "08:40", devices: ["Chromebook"] })],
      ["Notebook", "Chromebook"],
    );
    assert.deepEqual(schedule.timeSlots.map((slot) => slot.label), ["7H50-8H40", "10H40-11H30"]);
    assert.deepEqual(schedule.sections[0].rows.map((row) => row.timeLabel), ["7H50-8H40", "10H40-11H30"]);
    assert.deepEqual(schedule.sections[1].rows.map((row) => row.timeLabel), ["7H50-8H40", "10H40-11H30"]);
  });

  it("mantém células vazias quando não há reserva no horário/dia", () => {
    const schedule = buildWeekSchedule(
      [routine({ id: "routine-notebook", weekday: "monday", startTime: "07:00", endTime: "07:50", devices: ["Notebook"] }), routine({ id: "routine-chromebook", weekday: "tuesday", startTime: "08:40", endTime: "09:30", devices: ["Chromebook"] })],
      ["Notebook", "Chromebook"],
    );
    const notebook = schedule.sections.find((s) => s.deviceName === "Notebook");
    const secondRowTuesday = notebook.rows[1].cells.find((cell) => cell.weekday === "tuesday");
    assert.deepEqual(secondRowTuesday.entries, []);
  });

  it("empilha múltiplas reservas na mesma célula", () => {
    const schedule = buildWeekSchedule(
      [routine({ id: "routine-a", teacher: "Ana", room: "6A", devices: ["Notebook"] }), routine({ id: "routine-b", teacher: "Bruno", room: "7B", devices: ["Notebook"] })],
      ["Notebook"],
    );
    const mondayCell = schedule.sections[0].rows[0].cells.find((cell) => cell.weekday === "monday");
    assert.deepEqual(mondayCell.entries.map((e) => e.routineId), ["routine-a", "routine-b"]);
    assert.deepEqual(mondayCell.entries.map((e) => e.teacher), ["Ana", "Bruno"]);
  });

  it("preserva os dados da rotina usados pelas células", () => {
    const schedule = buildWeekSchedule(
      [routine({ id: "routine-details", teacher: "JUSSARA/MATIFIC", subject: "Redação", room: "Sala 9A", studentCount: 31, notes: "Levar carregador", devices: ["Notebook"] })],
      ["Notebook"],
    );
    const entry = schedule.sections[0].rows[0].cells[0].entries[0];
    assert.equal(entry.routineId, "routine-details");
    assert.equal(entry.deviceName, "Notebook");
    assert.equal(entry.timeLabel, "7H-7H50");
    assert.equal(entry.room, "Sala 9A");
    assert.equal(entry.teacher, "JUSSARA/MATIFIC");
    assert.equal(entry.subject, "Redação");
    assert.equal(entry.studentCount, 31);
    assert.equal(entry.notes, "Levar carregador");
  });
});
