import { describe, expect, it } from "vitest";
import { createMemoryStorage, loadState } from "./store";
import { LEGACY_STORAGE_KEYS, STORAGE_KEY, type StorageAdapter } from "../domain/types";

const LEGACY_KEY = LEGACY_STORAGE_KEYS[0];

function listKeys(storage: { snapshot: () => Map<string, string> }): string[] {
  return [...storage.snapshot().keys()];
}

function memoryStorageWithSnapshot(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const adapter: StorageAdapter & { snapshot: () => Map<string, string> } = {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
    snapshot() {
      return new Map(values);
    },
  };
  return adapter;
}

describe("loadState — quarentena de dados corrompidos", () => {
  it("move blob inválido na chave atual para chave de quarentena e retorna estado limpo", () => {
    const corrupted = "{ this is not valid json";
    const storage = memoryStorageWithSnapshot({ [STORAGE_KEY]: corrupted });

    const { state, notice } = loadState(storage);

    expect(state.routines).toEqual([]);
    expect(notice).toMatch(/quarentena/i);

    const keys = listKeys(storage);
    expect(keys).not.toContain(STORAGE_KEY);

    const quarantineKey = keys.find((k) => k.startsWith(`${STORAGE_KEY}-corrupted-`));
    expect(quarantineKey).toBeDefined();
    expect(storage.getItem(quarantineKey!)).toBe(corrupted);
  });

  it("move blob inválido na chave legada para chave de quarentena e retorna estado limpo", () => {
    const corrupted = "lixo-binario";
    const storage = memoryStorageWithSnapshot({ [LEGACY_KEY]: corrupted });

    const { state, notice } = loadState(storage);

    expect(state.routines).toEqual([]);
    expect(notice).toMatch(/quarentena/i);

    const keys = listKeys(storage);
    expect(keys).not.toContain(LEGACY_KEY);

    const quarantineKey = keys.find((k) => k.startsWith(`${LEGACY_KEY}-corrupted-`));
    expect(quarantineKey).toBeDefined();
    expect(storage.getItem(quarantineKey!)).toBe(corrupted);
  });

  it("não explode o app se a quarentena falhar (setItem joga)", () => {
    const corrupted = "{ broken";
    let setItemCalls = 0;
    const storage: StorageAdapter = {
      getItem(key) {
        if (key === STORAGE_KEY) return corrupted;
        return null;
      },
      setItem() {
        setItemCalls += 1;
        throw new Error("QuotaExceeded simulado");
      },
      removeItem() {
        // no-op
      },
    };

    expect(() => loadState(storage)).not.toThrow();
    const { state, notice } = loadState(storage);
    expect(state.routines).toEqual([]);
    expect(notice).toMatch(/quarentena/i);
    expect(setItemCalls).toBeGreaterThan(0);
  });

  it("não explode o app se getItem joga", () => {
    const storage: StorageAdapter = {
      getItem() {
        throw new Error("storage indisponível");
      },
      setItem() {
        // no-op
      },
      removeItem() {
        // no-op
      },
    };

    expect(() => loadState(storage)).not.toThrow();
    const { state, notice } = loadState(storage);
    expect(state.routines).toEqual([]);
    expect(notice).toMatch(/não foi possível|estado limpo/i);
  });

  it("carrega normalmente quando o JSON é válido", () => {
    const validState = JSON.stringify({
      schemaVersion: 7,
      routines: [],
      teachers: [],
      rooms: [],
      devices: [],
      passwords: [],
      maintenanceRecords: [],
      notificationLog: [],
      settings: { sortBy: "weekday-time", filterText: "" },
      meta: { createdAt: "2026-05-25T00:00:00.000Z", updatedAt: "2026-05-25T00:00:00.000Z" },
    });
    const storage = createMemoryStorage({ [STORAGE_KEY]: validState });

    const { state, notice } = loadState(storage);
    expect(state.routines).toEqual([]);
    expect(notice).toMatch(/carregados/i);
  });

  it("retorna estado novo quando não há nada no storage", () => {
    const storage = createMemoryStorage();
    const { state, notice } = loadState(storage);
    expect(state.routines).toEqual([]);
    expect(notice).toMatch(/novo armazenamento/i);
  });
});
