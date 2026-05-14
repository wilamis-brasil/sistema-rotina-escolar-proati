import { describe, expect, it } from "vitest";
import { buildRoutine, createEmptyState, filterRoutines, normalizeState, sortRoutines, validateLeadMinutes } from "./model";

const validRoutinePayload = {
  weekday: "monday",
  startTime: "08:00",
  endTime: "09:00",
  subject: "Matemática",
  teacher: "Ana",
  room: "1A",
  studentCount: "30",
  devices: ["Notebook"],
  notes: "",
  notificationEnabled: true,
  leadMinutes: "10",
};

describe("buildRoutine", () => {
  it("normalizes the class subject as part of the routine", () => {
    const result = buildRoutine({
      ...validRoutinePayload,
      subject: "  Redação  ",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.subject).toBe("Redação");
    }
  });

  it("rejects an end time before the start time", () => {
    const result = buildRoutine({
      ...validRoutinePayload,
      startTime: "10:00",
      endTime: "09:00",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("anterior");
    }
  });

  it("finds routines by class subject", () => {
    const math = buildRoutine({ ...validRoutinePayload, subject: "Matemática" });
    const history = buildRoutine({ ...validRoutinePayload, subject: "História", startTime: "10:00", endTime: "11:00" });

    expect(math.ok).toBe(true);
    expect(history.ok).toBe(true);
    if (math.ok && history.ok) {
      expect(filterRoutines([math.value, history.value], "matemática")).toEqual([math.value]);
    }
  });

  it("sorts routines by class subject with weekday and time fallback", () => {
    const history = buildRoutine({ ...validRoutinePayload, subject: "História", startTime: "10:00", endTime: "11:00" });
    const math = buildRoutine({ ...validRoutinePayload, subject: "Matemática", startTime: "08:00" });

    expect(history.ok).toBe(true);
    expect(math.ok).toBe(true);
    if (history.ok && math.ok) {
      expect(sortRoutines([math.value, history.value], "subject").map((routine) => routine.subject)).toEqual([
        "História",
        "Matemática",
      ]);
    }
  });
});

describe("settings defaults", () => {
  it("keeps alerts enabled by default", () => {
    expect(createEmptyState().settings.notificationsEnabled).toBe(true);
  });

  it("normalizes missing notification settings to enabled", () => {
    const state = normalizeState({
      routines: [],
      teachers: [],
      rooms: [],
      devices: [],
      settings: {},
    });

    expect(state.settings.notificationsEnabled).toBe(true);
  });

  it("migrates legacy paused notification defaults to enabled", () => {
    const state = normalizeState({
      schemaVersion: 1,
      routines: [],
      teachers: [],
      rooms: [],
      devices: [],
      settings: { notificationsEnabled: false },
    });

    expect(state.settings.notificationsEnabled).toBe(true);
  });

  it("preserves notification pauses saved by the current schema", () => {
    const state = normalizeState({
      schemaVersion: 2,
      routines: [],
      teachers: [],
      rooms: [],
      devices: [],
      settings: { notificationsEnabled: false },
    });

    expect(state.settings.notificationsEnabled).toBe(false);
  });

  it("normalizes old routines without class subject to an empty string", () => {
    const state = normalizeState({
      schemaVersion: 2,
      routines: [
        {
          ...validRoutinePayload,
          subject: undefined,
        },
      ],
      teachers: [],
      rooms: [],
      devices: [],
      settings: {},
    });

    expect(state.routines[0]?.subject).toBe("");
  });
});

describe("validateLeadMinutes", () => {
  it("accepts empty lead minutes as global/default", () => {
    expect(validateLeadMinutes("")).toEqual({ value: null, error: null });
  });

  it("accepts integer lead minutes between 0 and 1440", () => {
    expect(validateLeadMinutes("0")).toEqual({ value: 0, error: null });
    expect(validateLeadMinutes("1440")).toEqual({ value: 1440, error: null });
  });

  it("rejects invalid lead minutes", () => {
    expect(validateLeadMinutes("1441").error).toContain("1440 minutos");
    expect(validateLeadMinutes("-1").error).toContain("1440 minutos");
    expect(validateLeadMinutes("1.5").error).toContain("1440 minutos");
  });
});
