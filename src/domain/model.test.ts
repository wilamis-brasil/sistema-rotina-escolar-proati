import { describe, expect, it } from "vitest";
import {
  buildRoutine,
  createEmptyState,
  filterRoutines,
  normalizeCatalogPayload,
  normalizeState,
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
      expect(result.errors.join(" ")).toContain("anterior");
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
