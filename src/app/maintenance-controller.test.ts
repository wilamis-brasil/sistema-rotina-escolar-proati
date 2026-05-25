import { describe, expect, it } from "vitest";
import { createEmptyState } from "../domain/model";
import type { MaintenancePayload } from "../domain/types";
import { createMemoryStorage } from "../persistence/store";
import { createAppController } from "./controller";

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

const basePayload: MaintenancePayload = {
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

describe("controller — manutenção", () => {
  it("adiciona, edita e exclui registros de manutenção", () => {
    const controller = createAppController({
      initialState: createEmptyState(),
      storage: createMemoryStorage(),
    });

    expect(controller.actions.addMaintenanceRecord(basePayload).ok).toBe(true);
    expect(controller.getState().maintenanceRecords).toHaveLength(1);
    const id = controller.getState().maintenanceRecords[0]!.id;

    const updated = controller.actions.updateMaintenanceRecord(id, {
      ...basePayload,
      status: "chamado-aberto",
      ticketNumber: "SED-9999",
    });
    expect(updated.ok).toBe(true);
    const record = controller.getState().maintenanceRecords[0]!;
    expect(record.status).toBe("chamado-aberto");
    expect(record.ticketNumber).toBe("SED-9999");
    expect(record.history.length).toBeGreaterThanOrEqual(2);

    expect(controller.actions.deleteMaintenanceRecord(id).ok).toBe(true);
    expect(controller.getState().maintenanceRecords).toHaveLength(0);
  });

  it("não afeta rotinas ao manipular manutenção", () => {
    const controller = createAppController({
      initialState: createEmptyState(),
      storage: createMemoryStorage(),
    });
    expect(controller.actions.addRoutine(validRoutinePayload).ok).toBe(true);
    expect(controller.actions.addMaintenanceRecord(basePayload).ok).toBe(true);

    expect(controller.getState().routines).toHaveLength(1);
    expect(controller.getState().maintenanceRecords).toHaveLength(1);

    const id = controller.getState().maintenanceRecords[0]!.id;
    expect(controller.actions.deleteMaintenanceRecord(id).ok).toBe(true);
    expect(controller.getState().routines).toHaveLength(1);
  });

  it("exporta e importa manutenção sem alterar rotinas", () => {
    const source = createAppController({
      initialState: createEmptyState(),
      storage: createMemoryStorage(),
    });
    expect(source.actions.addMaintenanceRecord(basePayload).ok).toBe(true);
    expect(source.actions.addMaintenanceRecord({ ...basePayload, equipmentId: "TAB-001" }).ok).toBe(true);
    const json = source.actions.exportMaintenanceData();

    const target = createAppController({
      initialState: createEmptyState(),
      storage: createMemoryStorage(),
    });
    expect(target.actions.addRoutine(validRoutinePayload).ok).toBe(true);

    const importResult = target.actions.importMaintenanceData(json);
    expect(importResult.ok).toBe(true);
    expect(target.getState().routines).toHaveLength(1);
    expect(target.getState().maintenanceRecords).toHaveLength(2);
  });

  it("rejeita identificador duplicado ao adicionar", () => {
    const controller = createAppController({
      initialState: createEmptyState(),
      storage: createMemoryStorage(),
    });

    expect(controller.actions.addMaintenanceRecord(basePayload).ok).toBe(true);
    const result = controller.actions.addMaintenanceRecord({ ...basePayload, equipmentId: "nb-014" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/já existe/i);
    }
  });
});
