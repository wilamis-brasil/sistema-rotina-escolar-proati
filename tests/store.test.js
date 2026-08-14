// @ts-check

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage, exportState, importStateFromText, loadState } from "../js/persistence/store.js";
import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from "../js/domain/types.js";

const LEGACY_KEY = LEGACY_STORAGE_KEYS[0];

/** @param {Record<string, string>} [initial] */
function memoryStorageWithSnapshot(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    snapshot: () => new Map(values),
  };
}

describe("loadState — quarentena de dados corrompidos", () => {
  it("move blob inválido na chave atual para quarentena e retorna estado limpo", () => {
    const corrupted = "{ this is not valid json";
    const storage = memoryStorageWithSnapshot({ [STORAGE_KEY]: corrupted });

    const state = loadState(storage);
    assert.deepEqual(state.routines, []);

    const keys = [...storage.snapshot().keys()];
    assert.ok(!keys.includes(STORAGE_KEY));
    const quarantineKey = keys.find((k) => k.startsWith(`${STORAGE_KEY}-corrupted-`));
    assert.notEqual(quarantineKey, undefined);
    assert.equal(storage.getItem(/** @type {string} */ (quarantineKey)), corrupted);
  });

  it("move blob inválido na chave legada para quarentena e retorna estado limpo", () => {
    const corrupted = "lixo-binario";
    const storage = memoryStorageWithSnapshot({ [LEGACY_KEY]: corrupted });

    const state = loadState(storage);
    assert.deepEqual(state.routines, []);

    const keys = [...storage.snapshot().keys()];
    assert.ok(!keys.includes(LEGACY_KEY));
    const quarantineKey = keys.find((k) => k.startsWith(`${LEGACY_KEY}-corrupted-`));
    assert.notEqual(quarantineKey, undefined);
    assert.equal(storage.getItem(/** @type {string} */ (quarantineKey)), corrupted);
  });

  it("não explode se a quarentena falhar (setItem joga)", () => {
    const corrupted = "{ broken";
    let setItemCalls = 0;
    const storage = {
      getItem: (key) => (key === STORAGE_KEY ? corrupted : null),
      setItem: () => {
        setItemCalls += 1;
        throw new Error("QuotaExceeded simulado");
      },
      removeItem: () => {},
    };

    assert.doesNotThrow(() => loadState(storage));
    assert.deepEqual(loadState(storage).routines, []);
    assert.ok(setItemCalls > 0);
  });

  it("não explode se getItem joga", () => {
    const storage = {
      getItem: () => {
        throw new Error("storage indisponível");
      },
      setItem: () => {},
      removeItem: () => {},
    };
    assert.doesNotThrow(() => loadState(storage));
    assert.deepEqual(loadState(storage).routines, []);
  });

  it("carrega normalmente quando o JSON é válido", () => {
    const validState = JSON.stringify({
      schemaVersion: 8,
      routines: [],
      teachers: [],
      rooms: [],
      devices: [],
      maintenanceRecords: [],
      notificationLog: [],
      settings: { sortBy: "weekday-time", filterText: "" },
      meta: { createdAt: "2026-05-25T00:00:00.000Z", updatedAt: "2026-05-25T00:00:00.000Z" },
    });
    const storage = createMemoryStorage({ [STORAGE_KEY]: validState });
    assert.deepEqual(loadState(storage).routines, []);
  });

  it("descarta passwords legado ao importar e não exporta esse campo", () => {
    const result = importStateFromText(
      JSON.stringify({
        schemaVersion: 7,
        routines: [],
        teachers: [],
        rooms: [],
        devices: [],
        passwords: [{ id: "legacy-password", title: "Registro legado", username: "usuario-legado", secret: "valor-legado", description: "" }],
        maintenanceRecords: [],
        notificationLog: [],
        settings: {},
      }),
    );
    assert.equal(result.ok, true);
    if (result.ok) {
      const exported = exportState(result.value);
      assert.equal("passwords" in result.value, false);
      assert.ok(!exported.includes("passwords"));
      assert.ok(!exported.includes("valor-legado"));
    }
  });

  it("retorna estado novo quando não há nada no storage", () => {
    assert.deepEqual(loadState(createMemoryStorage()).routines, []);
  });
});
