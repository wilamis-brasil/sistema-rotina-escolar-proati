import type { EmptyResult, Result } from "./types";

export function failure(message: unknown): EmptyResult {
  return { ok: false, errors: [normalizeMessage(message)] };
}

export function resultFailure<T = never>(messages: unknown | unknown[]): Result<T> {
  const errors = Array.isArray(messages) ? messages : [messages];
  return { ok: false, errors: errors.map(normalizeMessage).filter(Boolean) };
}

function errorMessages(
  result: { errors?: unknown[]; message?: unknown } | null | undefined,
  fallbackMessage = "Não foi possível concluir a ação.",
): string[] {
  if (Array.isArray(result?.errors) && result.errors.length > 0) {
    return result.errors.map(normalizeMessage).filter(Boolean);
  }

  if (result?.message) {
    return [normalizeMessage(result.message)];
  }

  return [fallbackMessage];
}

export function errorText(
  result: { errors?: unknown[]; message?: unknown } | null | undefined,
  fallbackMessage?: string,
): string {
  return errorMessages(result, fallbackMessage).join(" ");
}

function normalizeMessage(message: unknown): string {
  return String(message ?? "").replace(/\s+/g, " ").trim();
}
