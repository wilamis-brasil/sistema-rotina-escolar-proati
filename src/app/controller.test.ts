import { describe, expect, it } from "vitest";
import { createAppController } from "./controller";
import { createEmptyState } from "../domain/model";
import { STORAGE_KEY } from "../domain/types";
import { createMemoryStorage, importStateFromText } from "../persistence/store";
import { IMPORT_MAX_BYTES, MAX_ROUTINES } from "../domain/limits";

const validRoutinePayload = {
  weekday: "monday",
  startTime: "08:00",
  endTime: "09:00",
  subject: "Matemática",
  teacher: "Ana",
  room: "6º ano EF - A",
  studentCount: "30",
  devices: ["Notebook"],
  notes: "",
};

describe("importStateFromText", () => {
  it("rejects invalid JSON", () => {
    const result = importStateFromText("{ invalid json");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("Arquivo JSON");
    }
  });

  it(`rejeita payload acima de ${IMPORT_MAX_BYTES} bytes antes de parsear JSON`, () => {
    const oversized = "x".repeat(IMPORT_MAX_BYTES + 1);
    const result = importStateFromText(oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/limite/i);
    }
  });

  it(`rejeita importação com coleção de rotinas acima de MAX_ROUTINES (${MAX_ROUTINES})`, () => {
    const routineTemplate = {
      weekday: "monday",
      startTime: "08:00",
      endTime: "09:00",
      subject: "Aula",
      teacher: "Prof",
      room: "1A",
      studentCount: 30,
      devices: ["Notebook"],
      notes: "",
    };
    const oversizedState = JSON.stringify({
      routines: Array.from({ length: MAX_ROUTINES + 1 }, (_, i) => ({
        ...routineTemplate,
        id: `routine-${i}`,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      })),
    });
    const result = importStateFromText(oversizedState);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/rotinas/i);
    }
  });
});

describe("createAppController", () => {
  it("adds a routine with class subject and persists it to the provided storage", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({
      initialState: createEmptyState(),
      storage,
    });

    const result = controller.actions.addRoutine(validRoutinePayload);

    expect(result.ok).toBe(true);
    expect(controller.getState().routines).toHaveLength(1);

    const savedState = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}") as {
      routines?: Array<{ subject?: string; teacher?: string; room?: string }>;
    };
    expect(savedState.routines).toHaveLength(1);
    expect(savedState.routines?.[0]).toMatchObject({
      subject: "Matemática",
      teacher: "Ana",
      room: "6º ano EF - A",
    });
  });

  it("duplicates a routine preserving the class subject", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({
      initialState: createEmptyState(),
      storage,
    });

    expect(controller.actions.addRoutine(validRoutinePayload).ok).toBe(true);
    const routineId = controller.getState().routines[0]!.id;

    const result = controller.actions.duplicateRoutine(routineId);

    expect(result.ok).toBe(true);
    expect(controller.getState().routines).toHaveLength(2);
    expect(controller.getState().routines[1]?.subject).toBe("Matemática");
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

  it("rejects a new routine with non-canonical room", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    const result = controller.actions.addRoutine({ ...validRoutinePayload, room: "Sala 12" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("turma padronizada");
    }
  });

  it("rejects a new routine with legacy '1A' room", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    const result = controller.actions.addRoutine({ ...validRoutinePayload, room: "1A" });
    expect(result.ok).toBe(false);
  });

  it("accepts a new routine with canonical room", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    const result = controller.actions.addRoutine({ ...validRoutinePayload, room: "9º ano EF - C" });
    expect(result.ok).toBe(true);
  });

  it("rejects updating a routine to a non-canonical room", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    controller.actions.addRoutine(validRoutinePayload);
    const routineId = controller.getState().routines[0]!.id;

    const result = controller.actions.updateRoutine(routineId, {
      ...validRoutinePayload,
      room: "Laboratório",
    });
    expect(result.ok).toBe(false);
  });
});

describe("importData — limites operacionais", () => {
  it(`rejeita importação full-state acima de ${IMPORT_MAX_BYTES} bytes`, () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });
    const oversized = "x".repeat(IMPORT_MAX_BYTES + 1);
    const result = controller.actions.importData(oversized);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/limite/i);
    }
  });
});

describe("fixed class letters", () => {
  it("accepts Z as a standard class letter", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    const result = controller.actions.addRoutine({ ...validRoutinePayload, room: "6º ano EF - Z" });
    expect(result.ok).toBe(true);
    expect(controller.getState().routines[0]?.room).toBe("6º ano EF - Z");
  });

  it("rejects canonical-looking rooms with invalid letters", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    expect(controller.actions.addRoutine({ ...validRoutinePayload, room: "6º ano EF - AA" }).ok).toBe(false);
    expect(controller.actions.addRoutine({ ...validRoutinePayload, room: "6º ano EF - Ç" }).ok).toBe(false);
    const result = controller.actions.addRoutine({ ...validRoutinePayload, room: "6º ano EF - 1" });
    expect(result.ok).toBe(false);
  });

  it("catalog room stores canonical name and studentCount", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    controller.actions.addCatalogItem("rooms", { name: "6º ano EF - Z", studentCount: 32 });
    const room = controller.getState().rooms.find((r) => r.name === "6º ano EF - Z");
    expect(room?.studentCount).toBe(32);
  });

  it("rejects a non-canonical catalog room", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    const result = controller.actions.addCatalogItem("rooms", { name: "Sala 12", studentCount: 32 });
    expect(result.ok).toBe(false);
  });

  it("legacy routines and legacy classLetters imported via normalizeState are preserved without loss", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    const json = JSON.stringify({
      schemaVersion: 6,
      routines: [
        {
          id: "r1",
          weekday: "monday",
          startTime: "08:00",
          endTime: "09:00",
          subject: "Informática",
          teacher: "João",
          room: "Sala 12",
          studentCount: 25,
          devices: ["Notebook"],
          notes: "",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:00:00.000Z",
        },
      ],
      settings: { classLetters: ["A", "B", "D"] },
    });

    const result = controller.actions.importData(json);
    expect(result.ok).toBe(true);
    expect(controller.getState().routines[0]?.room).toBe("Sala 12");
    expect("classLetters" in controller.getState().settings).toBe(false);
  });
});
