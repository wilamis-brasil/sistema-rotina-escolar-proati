// @ts-check

/** @typedef {import("./types.js").EmptyResult} EmptyResult */

/**
 * @param {unknown} message
 * @returns {EmptyResult}
 */
export function failure(message) {
  return { ok: false, errors: [normalizeMessage(message)] };
}

/**
 * @template [T=never]
 * @param {unknown | unknown[]} messages
 * @returns {import("./types.js").Result<T>}
 */
export function resultFailure(messages) {
  const list = Array.isArray(messages) ? messages : [messages];
  return { ok: false, errors: list.map(normalizeMessage).filter(Boolean) };
}

/**
 * Mensagem legível a partir de um resultado de erro (lista `errors` ou `message`).
 * @param {{ errors?: unknown[], message?: unknown } | null | undefined} result
 * @param {string} [fallbackMessage]
 * @returns {string}
 */
export function errorText(result, fallbackMessage = "Não foi possível concluir a ação.") {
  if (Array.isArray(result?.errors) && result.errors.length > 0) {
    return result.errors.map(normalizeMessage).filter(Boolean).join(" ");
  }
  if (result?.message) {
    return normalizeMessage(result.message);
  }
  return fallbackMessage;
}

/**
 * @param {unknown} message
 * @returns {string}
 */
function normalizeMessage(message) {
  return String(message ?? "").replace(/\s+/g, " ").trim();
}
