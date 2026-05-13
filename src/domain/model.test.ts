import { describe, expect, it } from "vitest";
import { buildRoutine, createEmptyState, normalizeState, validateLeadMinutes } from "./model";

const validRoutinePayload = {
  weekday: "monday",
  startTime: "08:00",
  endTime: "09:00",
  teacher: "Ana",
  room: "1A",
  studentCount: "30",
  devices: ["Notebook"],
  notes: "",
  notificationEnabled: true,
  leadMinutes: "10",
};

describe("buildRoutine", () => {
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
