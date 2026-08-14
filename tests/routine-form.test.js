// @ts-check

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildRoomSelectOptions } from "../js/ui/routines/routine-form.js";

/** @param {string} name @param {string} [id] @returns {import("../js/domain/types.js").Room} */
function makeRoom(name, id = "1") {
  return { id, name, studentCount: null, createdAt: "", updatedAt: "" };
}

describe("buildRoomSelectOptions", () => {
  it("devolve array vazio quando não há turmas cadastradas", () => {
    assert.deepEqual(buildRoomSelectOptions([]), []);
  });

  it("devolve o nome de cada turma cadastrada", () => {
    const rooms = [makeRoom("6º ano EF - A"), makeRoom("7º ano EF - B", "2")];
    assert.deepEqual(buildRoomSelectOptions(rooms), ["6º ano EF - A", "7º ano EF - B"]);
  });

  it("não inventa combinações de ano/letra não cadastradas", () => {
    const options = buildRoomSelectOptions([makeRoom("6º ano EF - A")]);
    assert.ok(!options.includes("1º ano EF - A"));
    assert.ok(!options.includes("3º ano EM - Z"));
    assert.equal(options.length, 1);
  });

  it("devolve nomes livres de turma como estão", () => {
    const rooms = [makeRoom("Sala 12"), makeRoom("1A", "2"), makeRoom("Laboratório", "3")];
    assert.deepEqual(buildRoomSelectOptions(rooms), ["Sala 12", "1A", "Laboratório"]);
  });
});
