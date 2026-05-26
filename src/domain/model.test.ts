import { describe, expect, it } from "vitest";
import {
  buildRoutine,
  createEmptyState,
  filterRoutines,
  normalizeCatalogPayload,
  normalizeState,
  removeLegacySeedPasswords,
  sortRoutines,
} from "./model";
import { MAX_DEVICES_PER_ROUTINE } from "./limits";

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
};

const legacyFixedEquipmentImportNote = [
  73, 109, 112, 111, 114, 116, 97, 100, 111, 32, 100, 97, 32, 102, 111, 108, 104, 97, 32, 100, 101,
  32, 114, 101, 115, 101, 114, 118, 97, 32, 100, 101, 32, 101, 113, 117, 105, 112, 97, 109, 101,
  110, 116, 111, 115, 32, 101, 108, 101, 116, 114, 244, 110, 105, 99, 111, 115, 32, 102, 105, 120,
  111, 115, 46,
]
  .map((code) => String.fromCharCode(code))
  .join("");

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
      expect(result.errors.join(" ")).toContain("posterior");
    }
  });

  it("rejects an end time equal to the start time (zero duration)", () => {
    const result = buildRoutine({
      ...validRoutinePayload,
      startTime: "10:00",
      endTime: "10:00",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toContain("posterior");
    }
  });

  it("accepts an end time strictly after the start time", () => {
    const result = buildRoutine({
      ...validRoutinePayload,
      startTime: "08:00",
      endTime: "08:01",
    });

    expect(result.ok).toBe(true);
  });

  it("accepts a routine with empty end time", () => {
    const result = buildRoutine({
      ...validRoutinePayload,
      startTime: "08:00",
      endTime: "",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.endTime).toBe("");
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

describe("state normalization", () => {
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

  it("removes the legacy fixed-equipment import note from existing routines", () => {
    const state = normalizeState({
      schemaVersion: 2,
      routines: [
        {
          ...validRoutinePayload,
          notes: legacyFixedEquipmentImportNote,
        },
      ],
      teachers: [],
      rooms: [],
      devices: [],
      settings: {},
    });

    expect(state.routines[0]?.notes).toBe("");
  });
});

describe("normalizeCatalogPayload — turmas com nome livre", () => {
  it("aceita nomes livres como 'Sala 12', '1A', 'Laboratório'", () => {
    expect(normalizeCatalogPayload("rooms", { name: "Sala 12" }).ok).toBe(true);
    expect(normalizeCatalogPayload("rooms", { name: "1A" }).ok).toBe(true);
    expect(normalizeCatalogPayload("rooms", { name: "Laboratório" }).ok).toBe(true);
    expect(normalizeCatalogPayload("rooms", { name: "6º ano EF - A" }).ok).toBe(true);
  });

  it("rejeita nome de turma vazio", () => {
    const result = normalizeCatalogPayload("rooms", { name: "" });
    expect(result.ok).toBe(false);
  });

  it("rejeita nome de turma acima de 80 caracteres", () => {
    const result = normalizeCatalogPayload("rooms", { name: "A".repeat(81) });
    expect(result.ok).toBe(false);
  });
});

describe("buildRoutine — limites operacionais", () => {
  it(`rejeita mais de ${MAX_DEVICES_PER_ROUTINE} dispositivos`, () => {
    const devices = Array.from({ length: MAX_DEVICES_PER_ROUTINE + 1 }, (_, i) => `Dispositivo ${i + 1}`);
    const result = buildRoutine({ ...validRoutinePayload, devices });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/máximo/i);
    }
  });

  it("aceita exatamente MAX_DEVICES_PER_ROUTINE dispositivos", () => {
    const devices = Array.from({ length: MAX_DEVICES_PER_ROUTINE }, (_, i) => `Dispositivo ${i + 1}`);
    const result = buildRoutine({ ...validRoutinePayload, devices });
    expect(result.ok).toBe(true);
  });

  it("rejeita professor acima do limite de texto (81 chars)", () => {
    const result = buildRoutine({ ...validRoutinePayload, teacher: "A".repeat(81) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/professor/i);
    }
  });

  it("rejeita aula acima do limite de texto (81 chars)", () => {
    const result = buildRoutine({ ...validRoutinePayload, subject: "A".repeat(81) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/aula/i);
    }
  });

  it("rejeita observações acima do limite de texto (501 chars)", () => {
    const result = buildRoutine({ ...validRoutinePayload, notes: "A".repeat(501) });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(" ")).toMatch(/observações/i);
    }
  });

  it("aceita professor, aula e notas dentro dos limites", () => {
    const result = buildRoutine({
      ...validRoutinePayload,
      teacher: "A".repeat(80),
      subject: "A".repeat(80),
      notes: "A".repeat(500),
    });
    expect(result.ok).toBe(true);
  });
});

