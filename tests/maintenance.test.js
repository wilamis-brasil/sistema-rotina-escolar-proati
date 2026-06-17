// @ts-check

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMaintenanceRecord,
  createEmptyState,
  describeMaintenanceChanges,
  filterMaintenance,
  normalizeState,
} from "../js/domain/model.js";

const basePayload = {
  equipmentId: "PC-001",
  type: "Notebook",
  brandModel: "Lenovo IdeaPad",
  location: "Sala 12",
  mainProblem: "Não liga",
  technicalDescription: "Bateria possivelmente danificada",
  priority: "alta",
  status: "com-problema",
  ticketNumber: "",
  responsibleContact: "",
  actionsTaken: "",
  notes: "",
};

function makeRecord(overrides = {}) {
  const result = buildMaintenanceRecord(basePayload, []);
  if (!result.ok) throw new Error("Falha ao construir registro base.");
  return { ...result.value, ...overrides };
}

describe("buildMaintenanceRecord", () => {
  it("cria um registro válido a partir de um payload completo", () => {
    const result = buildMaintenanceRecord(basePayload, []);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.equipmentId, "PC-001");
      assert.equal(result.value.priority, "alta");
      assert.equal(result.value.status, "com-problema");
      assert.ok(Array.isArray(result.value.history));
    }
  });

  it("rejeita identificador vazio", () => {
    const result = buildMaintenanceRecord({ ...basePayload, equipmentId: "  " }, []);
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /identificador/i.test(result.errors.join(" ")));
  });

  it("rejeita identificador duplicado (case-insensitive)", () => {
    const existing = [makeRecord({ equipmentId: "PC-001" })];
    const result = buildMaintenanceRecord({ ...basePayload, equipmentId: "pc-001" }, existing);
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /já existe/i.test(result.errors.join(" ")));
  });

  it("rejeita prioridade e status inválidos", () => {
    const result = buildMaintenanceRecord({ ...basePayload, equipmentId: "PC-002", priority: "x", status: "y" }, []);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.ok(/prioridade/i.test(result.errors.join(" ")));
      assert.ok(/status/i.test(result.errors.join(" ")));
    }
  });
});

describe("normalização do estado", () => {
  it("normaliza estado antigo sem maintenanceRecords como array vazio", () => {
    const state = normalizeState({ schemaVersion: 4, routines: [], teachers: [], rooms: [], devices: [], settings: {} });
    assert.deepEqual(state.maintenanceRecords, []);
  });

  it("preserva registros existentes ao normalizar", () => {
    const state = normalizeState({
      schemaVersion: 5,
      maintenanceRecords: [
        { id: "maintenance-1", equipmentId: "TAB-001", type: "Tablet", mainProblem: "Tela quebrada", priority: "media", status: "em-manutencao" },
      ],
    });
    assert.equal(state.maintenanceRecords.length, 1);
    assert.equal(state.maintenanceRecords[0]?.equipmentId, "TAB-001");
  });

  it("ignora registros sem identificador e descarta duplicados", () => {
    const state = normalizeState({
      maintenanceRecords: [
        { equipmentId: "", type: "Notebook", priority: "alta", status: "com-problema", mainProblem: "x" },
        { equipmentId: "PC-1", type: "Notebook", priority: "alta", status: "com-problema", mainProblem: "x" },
        { equipmentId: "pc-1", type: "Notebook", priority: "alta", status: "com-problema", mainProblem: "x" },
      ],
    });
    assert.equal(state.maintenanceRecords.length, 1);
    assert.equal(state.maintenanceRecords[0]?.equipmentId, "PC-1");
  });

  it("não altera o estado inicial padrão", () => {
    assert.deepEqual(createEmptyState().maintenanceRecords, []);
  });
});

describe("describeMaintenanceChanges", () => {
  it("não duplica mensagem ao mudar status para resolvido", () => {
    const previous = makeRecord({ status: "em-manutencao" });
    const next = { ...previous, status: "resolvido" };
    const messages = describeMaintenanceChanges(previous, next);
    assert.equal(messages.filter((m) => /resolvido/i.test(m)).length, 1);
    assert.ok(messages.includes('Status alterado de "Em manutenção" para "Resolvido".'));
    assert.ok(!messages.includes("Marcado como resolvido."));
  });

  it("retorna mensagem para mudanças de status diversas", () => {
    const previous = makeRecord({ status: "com-problema" });
    const next = { ...previous, status: "em-manutencao" };
    const messages = describeMaintenanceChanges(previous, next);
    assert.ok(messages.includes('Status alterado de "Com problema" para "Em manutenção".'));
  });

  it("não gera mensagens quando nada muda", () => {
    const record = makeRecord();
    assert.deepEqual(describeMaintenanceChanges(record, record), []);
  });
});

describe("filterMaintenance", () => {
  it("filtra por identificador, problema e chamado", () => {
    const records = [
      makeRecord({ equipmentId: "PC-001", mainProblem: "Não liga", ticketNumber: "SED-123" }),
      makeRecord({ equipmentId: "TAB-010", mainProblem: "Tela quebrada", ticketNumber: "" }),
    ];
    assert.equal(filterMaintenance(records, "tab-010").length, 1);
    assert.equal(filterMaintenance(records, "Tela").length, 1);
    assert.equal(filterMaintenance(records, "SED-123").length, 1);
    assert.equal(filterMaintenance(records, "").length, 2);
  });
});
