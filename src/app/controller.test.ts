import { describe, expect, it } from "vitest";
import { createAppController } from "./controller";
import { createEmptyState } from "../domain/model";
import { STORAGE_KEY } from "../domain/types";
import { createMemoryStorage, importStateFromText } from "../persistence/store";
import { IMPORT_MAX_BYTES, MAX_NOTIFICATION_LOG, MAX_ROUTINES, MAX_TEACHERS } from "../domain/limits";

const validRoutinePayload = {
  weekday: "monday",
  startTime: "08:00",
  endTime: "09:00",
  subject: "Matemática",
  teacher: "Ana",
  room: "6A",
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

    controller.actions.addCatalogItem("rooms", { name: "6A" });
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
      room: "6A",
    });
  });

  it("duplicates a routine preserving the class subject", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({
      initialState: createEmptyState(),
      storage,
    });

    controller.actions.addCatalogItem("rooms", { name: "6A" });
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

    controller.actions.addCatalogItem("rooms", { name: "6A" });
    expect(controller.actions.addRoutine(validRoutinePayload).ok).toBe(true);
    const routineId = controller.getState().routines[0]!.id;

    expect(controller.actions.deleteRoutine(routineId).ok).toBe(true);
    expect(controller.getState().routines).toHaveLength(0);
    expect(controller.actions.canUndoDeleteRoutine()).toBe(true);

    expect(controller.actions.undoDeleteRoutine().ok).toBe(true);
    expect(controller.getState().routines).toHaveLength(1);
    expect(controller.actions.canUndoDeleteRoutine()).toBe(false);
  });

  it("rejects a new routine with room not in catalog", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    const result = controller.actions.addRoutine({ ...validRoutinePayload, room: "Turma Inexistente" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("turma");
    }
  });

  it("accepts a new routine with registered room", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    controller.actions.addCatalogItem("rooms", { name: "Sala 12" });
    const result = controller.actions.addRoutine({ ...validRoutinePayload, room: "Sala 12" });
    expect(result.ok).toBe(true);
  });

  it("rejects updating a routine to a room not in catalog", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    controller.actions.addCatalogItem("rooms", { name: "6A" });
    controller.actions.addRoutine(validRoutinePayload);
    const routineId = controller.getState().routines[0]!.id;

    const result = controller.actions.updateRoutine(routineId, {
      ...validRoutinePayload,
      room: "Turma Inexistente",
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

describe("catalog rooms — nomes livres", () => {
  it("accepts free-form room name and stores studentCount", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    controller.actions.addCatalogItem("rooms", { name: "Sala 12", studentCount: 32 });
    const room = controller.getState().rooms.find((r) => r.name === "Sala 12");
    expect(room?.studentCount).toBe(32);
  });

  it("accepts names like '1A', 'Laboratório', '6º ano EF - A'", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    expect(controller.actions.addCatalogItem("rooms", { name: "1A" }).ok).toBe(true);
    expect(controller.actions.addCatalogItem("rooms", { name: "Laboratório" }).ok).toBe(true);
    expect(controller.actions.addCatalogItem("rooms", { name: "6º ano EF - A" }).ok).toBe(true);
  });

  it("routine only accepts room already in catalog", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    controller.actions.addCatalogItem("rooms", { name: "6A" });
    const withRegistered = controller.actions.addRoutine({ ...validRoutinePayload, room: "6A" });
    expect(withRegistered.ok).toBe(true);

    const withUnregistered = controller.actions.addRoutine({ ...validRoutinePayload, room: "Turma X" });
    expect(withUnregistered.ok).toBe(false);
    if (!withUnregistered.ok) {
      expect(withUnregistered.errors.join(" ")).toMatch(/turma/i);
    }
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

describe("importData — campos com texto excedendo limite", () => {
  it("rejeita importação full-state com nome de professor acima do limite", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });
    const json = JSON.stringify({
      schemaVersion: 6,
      teachers: [{ id: "t1", name: "A".repeat(81), createdAt: "", updatedAt: "" }],
      routines: [],
      rooms: [],
      devices: [],
      passwords: [],
      maintenanceRecords: [],
    });
    const result = controller.actions.importData(json);
    expect(result.ok).toBe(false);
  });
});

describe("duplicateRoutine — respeita MAX_ROUTINES", () => {
  it(`rejeita duplicar rotina quando limite de ${MAX_ROUTINES} rotinas está atingido`, () => {
    const storage = createMemoryStorage();
    const baseRoutine = {
      id: "r0",
      weekday: "monday" as const,
      startTime: "08:00",
      endTime: "09:00",
      subject: "Aula",
      teacher: "Prof",
      room: "6A",
      studentCount: 30,
      devices: ["Notebook"],
      notes: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    const initialState = {
      ...createEmptyState(),
      routines: Array.from({ length: MAX_ROUTINES }, (_, i) => ({ ...baseRoutine, id: `r-${i}` })),
    };
    const controller = createAppController({ initialState, storage });
    expect(controller.getState().routines).toHaveLength(MAX_ROUTINES);

    const result = controller.actions.duplicateRoutine(controller.getState().routines[0]!.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/limite/i);
    }
  });
});

describe("undoDeleteRoutine — respeita MAX_ROUTINES", () => {
  it(`rejeita desfazer exclusão quando limite de ${MAX_ROUTINES} rotinas está atingido`, () => {
    const storage = createMemoryStorage();
    const baseRoutine = {
      id: "r0",
      weekday: "monday" as const,
      startTime: "08:00",
      endTime: "09:00",
      subject: "Aula",
      teacher: "Prof",
      room: "6A",
      studentCount: 30,
      devices: ["Notebook"],
      notes: "",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    // Start with MAX_ROUTINES + 1 to allow setup: delete one (→ MAX_ROUTINES), then undo should fail
    const initialState = {
      ...createEmptyState(),
      routines: Array.from({ length: MAX_ROUTINES + 1 }, (_, i) => ({ ...baseRoutine, id: `r-${i}` })),
    };
    const controller = createAppController({ initialState, storage });

    const idToDelete = controller.getState().routines[0]!.id;
    expect(controller.actions.deleteRoutine(idToDelete).ok).toBe(true);
    expect(controller.getState().routines).toHaveLength(MAX_ROUTINES);
    expect(controller.actions.canUndoDeleteRoutine()).toBe(true);

    const result = controller.actions.undoDeleteRoutine();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/limite/i);
    }
  });
});

