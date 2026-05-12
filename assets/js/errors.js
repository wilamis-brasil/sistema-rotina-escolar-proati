export function failure(message) {
  return { ok: false, errors: [normalizeMessage(message)] };
}

export function errorMessages(result, fallbackMessage = "Não foi possível concluir a ação.") {
  if (Array.isArray(result?.errors) && result.errors.length > 0) {
    return result.errors.map(normalizeMessage).filter(Boolean);
  }

  if (result?.message) {
    return [normalizeMessage(result.message)];
  }

  return [fallbackMessage];
}

export function errorText(result, fallbackMessage) {
  return errorMessages(result, fallbackMessage).join(" ");
}

function normalizeMessage(message) {
  return String(message ?? "").replace(/\s+/g, " ").trim();
}
