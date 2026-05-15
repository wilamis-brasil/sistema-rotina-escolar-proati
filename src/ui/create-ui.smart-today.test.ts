import { describe, expect, it } from "vitest";
import type { Routine } from "../domain/types";
import {
  areRoutineConfigsEquivalent,
  getVisibleSmartTodayRoutineGroups,
  groupEquivalentRoutines,
  isRoutineActiveNow,
  isRoutinePendingOrActive,
  mergeRoutineGroupTimes,
} from "./create-ui";

const baseRoutine: Routine = {
  id: "routine-1",
  weekday: "monday",
  startTime: "07:00",
  endTime: "08:00",
  subject: "Matematica",
  teacher: "Joao",
  room: "Sala 1",
  studentCount: 30,
  devices: ["Notebook"],
  notes: "",
  notificationEnabled: true,
  leadMinutes: null,
  createdAt: "2026-05-15T10:00:00.000Z",
  updatedAt: "2026-05-15T10:00:00.000Z",
};

function routine(overrides: Partial<Routine>): Routine {
  return {
    ...baseRoutine,
    ...overrides,
  };
}

describe("smart today routine helpers", () => {
  it("treats routines with endTime as finished at the end minute", () => {
    const item = routine({ startTime: "07:00", endTime: "08:00" });

    expect(isRoutinePendingOrActive(item, 479)).toBe(true);
    expect(isRoutineActiveNow(item, 479)).toBe(true);
    expect(isRoutinePendingOrActive(item, 480)).toBe(false);
    expect(isRoutineActiveNow(item, 480)).toBe(false);
  });

  it("treats routines without endTime as pending only until their start minute", () => {
    const item = routine({ startTime: "07:00", endTime: "" });

    expect(isRoutinePendingOrActive(item, 420)).toBe(true);
    expect(isRoutineActiveNow(item, 420)).toBe(true);
    expect(isRoutinePendingOrActive(item, 421)).toBe(false);
    expect(isRoutineActiveNow(item, 421)).toBe(false);
  });

  it("groups equivalent routines while ignoring device order", () => {
    const first = routine({ id: "routine-a", devices: ["Notebook", "Tablet"] });
    const second = routine({ id: "routine-b", startTime: "08:00", endTime: "09:00", devices: ["Tablet", "Notebook"] });

    const groups = groupEquivalentRoutines([first, second], 420);

    expect(areRoutineConfigsEquivalent(first, second)).toBe(true);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.routines.map((item) => item.id)).toEqual(["routine-a", "routine-b"]);
  });

  it("merges continuous intervals inside an equivalent group", () => {
    const groups = groupEquivalentRoutines(
      [
        routine({ id: "routine-a", startTime: "07:00", endTime: "08:00" }),
        routine({ id: "routine-b", startTime: "08:00", endTime: "09:00" }),
      ],
      420,
    );

    expect(groups[0]!.timeLabel).toBe("07:00-09:00");
    expect(mergeRoutineGroupTimes(groups[0]!)).toBe("07:00-09:00");
  });

  it("keeps non-continuous intervals separated inside an equivalent group", () => {
    const groups = groupEquivalentRoutines(
      [
        routine({ id: "routine-a", startTime: "07:00", endTime: "08:00" }),
        routine({ id: "routine-b", startTime: "10:00", endTime: "11:00" }),
      ],
      420,
    );

    expect(groups[0]!.timeLabel).toBe("07:00-08:00 \u00b7 10:00-11:00");
  });

  it("prioritizes active and near routines before applying the visible card limit", () => {
    const groups = getVisibleSmartTodayRoutineGroups(
      [
        routine({ id: "active", teacher: "A", startTime: "06:30", endTime: "07:30" }),
        routine({ id: "near-1", teacher: "B", startTime: "08:00", endTime: "09:00" }),
        routine({ id: "near-2", teacher: "C", startTime: "08:30", endTime: "09:30" }),
        routine({ id: "near-3", teacher: "D", startTime: "08:45", endTime: "09:45" }),
        routine({ id: "far", teacher: "E", startTime: "12:00", endTime: "13:00" }),
      ],
      420,
      3,
      120,
    );

    expect(groups.map((group) => group.representative.id)).toEqual(["active", "near-1", "near-2"]);
  });

  it("does not pull far equivalent routines into a visible near group", () => {
    const groups = getVisibleSmartTodayRoutineGroups(
      [
        routine({ id: "routine-a", startTime: "07:00", endTime: "08:00" }),
        routine({ id: "routine-b", startTime: "08:00", endTime: "09:00" }),
        routine({ id: "routine-c", startTime: "12:00", endTime: "13:00" }),
      ],
      420,
      3,
      120,
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]!.timeLabel).toBe("07:00-09:00");
    expect(groups[0]!.routines.map((item) => item.id)).toEqual(["routine-a", "routine-b"]);
  });

  it("falls back to the next pending routine when all pending routines are outside the lookahead window", () => {
    const groups = getVisibleSmartTodayRoutineGroups(
      [routine({ id: "far", startTime: "12:00", endTime: "13:00" })],
      420,
      3,
      120,
    );

    expect(groups.map((group) => group.representative.id)).toEqual(["far"]);
  });
});
