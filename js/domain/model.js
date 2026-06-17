// @ts-check

// Superfície pública do modelo de domínio. O modelo foi dividido em módulos
// focados (utilitários, rotinas, catálogos, manutenção, estado); este arquivo
// reexporta tudo para que os consumidores importem de um único lugar.

export * from "./model-utils.js";
export * from "./model-catalog.js";
export * from "./model-routine.js";
export * from "./model-maintenance.js";
export * from "./model-state.js";
