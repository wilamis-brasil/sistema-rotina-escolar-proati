// @ts-check

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createAppController } from "../js/app/controller.js";
import { createEmptyState } from "../js/domain/model.js";
import { STORAGE_KEY } from "../js/domain/types.js";
import { createMemoryStorage, importStateFromText } from "../js/persistence/store.js";
import { IMPORT_MAX_BYTES, MAX_NOTIFICATION_LOG, MAX_ROUTINES, MAX_TEACHERS } from "../js/domain/limits.js";

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

const baseRoutine = {
  id: "r0",
  weekday: "monday",
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

function makeController(initialState = createEmptyState()) {
  return createAppController({ initialState, storage: createMemoryStorage() });
}

describe("importStateFromText", () => {
  it("rejeita JSON inválido", () => {
    const result = importStateFromText("{ invalid json");
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.join(" ").includes("Backup JSON"));
  });

  it(`rejeita payload acima de ${IMPORT_MAX_BYTES} bytes antes de parsear`, () => {
    const result = importStateFromText("x".repeat(IMPORT_MAX_BYTES + 1));
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /limite/i.test(result.errors.join(" ")));
  });

  it(`rejeita rotinas acima de MAX_ROUTINES (${MAX_ROUTINES})`, () => {
    const oversized = JSON.stringify({
      routines: Array.from({ length: MAX_ROUTINES + 1 }, (_, i) => ({ ...baseRoutine, id: `routine-${i}` })),
    });
    const result = importStateFromText(oversized);
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /rotinas/i.test(result.errors.join(" ")));
  });
});

describe("createAppController", () => {
  it("adiciona rotina com aula e persiste no storage", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });

    controller.actions.addCatalogItem("rooms", { name: "6A" });
    assert.equal(controller.actions.addRoutine(validRoutinePayload).ok, true);
    assert.equal(controller.getState().routines.length, 1);

    const saved = JSON.parse(storage.getItem(STORAGE_KEY) ?? "{}");
    assert.equal(saved.routines.length, 1);
    assert.equal(saved.routines[0].subject, "Matemática");
    assert.equal(saved.routines[0].teacher, "Ana");
    assert.equal(saved.routines[0].room, "6A");
  });

  it("duplica rotina preservando a aula", () => {
    const controller = makeController();
    controller.actions.addCatalogItem("rooms", { name: "6A" });
    assert.equal(controller.actions.addRoutine(validRoutinePayload).ok, true);
    const routineId = controller.getState().routines[0].id;

    assert.equal(controller.actions.duplicateRoutine(routineId).ok, true);
    assert.equal(controller.getState().routines.length, 2);
    assert.equal(controller.getState().routines[1]?.subject, "Matemática");
  });

  it("desfaz a exclusão mais recente de rotina", () => {
    const controller = makeController();
    controller.actions.addCatalogItem("rooms", { name: "6A" });
    assert.equal(controller.actions.addRoutine(validRoutinePayload).ok, true);
    const routineId = controller.getState().routines[0].id;

    assert.equal(controller.actions.deleteRoutine(routineId).ok, true);
    assert.equal(controller.getState().routines.length, 0);
    assert.equal(controller.actions.canUndoDeleteRoutine(), true);

    assert.equal(controller.actions.undoDeleteRoutine().ok, true);
    assert.equal(controller.getState().routines.length, 1);
    assert.equal(controller.actions.canUndoDeleteRoutine(), false);
  });

  it("rejeita nova rotina com turma fora do catálogo", () => {
    const controller = makeController();
    const result = controller.actions.addRoutine({ ...validRoutinePayload, room: "Turma Inexistente" });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.join(" ").includes("turma"));
  });

  it("aceita nova rotina com turma cadastrada", () => {
    const controller = makeController();
    controller.actions.addCatalogItem("rooms", { name: "Sala 12" });
    assert.equal(controller.actions.addRoutine({ ...validRoutinePayload, room: "Sala 12" }).ok, true);
  });

  it("rejeita atualizar rotina para turma fora do catálogo", () => {
    const controller = makeController();
    controller.actions.addCatalogItem("rooms", { name: "6A" });
    controller.actions.addRoutine(validRoutinePayload);
    const routineId = controller.getState().routines[0].id;
    const result = controller.actions.updateRoutine(routineId, { ...validRoutinePayload, room: "Turma Inexistente" });
    assert.equal(result.ok, false);
  });
});