describe("createEmptyState", () => {
  it("does not persist customizable class letters", () => {
    const state = createEmptyState();
    expect("classLetters" in state.settings).toBe(false);
  });
});

describe("normalizeState with classLetters", () => {
  it("ignores legacy saved classLetters without breaking import", () => {
    const state = normalizeState({ routines: [], settings: { classLetters: ["A", "B", "C", "D"] } });
    expect("classLetters" in state.settings).toBe(false);
  });

  it("preserves legacy routines with non-canonical room during import", () => {
    const state = normalizeState({
      routines: [{ ...validRoutinePayload, room: "Sala 12" }],
      settings: {},
    });
    expect(state.routines[0]?.room).toBe("Sala 12");
  });

  it("preserves legacy routines with legacy '1A' room during import", () => {
    const state = normalizeState({
      routines: [{ ...validRoutinePayload, room: "1A" }],
      settings: {},
    });
    expect(state.routines[0]?.room).toBe("1A");
  });
});

describe("senhas — remoção de seeds legados", () => {
  // IDs que existiam como seeds hardcoded em versões anteriores
  const legacySeedIds = [
    "password-netbook-positivo-multilaser-sala",
    "password-netbook-multilaser-m11w-formatacao",
    "password-imagem-instalacao",
    "password-lenovo-multilaser-ultra-administrador",
    "password-lenovo-multilaser-ultra-proatec",
    "password-tablet-positivo-quiosque",
  ];

  it("createEmptyState retorna passwords vazio", () => {
    const state = createEmptyState();
    expect(state.passwords).toEqual([]);
  });

  it("normalizeState sem passwords retorna passwords vazio", () => {
    const state = normalizeState({ routines: [], settings: {} });
    expect(state.passwords).toEqual([]);
  });

  it("normalizeState com lista de passwords vazia retorna passwords vazio", () => {
    const state = normalizeState({ routines: [], settings: {}, passwords: [] });
    expect(state.passwords).toEqual([]);
  });

  it("removeLegacySeedPasswords filtra todos os IDs legados", () => {
    const legacyRecords = legacySeedIds.map((id) => ({
      id,
      title: "Legado",
      username: "",
      secret: "x",
      description: "",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    }));
    expect(removeLegacySeedPasswords(legacyRecords)).toEqual([]);
  });

  it("removeLegacySeedPasswords preserva senhas manuais com ID diferente", () => {
    const manual = {
      id: "password-manual-usuario",
      title: "Senha Manual",
      username: "admin",
      secret: "segredo",
      description: "",
      createdAt: "2025-01-01T00:00:00.000Z",
      updatedAt: "2025-01-01T00:00:00.000Z",
    };
    const legacy = {
      id: legacySeedIds[0]!,
      title: "Legado",
      username: "",
      secret: "x",
      description: "",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    };
    const result = removeLegacySeedPasswords([manual, legacy]);
    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("password-manual-usuario");
  });

  it("normalizeState com IDs legados remove todos eles silenciosamente", () => {
    const legacyRecords = legacySeedIds.map((id) => ({
      id,
      title: "Legado",
      username: "",
      secret: "x",
      description: "",
      createdAt: "2024-01-01T00:00:00.000Z",
      updatedAt: "2024-01-01T00:00:00.000Z",
    }));
    const state = normalizeState({ routines: [], settings: {}, passwords: legacyRecords });
    expect(state.passwords).toEqual([]);
  });

  it("normalizeState preserva senha manual mesmo que haja IDs legados na lista", () => {
    const records = [
      {
        id: "password-manual-equipe",
        title: "Cofre Equipe",
        username: "equipe",
        secret: "senha-manual",
        description: "",
        createdAt: "2025-06-01T00:00:00.000Z",
        updatedAt: "2025-06-01T00:00:00.000Z",
      },
      ...legacySeedIds.map((id) => ({
        id,
        title: "Legado",
        username: "",
        secret: "x",
        description: "",
        createdAt: "2024-01-01T00:00:00.000Z",
        updatedAt: "2024-01-01T00:00:00.000Z",
      })),
    ];
    const state = normalizeState({ routines: [], settings: {}, passwords: records });
    expect(state.passwords).toHaveLength(1);
    expect(state.passwords[0]?.id).toBe("password-manual-equipe");
  });
});