describe("catalog auto-creation — respeita limites", () => {
  it(`não adiciona professor no catálogo além do limite de ${MAX_TEACHERS}`, () => {
    const teachers = Array.from({ length: MAX_TEACHERS }, (_, i) => ({
      id: `t-${i}`,
      name: `Professor ${i}`,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const rooms = [{ id: "room-1", name: "6A", studentCount: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }];
    const initialState = { ...createEmptyState(), teachers, rooms };
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState, storage });

    const result = controller.actions.addRoutine({ ...validRoutinePayload, teacher: "Professor Novo" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/professores/i);
    }
    expect(controller.getState().teachers).toHaveLength(MAX_TEACHERS);
  });
});

describe("markAllNotificationsAsSeen", () => {
  it("marca entradas existentes como vistas, atualiza updatedAt e remove snoozedUntil", () => {
    const existingLog = [
      {
        id: "notif-1",
        status: "pendente" as const,
        date: "2026-05-25",
        type: "inicio" as const,
        time: "08:00",
        routineIds: ["r1"],
        updatedAt: "2026-05-25T07:00:00.000Z",
        snoozedUntil: "08:10",
      },
      {
        id: "notif-2",
        status: "adiada" as const,
        date: "2026-05-25",
        type: "inicio" as const,
        time: "09:00",
        routineIds: ["r2"],
        updatedAt: "2026-05-25T08:00:00.000Z",
      },
    ];
    const initialState = { ...createEmptyState(), notificationLog: existingLog };
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState, storage });

    const result = controller.actions.markAllNotificationsAsSeen([
      { id: "notif-1", date: "2026-05-25", type: "inicio", time: "08:00", routineIds: ["r1"] },
      { id: "notif-2", date: "2026-05-25", type: "inicio", time: "09:00", routineIds: ["r2"] },
    ]);
    expect(result.ok).toBe(true);

    const log = controller.getState().notificationLog;
    const first = log.find((e) => e.id === "notif-1");
    const second = log.find((e) => e.id === "notif-2");
    expect(first?.status).toBe("vista");
    expect(first?.snoozedUntil).toBeUndefined();
    expect(first?.updatedAt).not.toBe("2026-05-25T07:00:00.000Z");
    expect(second?.status).toBe("vista");
  });

  it("cria entradas no log para IDs ainda sem registro (pendente puro)", () => {
    const initialState = createEmptyState();
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState, storage });

    const result = controller.actions.markAllNotificationsAsSeen([
      { id: "notif-nova", date: "2026-05-25", type: "inicio", time: "08:00", routineIds: ["r1"] },
    ]);
    expect(result.ok).toBe(true);

    const log = controller.getState().notificationLog;
    expect(log).toHaveLength(1);
    expect(log[0]?.id).toBe("notif-nova");
    expect(log[0]?.status).toBe("vista");
    expect(log[0]?.snoozedUntil).toBeUndefined();
  });

  it("retorna ok sem alterar log quando lista vazia", () => {
    const existingLog = [
      {
        id: "notif-1",
        status: "pendente" as const,
        date: "2026-05-25",
        type: "inicio" as const,
        time: "08:00",
        routineIds: ["r1"],
        updatedAt: "2026-05-25T07:00:00.000Z",
      },
    ];
    const initialState = { ...createEmptyState(), notificationLog: existingLog };
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState, storage });

    expect(controller.actions.markAllNotificationsAsSeen([]).ok).toBe(true);
    expect(controller.getState().notificationLog[0]?.status).toBe("pendente");
  });
});

describe("recordNotificationStatus — respeita MAX_NOTIFICATION_LOG", () => {
  it(`poda o log ao exceder ${MAX_NOTIFICATION_LOG} entradas`, () => {
    const existingLog = Array.from({ length: MAX_NOTIFICATION_LOG }, (_, i) => ({
      id: `notif-existing-${i}`,
      status: "vista" as const,
      date: "2026-05-25",
      type: "inicio" as const,
      time: "08:00",
      routineIds: ["r1"],
      updatedAt: new Date(2026, 4, 1, 0, 0, i).toISOString(),
    }));
    const initialState = { ...createEmptyState(), notificationLog: existingLog };
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState, storage });

    controller.actions.recordNotificationStatus({
      id: "notif-new",
      status: "pendente",
      date: "2026-05-25",
      type: "inicio",
      time: "09:00",
      routineIds: ["r2"],
    });

    expect(controller.getState().notificationLog.length).toBeLessThanOrEqual(MAX_NOTIFICATION_LOG);
  });
});