describe("importData — limites operacionais", () => {
  it(`rejeita importação full-state acima de ${IMPORT_MAX_BYTES} bytes`, () => {
    const controller = makeController();
    const result = controller.actions.importData("x".repeat(IMPORT_MAX_BYTES + 1));
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /limite/i.test(result.errors.join(" ")));
  });
});

describe("validateImportData", () => {
  it("rejeita JSON inválido sem alterar estado ou storage", () => {
    const storage = createMemoryStorage();
    const controller = createAppController({ initialState: createEmptyState(), storage });
    controller.actions.addCatalogItem("rooms", { name: "6A" });
    assert.equal(controller.actions.addRoutine(validRoutinePayload).ok, true);

    const stateBefore = JSON.stringify(controller.getState());
    const storageBefore = storage.getItem(STORAGE_KEY);

    assert.equal(controller.actions.validateImportData("{ invalid json").ok, false);
    assert.equal(JSON.stringify(controller.getState()), stateBefore);
    assert.equal(storage.getItem(STORAGE_KEY), storageBefore);
  });
});

describe("catalog rooms — nomes livres", () => {
  it("aceita turma livre e guarda studentCount", () => {
    const controller = makeController();
    controller.actions.addCatalogItem("rooms", { name: "Sala 12", studentCount: 32 });
    assert.equal(controller.getState().rooms.find((r) => r.name === "Sala 12")?.studentCount, 32);
  });

  it("aceita nomes como '1A', 'Laboratório', '6º ano EF - A'", () => {
    const controller = makeController();
    assert.equal(controller.actions.addCatalogItem("rooms", { name: "1A" }).ok, true);
    assert.equal(controller.actions.addCatalogItem("rooms", { name: "Laboratório" }).ok, true);
    assert.equal(controller.actions.addCatalogItem("rooms", { name: "6º ano EF - A" }).ok, true);
  });

  it("rotina só aceita turma já no catálogo", () => {
    const controller = makeController();
    controller.actions.addCatalogItem("rooms", { name: "6A" });
    assert.equal(controller.actions.addRoutine({ ...validRoutinePayload, room: "6A" }).ok, true);
    const withUnregistered = controller.actions.addRoutine({ ...validRoutinePayload, room: "Turma X" });
    assert.equal(withUnregistered.ok, false);
    assert.ok(!withUnregistered.ok && /turma/i.test(withUnregistered.errors.join(" ")));
  });

  it("preserva rotinas e classLetters legados importados via importData", () => {
    const controller = makeController();
    const json = JSON.stringify({
      schemaVersion: 6,
      routines: [{ ...baseRoutine, id: "r1", subject: "Informática", teacher: "João", room: "Sala 12", studentCount: 25, createdAt: "2024-01-01T00:00:00.000Z", updatedAt: "2024-01-01T00:00:00.000Z" }],
      settings: { classLetters: ["A", "B", "D"] },
    });
    assert.equal(controller.actions.importData(json).ok, true);
    assert.equal(controller.getState().routines[0]?.room, "Sala 12");
    assert.equal("classLetters" in controller.getState().settings, false);
  });
});

describe("importData — texto excedendo limite", () => {
  it("rejeita importação com nome de professor acima do limite", () => {
    const controller = makeController();
    const json = JSON.stringify({
      schemaVersion: 6,
      teachers: [{ id: "t1", name: "A".repeat(81), createdAt: "", updatedAt: "" }],
      routines: [], rooms: [], devices: [], maintenanceRecords: [],
    });
    assert.equal(controller.actions.importData(json).ok, false);
  });
});

describe("duplicateRoutine — respeita MAX_ROUTINES", () => {
  it(`rejeita duplicar quando limite de ${MAX_ROUTINES} está atingido`, () => {
    const initialState = { ...createEmptyState(), routines: Array.from({ length: MAX_ROUTINES }, (_, i) => ({ ...baseRoutine, id: `r-${i}` })) };
    const controller = makeController(initialState);
    assert.equal(controller.getState().routines.length, MAX_ROUTINES);
    const result = controller.actions.duplicateRoutine(controller.getState().routines[0].id);
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /limite/i.test(result.errors.join(" ")));
  });
});

describe("undoDeleteRoutine — respeita MAX_ROUTINES", () => {
  it(`rejeita desfazer quando limite de ${MAX_ROUTINES} está atingido`, () => {
    const initialState = { ...createEmptyState(), routines: Array.from({ length: MAX_ROUTINES + 1 }, (_, i) => ({ ...baseRoutine, id: `r-${i}` })) };
    const controller = makeController(initialState);
    assert.equal(controller.actions.deleteRoutine(controller.getState().routines[0].id).ok, true);
    assert.equal(controller.getState().routines.length, MAX_ROUTINES);
    const result = controller.actions.undoDeleteRoutine();
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /limite/i.test(result.errors.join(" ")));
  });
});

