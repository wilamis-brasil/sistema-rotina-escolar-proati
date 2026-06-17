// @ts-check

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  areRoutineConfigsEquivalent,
  getVisibleSmartTodayRoutineGroups,
  groupEquivalentRoutines,
  isRoutineActiveNow,
  isRoutinePendingOrActive,
  mergeRoutineGroupTimes,
} from "../js/ui/routines/smart-today.js";

const baseRoutine = {
  id: "routine-1",
  weekday: "monday",
  startTime: "07:00",
  endTime: "08:00",
  subject: "Matematica",
  teacher: "Joao",
  room: "Sala 1",
  studentCount: 30,
  devices: ["Notebook"],
  notes: "",
  createdAt: "2026-05-15T10:00:00.000Z",
  updatedAt: "2026-05-15T10:00:00.000Z",
};

const routine = (overrides) => ({ ...baseRoutine, ...overrides });

describe("smart today routine helpers", () => {
  it("trata rotinas com endTime como encerradas no minuto final", () => {
    const item = routine({ startTime: "07:00", endTime: "08:00" });
    assert.equal(isRoutinePendingOrActive(item, 479), true);
    assert.equal(isRoutineActiveNow(item, 479), true);
    assert.equal(isRoutinePendingOrActive(item, 480), false);
    assert.equal(isRoutineActiveNow(item, 480), false);
  });

  it("trata rotinas sem endTime como pendentes só até o minuto de início", () => {
    const item = routine({ startTime: "07:00", endTime: "" });
    assert.equal(isRoutinePendingOrActive(item, 420), true);
    assert.equal(isRoutineActiveNow(item, 420), true);
    assert.equal(isRoutinePendingOrActive(item, 421), false);
    assert.equal(isRoutineActiveNow(item, 421), false);
  });

  it("agrupa rotinas equivalentes ignorando a ordem dos dispositivos", () => {
    const first = routine({ id: "routine-a", devices: ["Notebook", "Tablet"] });
    const second = routine({ id: "routine-b", startTime: "08:00", endTime: "09:00", devices: ["Tablet", "Notebook"] });
    const groups = groupEquivalentRoutines([first, second], 420);
    assert.equal(areRoutineConfigsEquivalent(first, second), true);
    assert.equal(groups.length, 1);
    assert.deepEqual(groups[0].routines.map((item) => item.id), ["routine-a", "routine-b"]);
  });

  it("funde intervalos contínuos dentro de um grupo equivalente", () => {
    const groups = groupEquivalentRoutines(
      [routine({ id: "routine-a", startTime: "07:00", endTime: "08:00" }), routine({ id: "routine-b", startTime: "08:00", endTime: "09:00" })],
      420,
    );
    assert.equal(groups[0].timeLabel, "07:00-09:00");
    assert.equal(mergeRoutineGroupTimes(groups[0]), "07:00-09:00");
  });

  it("mantém intervalos não contínuos separados", () => {
    const groups = groupEquivalentRoutines(
      [routine({ id: "routine-a", startTime: "07:00", endTime: "08:00" }), routine({ id: "routine-b", startTime: "10:00", endTime: "11:00" })],
      420,
    );
    assert.equal(groups[0].timeLabel, "07:00-08:00 · 10:00-11:00");
  });

  it("prioriza rotinas ativas e próximas antes de aplicar o limite de cartões", () => {
    const groups = getVisibleSmartTodayRoutineGroups(
      [
        routine({ id: "active", teacher: "A", startTime: "06:30", endTime: "07:30" }),
        routine({ id: "near-1", teacher: "B", startTime: "08:00", endTime: "09:00" }),
        routine({ id: "near-2", teacher: "C", startTime: "08:30", endTime: "09:30" }),
        routine({ id: "near-3", teacher: "D", startTime: "08:45", endTime: "09:45" }),
        routine({ id: "far", teacher: "E", startTime: "12:00", endTime: "13:00" }),
      ],
      420, 3, 120,
    );
    assert.deepEqual(groups.map((g) => g.representative.id), ["active", "near-1", "near-2"]);
  });

  it("não puxa rotinas equivalentes distantes para um grupo próximo visível", () => {
    const groups = getVisibleSmartTodayRoutineGroups(
      [
        routine({ id: "routine-a", startTime: "07:00", endTime: "08:00" }),
        routine({ id: "routine-b", startTime: "08:00", endTime: "09:00" }),
        routine({ id: "routine-c", startTime: "12:00", endTime: "13:00" }),
      ],
      420, 3, 120,
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0].timeLabel, "07:00-09:00");
    assert.deepEqual(groups[0].routines.map((item) => item.id), ["routine-a", "routine-b"]);
  });

  it("agrupa duplicatas exatas com notas iguais em um único cartão", () => {
    const groups = getVisibleSmartTodayRoutineGroups(
      [
        routine({ id: "routine-a", startTime: "07:00", endTime: "07:50", notes: "Reserva recorrente" }),
        routine({ id: "routine-duplicate", startTime: "07:00", endTime: "07:50", notes: "Reserva recorrente" }),
        routine({ id: "routine-b", startTime: "07:50", endTime: "08:40", notes: "Reserva recorrente" }),
      ],
      420, 3, 120,
    );
    assert.equal(groups.length, 1);
    assert.equal(groups[0].timeLabel, "07:00-08:40");
    assert.deepEqual(groups[0].routines.map((item) => item.id), ["routine-a", "routine-duplicate", "routine-b"]);
  });

  it("usa a próxima rotina pendente quando todas estão fora da janela", () => {
    const groups = getVisibleSmartTodayRoutineGroups([routine({ id: "far", startTime: "12:00", endTime: "13:00" })], 420, 3, 120);
    assert.deepEqual(groups.map((g) => g.representative.id), ["far"]);
  });
});
