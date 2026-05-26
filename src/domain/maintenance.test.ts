import { describe, expect, it } from "vitest";
import {
  buildMaintenanceRecord,
  createEmptyState,
  describeMaintenanceChanges,
  filterMaintenance,
  normalizeState,
} from "./model";
import type { MaintenancePayload, MaintenanceRecord } from "./types";

const basePayload: MaintenancePayload = {
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

function makeRecord(overrides: Partial<MaintenanceRecord> = {}): MaintenanceRecord {
  const result = buildMaintenanceRecord(basePayload, []);
  if (!result.ok) throw new Error("Falha ao construir registro base.");
  return { ...result.value, ...overrides };
}

describe("buildMaintenanceRecord", () => {
  it("cria um registro válido a partir de um payload completo", () => {
    const result = buildMaintenanceRecord(basePayload, []);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.equipmentId).toBe("PC-001");
      expect(result.value.priority).toBe("alta");
      expect(result.value.status).toBe("com-problema");
      expect(Array.isArray(result.value.history)).toBe(true);
    }
  });

  it("rejeita identificador vazio", () => {
    const result = buildMaintenanceRecord({ ...basePayload, equipmentId: "  " }, []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/identificador/i);
    }
  });

  it("rejeita identificador duplicado sem diferenciar maiúsculas/minúsculas", () => {
    const existing = [makeRecord({ equipmentId: "PC-001" })];
    const result = buildMaintenanceRecord({ ...basePayload, equipmentId: "pc-001" }, existing);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/já existe/i);
    }
  });

  it("rejeita prioridade e status inválidos", () => {
    const result = buildMaintenanceRecord(
      { ...basePayload, equipmentId: "PC-002", priority: "x", status: "y" },
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/prioridade/i);
      expect(result.errors.join(" ")).toMatch(/status/i);
    }
  });
});

describe("normalização do estado", () => {
  it("normaliza estado antigo sem maintenanceRecords iniciando array vazio", () => {
    const state = normalizeState({
      schemaVersion: 4,
      routines: [],
      teachers: [],
      rooms: [],
      devices: [],
      passwords: [],
      settings: {},
    });
    expect(state.maintenanceRecords).toEqual([]);
  });

  it("preserva registros existentes ao normalizar", () => {
    const state = normalizeState({
      schemaVersion: 5,
      maintenanceRecords: [
        {
          id: "maintenance-1",
          equipmentId: "TAB-001",
          type: "Tablet",
          mainProblem: "Tela quebrada",
          priority: "media",
          status: "em-manutencao",
        },
      ],
    });
    expect(state.maintenanceRecords).toHaveLength(1);
    expect(state.maintenanceRecords[0]?.equipmentId).toBe("TAB-001");
  });

  it("ignora registros sem identificador e descarta duplicados", () => {
    const state = normalizeState({
      maintenanceRecords: [
        { equipmentId: "", type: "Notebook", priority: "alta", status: "com-problema", mainProblem: "x" },
        { equipmentId: "PC-1", type: "Notebook", priority: "alta", status: "com-problema", mainProblem: "x" },
        { equipmentId: "pc-1", type: "Notebook", priority: "alta", status: "com-problema", mainProblem: "x" },
      ],
    });
    expect(state.maintenanceRecords).toHaveLength(1);
    expect(state.maintenanceRecords[0]?.equipmentId).toBe("PC-1");
  });

  it("não altera o estado inicial padrão", () => {
    const empty = createEmptyState();
    expect(empty.maintenanceRecords).toEqual([]);
  });
});

describe("describeMaintenanceChanges", () => {
  it("não duplica mensagem ao mudar status para resolvido", () => {
    const previous = makeRecord({ status: "em-manutencao" });
    const next = { ...previous, status: "resolvido" as const };

    const messages = describeMaintenanceChanges(previous, next);

    const resolvidoMessages = messages.filter((m) => /resolvido/i.test(m));
    expect(resolvidoMessages).toHaveLength(1);
    expect(messages).toContain('Status alterado de "Em manutenção" para "Resolvido".');
    expect(messages).not.toContain("Marcado como resolvido.");
  });

  it("retorna mensagem genérica para mudanças de status diversas", () => {
    const previous = makeRecord({ status: "com-problema" });
    const next = { ...previous, status: "em-manutencao" as const };

    const messages = describeMaintenanceChanges(previous, next);

    expect(messages).toContain('Status alterado de "Com problema" para "Em manutenção".');
  });

  it("não gera mensagens quando nada muda", () => {
    const record = makeRecord();
    expect(describeMaintenanceChanges(record, record)).toEqual([]);
  });
});

describe("filterMaintenance", () => {
  it("filtra por identificador, problema e chamado", () => {
    const records = [
      makeRecord({ equipmentId: "PC-001", mainProblem: "Não liga", ticketNumber: "SED-123" }),
      makeRecord({ equipmentId: "TAB-010", mainProblem: "Tela quebrada", ticketNumber: "" }),
    ];

    expect(filterMaintenance(records, "tab-010")).toHaveLength(1);
    expect(filterMaintenance(records, "Tela")).toHaveLength(1);
    expect(filterMaintenance(records, "SED-123")).toHaveLength(1);
    expect(filterMaintenance(records, "")).toHaveLength(2);
  });
});
