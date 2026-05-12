import { createEmptyState, normalizeState, nowIso, STORAGE_KEY } from "./model.js";

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { state: createEmptyState(), notice: "Novo armazenamento local criado neste navegador." };
    }

    return { state: normalizeState(JSON.parse(raw)), notice: "Dados locais carregados." };
  } catch (error) {
    console.error("Falha ao carregar dados locais.", error);
    return {
      state: createEmptyState(),
      notice: "Não foi possível carregar os dados locais. Um estado limpo foi iniciado.",
    };
  }
}

export function saveState(state) {
  try {
    const nextState = {
      ...state,
      meta: {
        ...state.meta,
        updatedAt: nowIso(),
      },
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    return { ok: true, state: nextState };
  } catch (error) {
    console.error("Falha ao salvar dados locais.", error);
    return {
      ok: false,
      errors: ["Não foi possível salvar no navegador. Verifique espaço disponível ou permissões do site."],
    };
  }
}

export function exportState(state) {
  return JSON.stringify(
    {
      ...state,
      exportedAt: nowIso(),
    },
    null,
    2,
  );
}

export function importStateFromText(rawText) {
  try {
    const parsed = JSON.parse(rawText);
    return { ok: true, state: normalizeState(parsed) };
  } catch (error) {
    return {
      ok: false,
      errors: [`Arquivo JSON inválido ou incompatível: ${error.message}`],
    };
  }
}

export function clearStoredState() {
  localStorage.removeItem(STORAGE_KEY);
}