describe("catalog auto-creation — respeita limites", () => {
  it(`não adiciona professor além do limite de ${MAX_TEACHERS}`, () => {
    const teachers = Array.from({ length: MAX_TEACHERS }, (_, i) => ({ id: `t-${i}`, name: `Professor ${i}`, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }));
    const rooms = [{ id: "room-1", name: "6A", studentCount: null, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }];
    const controller = makeController({ ...createEmptyState(), teachers, rooms });
    const result = controller.actions.addRoutine({ ...validRoutinePayload, teacher: "Professor Novo" });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /professores/i.test(result.errors.join(" ")));
    assert.equal(controller.getState().teachers.length, MAX_TEACHERS);
  });
});

describe("markAllNotificationsAsSeen", () => {
  it("marca entradas existentes como vistas, atualiza updatedAt e remove snoozedUntil", () => {
    const existingLog = [
      { id: "notif-1", status: "pendente", date: "2026-05-25", type: "inicio", time: "08:00", routineIds: ["r1"], updatedAt: "2026-05-25T07:00:00.000Z", snoozedUntil: "08:10" },
      { id: "notif-2", status: "adiada", date: "2026-05-25", type: "inicio", time: "09:00", routineIds: ["r2"], updatedAt: "2026-05-25T08:00:00.000Z" },
    ];
    const controller = makeController({ ...createEmptyState(), notificationLog: existingLog });
    const result = controller.actions.markAllNotificationsAsSeen([
      { id: "notif-1", date: "2026-05-25", type: "inicio", time: "08:00", routineIds: ["r1"] },
      { id: "notif-2", date: "2026-05-25", type: "inicio", time: "09:00", routineIds: ["r2"] },
    ]);
    assert.equal(result.ok, true);

    const log = controller.getState().notificationLog;
    const first = log.find((e) => e.id === "notif-1");
    assert.equal(first?.status, "vista");
    assert.equal(first?.snoozedUntil, undefined);
    assert.notEqual(first?.updatedAt, "2026-05-25T07:00:00.000Z");
    assert.equal(log.find((e) => e.id === "notif-2")?.status, "vista");
  });

  it("cria entradas no log para IDs ainda sem registro", () => {
    const controller = makeController();
    assert.equal(controller.actions.markAllNotificationsAsSeen([{ id: "notif-nova", date: "2026-05-25", type: "inicio", time: "08:00", routineIds: ["r1"] }]).ok, true);
    const log = controller.getState().notificationLog;
    assert.equal(log.length, 1);
    assert.equal(log[0]?.id, "notif-nova");
    assert.equal(log[0]?.status, "vista");
    assert.equal(log[0]?.snoozedUntil, undefined);
  });

  it("retorna ok sem alterar log quando lista vazia", () => {
    const existingLog = [{ id: "notif-1", status: "pendente", date: "2026-05-25", type: "inicio", time: "08:00", routineIds: ["r1"], updatedAt: "2026-05-25T07:00:00.000Z" }];
    const controller = makeController({ ...createEmptyState(), notificationLog: existingLog });
    assert.equal(controller.actions.markAllNotificationsAsSeen([]).ok, true);
    assert.equal(controller.getState().notificationLog[0]?.status, "pendente");
  });
});

describe("recordNotificationStatus — respeita MAX_NOTIFICATION_LOG", () => {
  it(`poda o log ao exceder ${MAX_NOTIFICATION_LOG} entradas`, () => {
    const existingLog = Array.from({ length: MAX_NOTIFICATION_LOG }, (_, i) => ({ id: `notif-existing-${i}`, status: "vista", date: "2026-05-25", type: "inicio", time: "08:00", routineIds: ["r1"], updatedAt: new Date(2026, 4, 1, 0, 0, i).toISOString() }));
    const controller = makeController({ ...createEmptyState(), notificationLog: existingLog });
    controller.actions.recordNotificationStatus({ id: "notif-new", status: "pendente", date: "2026-05-25", type: "inicio", time: "09:00", routineIds: ["r2"] });
    assert.ok(controller.getState().notificationLog.length <= MAX_NOTIFICATION_LOG);
  });
});
