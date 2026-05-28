import { failure } from "../domain/errors";
import {
  createEmptyState,
  migrateState,
  nowIso,
  pruneNotificationLog,
  validateImportedStateLimits,
  validateImportedMaintenanceLimits,
} from "../domain/model";
import {
  IMPORT_MAX_BYTES,
  MAX_NOTIFICATION_LOG,
  MAX_ROUTINES,
  MAX_TEACHERS,
  MAX_CLASSES,
  MAX_DEVICES,
  MAX_MAINTENANCES,
  MAX_MAINTENANCE_BATCH,
} from "../domain/limits";
import {
  LEGACY_STORAGE_KEYS,
  STORAGE_KEY,
  type AppState,
  type EmptyResult,
  type MaintenanceRecord,
  type Result,
  type StorageAdapter,
} from "../domain/types";

function browserStorage(): StorageAdapter {
  return window.localStorage;
}

function quarantineCorruptedKey(storage: StorageAdapter, key: string, raw: string): void {
  try {
    const quarantineKey = `${key}-corrupted-${nowIso()}`;
    storage.setItem(quarantineKey, raw);
    storage.removeItem(key);
  } catch (innerError) {
    console.error("Falha ao quarentenar dados corrompidos.", innerError);
  }
}

export function loadState(storage: StorageAdapter = browserStorage()): AppState {
  let currentRaw: string | null = null;
  try {
    currentRaw = storage.getItem(STORAGE_KEY);
  } catch (readError) {
    console.error("Falha ao acessar armazenamento local.", readError);
    return createEmptyState();
  }

  if (currentRaw) {
    try {
      const migrated = migrateState(JSON.parse(currentRaw));
      if (migrated.notificationLog.length > MAX_NOTIFICATION_LOG) {
        migrated.notificationLog = pruneNotificationLog(migrated.notificationLog);
      }
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      } catch (persistError) {
        console.error("Falha ao atualizar dados locais migrados.", persistError);
      }
      return migrated;
    } catch (parseError) {
      console.error("Dados locais corrompidos ou incompatíveis. Movendo para quarentena.", parseError);
      quarantineCorruptedKey(storage, STORAGE_KEY, currentRaw);
      return createEmptyState();
    }
  }

  for (const legacyKey of LEGACY_STORAGE_KEYS) {
    let legacyRaw: string | null = null;
    try {
      legacyRaw = storage.getItem(legacyKey);
    } catch (readError) {
      console.error("Falha ao acessar chave legada.", readError);
      continue;
    }
    if (!legacyRaw) continue;

    try {
      const migrated = migrateState(JSON.parse(legacyRaw));
      if (migrated.notificationLog.length > MAX_NOTIFICATION_LOG) {
        migrated.notificationLog = pruneNotificationLog(migrated.notificationLog);
      }
      try {
        storage.setItem(STORAGE_KEY, JSON.stringify(migrated));
        storage.removeItem(legacyKey);
      } catch (persistError) {
        console.error("Falha ao migrar dados locais para nova chave.", persistError);
      }
      return migrated;
    } catch (parseError) {
      console.error("Dados legados corrompidos ou incompatíveis. Movendo para quarentena.", parseError);
      quarantineCorruptedKey(storage, legacyKey, legacyRaw);
      return createEmptyState();
    }
  }

  return createEmptyState();
}

export function saveState(
  state: AppState,
  storage: StorageAdapter = browserStorage(),
): EmptyResult & { state?: AppState } {
  try {
    const nextState: AppState = {
      schemaVersion: state.schemaVersion,
      routines: state.routines,
      teachers: state.teachers,
      rooms: state.rooms,
      devices: state.devices,
      maintenanceRecords: state.maintenanceRecords,
      notificationLog: state.notificationLog,
      settings: state.settings,
      meta: {
        ...state.meta,
        updatedAt: nowIso(),
      },
    };
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

export function exportState(state: AppState): string {
  return JSON.stringify(
    {
      schemaVersion: state.schemaVersion,
      routines: state.routines,
      teachers: state.teachers,
      rooms: state.rooms,
      devices: state.devices,
      maintenanceRecords: state.maintenanceRecords,
      notificationLog: state.notificationLog,
      settings: state.settings,
      meta: state.meta,
      exportedAt: nowIso(),
    },
    null,
    2,
  );
}

export function importStateFromText(rawText: string): Result<AppState> {
  if (rawText.length > IMPORT_MAX_BYTES) {
    return { ok: false, errors: [`O backup excede o limite de ${IMPORT_MAX_BYTES / 1_048_576} MB permitido para importação.`] };
  }
  try {
    const parsed = JSON.parse(rawText);
    const state = migrateState(parsed);
    const fieldErrors = validateImportedStateLimits(state);
    if (fieldErrors.length > 0) {
      return { ok: false, errors: fieldErrors };
    }
    if (state.routines.length > MAX_ROUTINES) {
      return { ok: false, errors: [`O backup tem rotinas demais (máximo: ${MAX_ROUTINES}).`] };
    }
    if (state.teachers.length > MAX_TEACHERS) {
      return { ok: false, errors: [`O backup tem professores demais (máximo: ${MAX_TEACHERS}).`] };
    }
    if (state.rooms.length > MAX_CLASSES) {
      return { ok: false, errors: [`O backup tem turmas demais (máximo: ${MAX_CLASSES}).`] };
    }
    if (state.devices.length > MAX_DEVICES) {
      return { ok: false, errors: [`O backup tem equipamentos demais (máximo: ${MAX_DEVICES}).`] };
    }
    if (state.maintenanceRecords.length > MAX_MAINTENANCES) {
      return { ok: false, errors: [`O backup tem manutenções demais (máximo: ${MAX_MAINTENANCES}).`] };
    }
    return { ok: true, value: state };
  } catch (error) {
    return {
      ok: false,
      errors: [`Backup JSON inválido ou incompatível: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export function importMaintenanceFromText(rawText: string): Result<MaintenanceRecord[]> {
  if (rawText.length > IMPORT_MAX_BYTES) {
    return { ok: false, errors: [`O backup excede o limite de ${IMPORT_MAX_BYTES / 1_048_576} MB permitido para importação.`] };
  }
  try {
    const parsed = JSON.parse(rawText) as { maintenanceRecords?: unknown };
    const candidate = parsed && typeof parsed === "object" && Array.isArray(parsed.maintenanceRecords)
      ? { maintenanceRecords: parsed.maintenanceRecords }
      : Array.isArray(parsed)
        ? { maintenanceRecords: parsed }
        : null;
    if (!candidate) {
      return {
        ok: false,
        errors: ["Backup inválido: nenhuma manutenção encontrada no arquivo selecionado."],
      };
    }
    const migrated = migrateState({ maintenanceRecords: candidate.maintenanceRecords });
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
    return {
      ok: false,
      errors: [`Backup JSON inválido ou incompatível: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
}

export function clearStoredState(storage: StorageAdapter = browserStorage()): EmptyResult {
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

export function createMemoryStorage(initial: Record<string, string> = {}): StorageAdapter {
  const values = new Map(Object.entries(initial));

  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}
