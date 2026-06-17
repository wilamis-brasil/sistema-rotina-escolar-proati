// @ts-check

// Validação estrutural do estado importado/persistido. Substitui o Zod por
// verificações explícitas: o estado precisa ser um objeto simples e, quando
// presentes, as coleções conhecidas precisam ser arrays. A validação de
// conteúdo (campos, limites, enums) é feita pelas funções de normalização.

const COLLECTION_FIELDS = [
  "routines",
  "teachers",
  "rooms",
  "devices",
  "maintenanceRecords",
  "notificationLog",
];

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
export function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Garante que o candidato a estado tem o formato mínimo esperado antes de
 * normalizá-lo. Lança um erro legível quando o arquivo é inválido.
 * @param {unknown} candidate
 * @returns {Record<string, unknown>}
 */
export function parseStateCandidate(candidate) {
  if (!isPlainObject(candidate)) {
    throw new Error("Arquivo de dados inválido.");
  }
  for (const field of COLLECTION_FIELDS) {
    const value = candidate[field];
    if (value !== undefined && !Array.isArray(value)) {
      throw new Error("Arquivo de dados inválido.");
    }
  }
  return candidate;
}
