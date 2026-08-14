// @ts-check

import { failure } from "../domain/errors.js";
import {
  createEmptyState,
  migrateState,
  nowIso,
  pruneNotificationLog,
  validateImportedMaintenanceLimits,
  validateImportedStateLimits,
} from "../domain/model.js";
import {
  IMPORT_MAX_BYTES,
  MAX_CLASSES,
  MAX_DEVICES,
  MAX_MAINTENANCE_BATCH,
  MAX_MAINTENANCES,
  MAX_NOTIFICATION_LOG,
  MAX_ROUTINES,
  MAX_TEACHERS,
} from "../domain/limits.js";
import { LEGACY_STORAGE_KEYS, STORAGE_KEY } from "../domain/types.js";

/** @typedef {import("../domain/types.js").AppState} AppState */
/** @typedef {import("../domain/types.js").EmptyResult} EmptyResult */
/** @typedef {import("../domain/types.js").MaintenanceRecord} MaintenanceRecord */
/** @typedef {import("../domain/types.js").StorageAdapter} StorageAdapter */
/** @template T @typedef {import("../domain/types.js").Result<T>} Result */

/** @returns {StorageAdapter} */
function browserStorage() {
  return window.localStorage;
}

/**
 * @param {StorageAdapter} storage
 * @param {string} key
 * @param {string} raw
 */
function quarantineCorruptedKey(storage, key, raw) {
  try {
    storage.setItem(`${key}-corrupted-${nowIso()}`, raw);
    storage.removeItem(key);
  } catch (innerError) {
    console.error("Falha ao quarentenar dados corrompidos.", innerError);
  }
}

/**
 * Migra e persiste um blob lido do storage; usado tanto para a chave atual
 * quanto para chaves legadas. Devolve null se o JSON for inválido.
 * @param {StorageAdapter} storage
 * @param {string} raw
 * @returns {AppState | null}
 */
function migrateAndPersist(storage, raw, { removeKey } = {}) {
  let migrated;
  try {
    migrated = migrateState(JSON.parse(raw));
  } catch {
    return null;
  }
  if (migrated.notificationLog.length > MAX_NOTIFICATION_LOG) {
    migrated.notificationLog = pruneNotificationLog(migrated.notificationLog);
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
    if (removeKey && removeKey !== STORAGE_KEY) {
      storage.removeItem(removeKey);
    }
  } catch (persistError) {
    console.error("Falha ao atualizar dados locais migrados.", persistError);
  }
  return migrated;
}

/**
 * Carrega o estado do localStorage, migrando da chave atual ou de chaves
 * legadas e movendo dados corrompidos para quarentena.
 * @param {StorageAdapter} [storage]
 * @returns {AppState}
 */
export function loadState(storage = browserStorage()) {
  let currentRaw = null;
  try {
    currentRaw = storage.getItem(STORAGE_KEY);
  } catch (readError) {
    console.error("Falha ao acessar armazenamento local.", readError);
    return createEmptyState();
  }

  if (currentRaw) {
    const migrated = migrateAndPersist(storage, currentRaw);
    if (migrated) return migrated;
    console.error("Dados locais corrompidos ou incompatíveis. Movendo para quarentena.");
    quarantineCorruptedKey(storage, STORAGE_KEY, currentRaw);
    return createEmptyState();
  }

  for (const legacyKey of LEGACY_STORAGE_KEYS) {
    let legacyRaw = null;
    try {
      legacyRaw = storage.getItem(legacyKey);
    } catch (readError) {
      console.error("Falha ao acessar chave legada.", readError);
      continue;
    }
    if (!legacyRaw) continue;

    const migrated = migrateAndPersist(storage, legacyRaw, { removeKey: legacyKey });
    if (migrated) return migrated;
    console.error("Dados legados corrompidos ou incompatíveis. Movendo para quarentena.");
    quarantineCorruptedKey(storage, legacyKey, legacyRaw);
    return createEmptyState();
  }

  return createEmptyState();
}

/**
 * Projeção canônica do estado para persistência/exportação: lista explícita de
 * campos, evitando vazar chaves legadas ou desconhecidas. A ordem das chaves faz
 * parte do formato dos backups e deve ser preservada.
 * @param {AppState} state
 * @returns {AppState}
 */
function pickPersistedState(state) {
  return {
    schemaVersion: state.schemaVersion,
    routines: state.routines,
    teachers: state.teachers,
    rooms: state.rooms,
    devices: state.devices,
    maintenanceRecords: state.maintenanceRecords,
    notificationLog: state.notificationLog,
    settings: state.settings,
    meta: state.meta,
  };
}

/**
 * Persiste o estado, atualizando o carimbo de tempo. Devolve o estado salvo.
 * @param {AppState} state
 * @param {StorageAdapter} [storage]
 * @returns {EmptyResult & { state?: AppState }}
 */
