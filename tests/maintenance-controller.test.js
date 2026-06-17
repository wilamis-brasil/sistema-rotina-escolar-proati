// @ts-check

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createEmptyState } from "../js/domain/model.js";
import { createMemoryStorage } from "../js/persistence/store.js";
import { createAppController } from "../js/app/controller.js";
import { IMPORT_MAX_BYTES, MAX_MAINTENANCE_BATCH } from "../js/domain/limits.js";

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

const basePayload = {
  equipmentId: "NB-014",
  type: "Notebook",
  brandModel: "Lenovo",
  location: "Sala 14",
  mainProblem: "Bateria não carrega",
  technicalDescription: "",
  priority: "media",
  status: "com-problema",
  ticketNumber: "",
  responsibleContact: "",
  actionsTaken: "",
  notes: "",
};

const makeController = () => createAppController({ initialState: createEmptyState(), storage: createMemoryStorage() });

describe("controller — manutenção", () => {
  it("adiciona, edita e exclui registros de manutenção", () => {
    const controller = makeController();
    assert.equal(controller.actions.addMaintenanceRecord(basePayload).ok, true);
    assert.equal(controller.getState().maintenanceRecords.length, 1);
    const id = controller.getState().maintenanceRecords[0].id;

    const updated = controller.actions.updateMaintenanceRecord(id, { ...basePayload, status: "chamado-aberto", ticketNumber: "SED-9999" });
    assert.equal(updated.ok, true);
    const record = controller.getState().maintenanceRecords[0];
    assert.equal(record.status, "chamado-aberto");
    assert.equal(record.ticketNumber, "SED-9999");
    assert.ok(record.history.length >= 2);

    assert.equal(controller.actions.deleteMaintenanceRecord(id).ok, true);
    assert.equal(controller.getState().maintenanceRecords.length, 0);
  });

  it("não afeta rotinas ao manipular manutenção", () => {
    const controller = makeController();
    controller.actions.addCatalogItem("rooms", { name: "6A" });
    assert.equal(controller.actions.addRoutine(validRoutinePayload).ok, true);
    assert.equal(controller.actions.addMaintenanceRecord(basePayload).ok, true);
    assert.equal(controller.getState().routines.length, 1);
    assert.equal(controller.getState().maintenanceRecords.length, 1);

    const id = controller.getState().maintenanceRecords[0].id;
    assert.equal(controller.actions.deleteMaintenanceRecord(id).ok, true);
    assert.equal(controller.getState().routines.length, 1);
  });

  it("exporta e importa manutenção sem alterar rotinas", () => {
    const source = makeController();
    assert.equal(source.actions.addMaintenanceRecord(basePayload).ok, true);
    assert.equal(source.actions.addMaintenanceRecord({ ...basePayload, equipmentId: "TAB-001" }).ok, true);
    const json = source.actions.exportMaintenanceData();

    const target = makeController();
    target.actions.addCatalogItem("rooms", { name: "6A" });
    assert.equal(target.actions.addRoutine(validRoutinePayload).ok, true);

    assert.equal(target.actions.importMaintenanceData(json).ok, true);
    assert.equal(target.getState().routines.length, 1);
    assert.equal(target.getState().maintenanceRecords.length, 2);
  });

  it(`rejeita importação de manutenção acima de ${IMPORT_MAX_BYTES} bytes`, () => {
    const controller = makeController();
    const result = controller.actions.importMaintenanceData("x".repeat(IMPORT_MAX_BYTES + 1));
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /limite/i.test(result.errors.join(" ")));
  });

  it(`rejeita lote com mais de ${MAX_MAINTENANCE_BATCH} registros`, () => {
    const controller = makeController();
    const records = Array.from({ length: MAX_MAINTENANCE_BATCH + 1 }, (_, i) => ({
      id: `maint-${i}`, equipmentId: `EQ-${i.toString().padStart(3, "0")}`, type: "Notebook", brandModel: "", location: "",
      mainProblem: "Problema", technicalDescription: "", priority: "media", status: "com-problema", ticketNumber: "",
      responsibleContact: "", actionsTaken: "", notes: "", history: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const result = controller.actions.importMaintenanceData(JSON.stringify({ maintenanceRecords: records }));
    assert.equal(result.ok, false);
    assert.ok(!result.ok && new RegExp(String(MAX_MAINTENANCE_BATCH)).test(result.errors.join(" ")));
  });

  it("rejeita identificador duplicado ao adicionar", () => {
    const controller = makeController();
    assert.equal(controller.actions.addMaintenanceRecord(basePayload).ok, true);
    const result = controller.actions.addMaintenanceRecord({ ...basePayload, equipmentId: "nb-014" });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /já existe/i.test(result.errors.join(" ")));
  });
});
