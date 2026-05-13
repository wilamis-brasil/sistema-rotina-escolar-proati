import { describe, expect, it } from "vitest";
import { buildWeekSchedule } from "./week-schedule";
import type { Routine } from "../domain/types";

const baseRoutine: Routine = {
  id: "routine-1",
  weekday: "monday",
  startTime: "07:00",
  endTime: "07:50",
  teacher: "Jussara",
  room: "8B",
  studentCount: 28,
  devices: ["Notebook"],
  notes: "",
  notificationEnabled: true,
  leadMinutes: null,
  createdAt: "2026-05-13T10:00:00.000Z",
  updatedAt: "2026-05-13T10:00:00.000Z",
};

function routine(overrides: Partial<Routine>): Routine {
  return {
    ...baseRoutine,
    ...overrides,
  };
}

describe("buildWeekSchedule", () => {
  it("groups routines by device and duplicates multi-device routines into each equipment section", () => {
    const schedule = buildWeekSchedule(
      [
        routine({
          id: "routine-multi",
          devices: ["Notebook", "Chromebook"],
        }),
      ],
      ["Chromebook", "Notebook"],
    );

    expect(schedule.sections.map((section) => section.deviceName)).toEqual(["Chromebook", "Notebook"]);
    expect(schedule.sections.map((section) => section.routineCount)).toEqual([1, 1]);
  });

  it("uses catalog device order first and alphabetical order for devices outside the catalog", () => {
    const schedule = buildWeekSchedule(
      [
        routine({ id: "routine-1", devices: ["Projetor"] }),
        routine({ id: "routine-2", devices: ["Tablet"] }),
        routine({ id: "routine-3", devices: ["Chromebook"] }),
      ],
      ["Notebook", "Chromebook", "Tablet"],
    );

    expect(schedule.sections.map((section) => section.deviceName)).toEqual(["Chromebook", "Tablet", "Projetor"]);
  });

  it("creates global time rows sorted by start time for every equipment section", () => {
    const schedule = buildWeekSchedule(
      [
        routine({ id: "routine-late", startTime: "10:40", endTime: "11:30", devices: ["Notebook"] }),
        routine({ id: "routine-early", startTime: "07:50", endTime: "08:40", devices: ["Chromebook"] }),
      ],
      ["Notebook", "Chromebook"],
    );

    expect(schedule.timeSlots.map((slot) => slot.label)).toEqual(["7H50-8H40", "10H40-11H30"]);
    expect(schedule.sections[0]!.rows.map((row) => row.timeLabel)).toEqual(["7H50-8H40", "10H40-11H30"]);
    expect(schedule.sections[1]!.rows.map((row) => row.timeLabel)).toEqual(["7H50-8H40", "10H40-11H30"]);
  });

  it("keeps empty cells when a device has no reservation for a visible time and weekday", () => {
    const schedule = buildWeekSchedule(
      [
        routine({ id: "routine-notebook", weekday: "monday", startTime: "07:00", endTime: "07:50", devices: ["Notebook"] }),
        routine({ id: "routine-chromebook", weekday: "tuesday", startTime: "08:40", endTime: "09:30", devices: ["Chromebook"] }),
      ],
      ["Notebook", "Chromebook"],
    );

    const notebook = schedule.sections.find((section) => section.deviceName === "Notebook")!;
    const secondRowTuesday = notebook.rows[1]!.cells.find((cell) => cell.weekday === "tuesday")!;

    expect(secondRowTuesday.entries).toEqual([]);
  });

  it("stacks multiple reservations in the same equipment, weekday, and time cell", () => {
    const schedule = buildWeekSchedule(
      [
        routine({ id: "routine-a", teacher: "Ana", room: "6A", devices: ["Notebook"] }),
        routine({ id: "routine-b", teacher: "Bruno", room: "7B", devices: ["Notebook"] }),
      ],
      ["Notebook"],
    );

    const mondayCell = schedule.sections[0]!.rows[0]!.cells.find((cell) => cell.weekday === "monday")!;

    expect(mondayCell.entries.map((entry) => entry.routineId)).toEqual(["routine-a", "routine-b"]);
    expect(mondayCell.entries.map((entry) => entry.teacher)).toEqual(["Ana", "Bruno"]);
  });

  it("preserves the routine data needed by table cells and actions", () => {
    const schedule = buildWeekSchedule(
      [
        routine({
          id: "routine-details",
          teacher: "JUSSARA/MATIFIC",
          room: "Sala 9A",
          studentCount: 31,
          notes: "Levar carregador",
          devices: ["Notebook"],
        }),
      ],
      ["Notebook"],
    );

    const entry = schedule.sections[0]!.rows[0]!.cells[0]!.entries[0]!;

    expect(entry).toMatchObject({
      routineId: "routine-details",
      deviceName: "Notebook",
      timeLabel: "7H-7H50",
      room: "Sala 9A",
      teacher: "JUSSARA/MATIFIC",
      studentCount: 31,
      notes: "Levar carregador",
    });
  });
});