export function saveState(state, storage = browserStorage()) {
  try {
    /** @type {AppState} */
    const nextState = { ...pickPersistedState(state), meta: { ...state.meta, updatedAt: nowIso() } };
    storage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    return { ok: true, state: nextState };
  } catch (error) {
    console.error("Falha ao salvar dados locais.", error);
    return {
      ok: false,
      errors: ["Não foi possível salvar os dados locais. Verifique o espaço disponível no navegador ou as permissões do site."],
    };
  }
}

/**
 * Serializa o estado completo como JSON legível, com carimbo de exportação.
 * @param {AppState} state
 * @returns {string}
 */
export function exportState(state) {
  return JSON.stringify({ ...pickPersistedState(state), exportedAt: nowIso() }, null, 2);
}

/** @param {number} bytes @returns {string} */
function megabytes(bytes) {
  return String(bytes / 1_048_576);
}

/**
 * Mensagem de erro quando o texto de backup excede o limite, ou null.
 * @param {string} rawText
 * @returns {string | null}
 */
function importSizeError(rawText) {
  return rawText.length > IMPORT_MAX_BYTES
    ? `O backup excede o limite de ${megabytes(IMPORT_MAX_BYTES)} MB permitido para importação.`
    : null;
}

/**
 * Importa e valida um backup completo de estado.
 * @param {string} rawText
 * @returns {Result<AppState>}
 */
export function importStateFromText(rawText) {
  const sizeError = importSizeError(rawText);
  if (sizeError) return { ok: false, errors: [sizeError] };
  try {
    const state = migrateState(JSON.parse(rawText));

    const fieldErrors = validateImportedStateLimits(state);
    if (fieldErrors.length > 0) {
      return { ok: false, errors: fieldErrors };
    }

    /** @type {Array<[number, number, string]>} */
    const collectionLimits = [
      [state.routines.length, MAX_ROUTINES, "rotinas"],
      [state.teachers.length, MAX_TEACHERS, "professores"],
      [state.rooms.length, MAX_CLASSES, "turmas"],
      [state.devices.length, MAX_DEVICES, "equipamentos"],
      [state.maintenanceRecords.length, MAX_MAINTENANCES, "manutenções"],
    ];
    for (const [count, max, label] of collectionLimits) {
      if (count > max) {
        return { ok: false, errors: [`O backup tem ${label} demais (máximo: ${max}).`] };
      }
    }

    return { ok: true, value: state };
  } catch (error) {
    return { ok: false, errors: [`Backup JSON inválido ou incompatível: ${describeError(error)}`] };
  }
}

/**
 * Importa apenas registros de manutenção (de um backup completo ou de um array).
 * @param {string} rawText
 * @returns {Result<MaintenanceRecord[]>}
 */
export function importMaintenanceFromText(rawText) {
  const sizeError = importSizeError(rawText);
  if (sizeError) return { ok: false, errors: [sizeError] };
  try {
    const parsed = JSON.parse(rawText);
    const records =
      parsed && typeof parsed === "object" && Array.isArray(parsed.maintenanceRecords)
        ? parsed.maintenanceRecords
        : Array.isArray(parsed)
          ? parsed
          : null;
    if (!records) {
      return { ok: false, errors: ["Backup inválido: nenhuma manutenção encontrada no arquivo selecionado."] };
    }

    const migrated = migrateState({ maintenanceRecords: records });
    if (migrated.maintenanceRecords.length > MAX_MAINTENANCE_BATCH) {
      return {
        ok: false,
        errors: [`O backup contém ${migrated.maintenanceRecords.length} manutenções. O limite por importação é ${MAX_MAINTENANCE_BATCH}.`],
      };
    }

    const fieldErrors = validateImportedMaintenanceLimits(migrated.maintenanceRecords);
    if (fieldErrors.length > 0) {
      return { ok: false, errors: fieldErrors };
    }

    return { ok: true, value: migrated.maintenanceRecords };
  } catch (error) {
    return { ok: false, errors: [`Backup JSON inválido ou incompatível: ${describeError(error)}`] };
  }
}

/**
 * @param {StorageAdapter} [storage]
 * @returns {EmptyResult}
 */
export function clearStoredState(storage = browserStorage()) {
  try {
    storage.removeItem(STORAGE_KEY);
    for (const key of LEGACY_STORAGE_KEYS) {
      storage.removeItem(key);
    }
    return { ok: true };
  } catch {
    return failure("Não foi possível apagar os dados locais. Verifique as permissões do navegador e tente novamente.");
  }
}

/**
 * Adaptador de storage em memória — útil para testes e ambientes sem localStorage.
 * @param {Record<string, string>} [initial]
 * @returns {StorageAdapter}
 */
export function createMemoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

/** @param {unknown} error @returns {string} */
function describeError(error) {
  return error instanceof Error ? error.message : String(error);
}
