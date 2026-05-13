import { describe, expect, it } from "vitest";
import { createAppController } from "./controller";
import { createEmptyState } from "../domain/model";
import { STORAGE_KEY } from "../domain/types";
import { createMemoryStorage, importStateFromText } from "../persistence/store";

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

describe("importStateFromText", () => {
  it("rejects invalid JSON", () => {
    const result = importStateFromText("{ invalid json");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("Arquivo JSON");
    }
  });
});

describe("createAppController", () => {
  it("adds a routine and persists it to the provided storage", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({
      initialState: createEmptyState(),
      storage,
    });

    const result = controller.actions.addRoutine(validRoutinePayload);

    expect(result.ok).toBe(true);
    expect(controller.getState().routines).toHaveLength(1);

    const savedState = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}") as {
      routines?: Array<{ teacher?: string; room?: string }>;
    };
    expect(savedState.routines).toHaveLength(1);
    expect(savedState.routines?.[0]).toMatchObject({
      teacher: "Ana",
      room: "1A",
    });
  });

  it("undoes the most recent routine deletion", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({
      initialState: createEmptyState(),
      storage,
    });

    expect(controller.actions.addRoutine(validRoutinePayload).ok).toBe(true);
    const routineId = controller.getState().routines[0]!.id;

    expect(controller.actions.deleteRoutine(routineId).ok).toBe(true);
    expect(controller.getState().routines).toHaveLength(0);
    expect(controller.actions.canUndoDeleteRoutine()).toBe(true);

    expect(controller.actions.undoDeleteRoutine().ok).toBe(true);
    expect(controller.getState().routines).toHaveLength(1);
    expect(controller.actions.canUndoDeleteRoutine()).toBe(false);
  });
});
