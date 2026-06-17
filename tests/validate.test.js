// @ts-check

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { isPlainObject, parseStateCandidate } from "../js/domain/validate.js";

describe("isPlainObject", () => {
  it("aceita objetos simples", () => {
    assert.equal(isPlainObject({}), true);
    assert.equal(isPlainObject({ routines: [] }), true);
  });

  it("rejeita null, arrays e primitivos", () => {
    assert.equal(isPlainObject(null), false);
    assert.equal(isPlainObject([]), false);
    assert.equal(isPlainObject("texto"), false);
    assert.equal(isPlainObject(42), false);
    assert.equal(isPlainObject(undefined), false);
  });
});

describe("parseStateCandidate", () => {
  it("devolve o próprio objeto quando válido", () => {
    const candidate = { routines: [], settings: {} };
    assert.equal(parseStateCandidate(candidate), candidate);
  });

  it("aceita coleções ausentes (campos opcionais)", () => {
    assert.doesNotThrow(() => parseStateCandidate({ settings: {} }));
  });

  it("rejeita candidatos que não são objetos simples", () => {
    assert.throws(() => parseStateCandidate(null), /inválido/i);
    assert.throws(() => parseStateCandidate([]), /inválido/i);
    assert.throws(() => parseStateCandidate("x"), /inválido/i);
  });

  it("rejeita quando uma coleção conhecida não é array", () => {
    assert.throws(() => parseStateCandidate({ routines: {} }), /inválido/i);
    assert.throws(() => parseStateCandidate({ teachers: "x" }), /inválido/i);
  });
});
