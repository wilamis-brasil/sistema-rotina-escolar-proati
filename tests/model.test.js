// @ts-check

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRoutine,
  createEmptyState,
  filterRoutines,
  normalizeCatalogPayload,
  normalizeState,
  sortRoutines,
} from "../js/domain/model.js";
import { MAX_DEVICES_PER_ROUTINE } from "../js/domain/limits.js";

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
  it("normaliza a aula como parte da rotina", () => {
    const result = buildRoutine({ ...validRoutinePayload, subject: "  Redação  " });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.subject, "Redação");
  });

  it("rejeita término antes do início", () => {
    const result = buildRoutine({ ...validRoutinePayload, startTime: "10:00", endTime: "09:00" });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.join(" ").includes("posterior"));
  });

  it("rejeita término igual ao início (duração zero)", () => {
    const result = buildRoutine({ ...validRoutinePayload, startTime: "10:00", endTime: "10:00" });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.errors.join(" ").includes("posterior"));
  });

  it("aceita término estritamente após o início", () => {
    const result = buildRoutine({ ...validRoutinePayload, startTime: "08:00", endTime: "08:01" });
    assert.equal(result.ok, true);
  });

  it("aceita rotina com término vazio", () => {
    const result = buildRoutine({ ...validRoutinePayload, startTime: "08:00", endTime: "" });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.endTime, "");
  });

  it("filtra rotinas pela aula", () => {
    const math = buildRoutine({ ...validRoutinePayload, subject: "Matemática" });
    const history = buildRoutine({ ...validRoutinePayload, subject: "História", startTime: "10:00", endTime: "11:00" });
    assert.ok(math.ok && history.ok);
    if (math.ok && history.ok) {
      assert.deepEqual(filterRoutines([math.value, history.value], "matemática"), [math.value]);
    }
  });

  it("ordena rotinas por aula com desempate por dia e horário", () => {
    const history = buildRoutine({ ...validRoutinePayload, subject: "História", startTime: "10:00", endTime: "11:00" });
    const math = buildRoutine({ ...validRoutinePayload, subject: "Matemática", startTime: "08:00" });
    assert.ok(history.ok && math.ok);
    if (history.ok && math.ok) {
      assert.deepEqual(
        sortRoutines([math.value, history.value], "subject").map((routine) => routine.subject),
        ["História", "Matemática"],
      );
    }
  });
});

describe("normalização do estado", () => {
  it("normaliza rotinas antigas sem aula para string vazia", () => {
    const state = normalizeState({
      schemaVersion: 2,
      routines: [{ ...validRoutinePayload, subject: undefined }],
      teachers: [],
      rooms: [],
      devices: [],
      settings: {},
    });
    assert.equal(state.routines[0]?.subject, "");
  });

  it("remove a nota legada de importação de equipamentos fixos", () => {
    const state = normalizeState({
      schemaVersion: 2,
      routines: [{ ...validRoutinePayload, notes: legacyFixedEquipmentImportNote }],
      teachers: [],
      rooms: [],
      devices: [],
      settings: {},
    });
    assert.equal(state.routines[0]?.notes, "");
  });
});

describe("normalizeCatalogPayload — turmas com nome livre", () => {
  it("aceita nomes livres", () => {
    assert.equal(normalizeCatalogPayload("rooms", { name: "Sala 12" }).ok, true);
    assert.equal(normalizeCatalogPayload("rooms", { name: "1A" }).ok, true);
    assert.equal(normalizeCatalogPayload("rooms", { name: "Laboratório" }).ok, true);
    assert.equal(normalizeCatalogPayload("rooms", { name: "6º ano EF - A" }).ok, true);
  });

  it("rejeita nome de turma vazio", () => {
    assert.equal(normalizeCatalogPayload("rooms", { name: "" }).ok, false);
  });

  it("rejeita nome de turma acima de 80 caracteres", () => {
    assert.equal(normalizeCatalogPayload("rooms", { name: "A".repeat(81) }).ok, false);
  });
});

describe("buildRoutine — limites operacionais", () => {
  it(`rejeita mais de ${MAX_DEVICES_PER_ROUTINE} dispositivos`, () => {
    const devices = Array.from({ length: MAX_DEVICES_PER_ROUTINE + 1 }, (_, i) => `Dispositivo ${i + 1}`);
    const result = buildRoutine({ ...validRoutinePayload, devices });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /máximo/i.test(result.errors.join(" ")));
  });

  it("aceita exatamente MAX_DEVICES_PER_ROUTINE dispositivos", () => {
    const devices = Array.from({ length: MAX_DEVICES_PER_ROUTINE }, (_, i) => `Dispositivo ${i + 1}`);
    assert.equal(buildRoutine({ ...validRoutinePayload, devices }).ok, true);
  });

  it("rejeita professor acima do limite (81 chars)", () => {
    const result = buildRoutine({ ...validRoutinePayload, teacher: "A".repeat(81) });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /professor/i.test(result.errors.join(" ")));
  });

  it("rejeita aula acima do limite (81 chars)", () => {
    const result = buildRoutine({ ...validRoutinePayload, subject: "A".repeat(81) });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /aula/i.test(result.errors.join(" ")));
  });

  it("rejeita observações acima do limite (501 chars)", () => {
    const result = buildRoutine({ ...validRoutinePayload, notes: "A".repeat(501) });
    assert.equal(result.ok, false);
    assert.ok(!result.ok && /observações/i.test(result.errors.join(" ")));
  });

  it("aceita professor, aula e notas dentro dos limites", () => {
    const result = buildRoutine({
      ...validRoutinePayload,
      teacher: "A".repeat(80),
      subject: "A".repeat(80),
      notes: "A".repeat(500),
    });
    assert.equal(result.ok, true);
  });
});

describe("createEmptyState", () => {
  it("não persiste letras de turma customizáveis", () => {
    const state = createEmptyState();
    assert.equal("classLetters" in state.settings, false);
  });
});

describe("normalizeState com classLetters legado", () => {
  it("ignora classLetters legado sem quebrar a importação", () => {
    const state = normalizeState({ routines: [], settings: { classLetters: ["A", "B", "C", "D"] } });
    assert.equal("classLetters" in state.settings, false);
  });

  it("preserva rotinas legadas com turma não canônica", () => {
    const state = normalizeState({ routines: [{ ...validRoutinePayload, room: "Sala 12" }], settings: {} });
    assert.equal(state.routines[0]?.room, "Sala 12");
  });

  it("preserva rotinas legadas com turma '1A'", () => {
    const state = normalizeState({ routines: [{ ...validRoutinePayload, room: "1A" }], settings: {} });
    assert.equal(state.routines[0]?.room, "1A");
  });
});

describe("compatibilidade com dados legados", () => {
  it("ignora o campo passwords legado", () => {
    const state = normalizeState({
      routines: [],
      settings: {},
      passwords: [{ id: "legacy-password", title: "Registro legado", username: "usuario-legado", secret: "valor-legado", description: "" }],
    });
    assert.equal("passwords" in state, false);
    assert.ok(!JSON.stringify(state).includes("valor-legado"));
  });
});
