// @ts-check

import { getMaintenancePriorityLabel, getMaintenanceStatusLabel } from "../../domain/model.js";

/** @typedef {import("../../domain/types.js").MaintenanceRecord} MaintenanceRecord */
/** @typedef {import("./maintenance-modal.js").MaintenanceFormInitial} MaintenanceFormInitial */

/**
 * Constrói o conteúdo CSV (com BOM para abrir corretamente no Excel) dos
 * registros de manutenção informados.
 * @param {MaintenanceRecord[]} records
 * @returns {string}
 */
export function buildCsv(records) {
  const headers = [
    "Identificador",
    "Tipo",
    "Marca/Modelo",
    "Local",
    "Problema",
    "Descrição técnica",
    "Prioridade",
    "Status",
    "Chamado",
    "Responsável",
    "Ações realizadas",
    "Observações",
    "Criado em",
    "Atualizado em",
  ];

  const lines = [headers.map(csvEscape).join(",")];
  records.forEach((record) => {
    lines.push(
      [
        record.equipmentId,
        record.type,
        record.brandModel,
        record.location,
        record.mainProblem,
        record.technicalDescription,
        getMaintenancePriorityLabel(record.priority),
        getMaintenanceStatusLabel(record.status),
        record.ticketNumber,
        record.responsibleContact,
        record.actionsTaken,
        record.notes,
        record.createdAt,
        record.updatedAt,
      ]
        .map(csvEscape)
        .join(","),
    );
  });

  return `﻿${lines.join("\r\n")}`;
}

/** @param {unknown} value @returns {string} */
function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Dispara o download de um conteúdo textual como arquivo.
 * @param {string} content @param {string} type @param {string} filename
 */
export function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Converte um registro em valores iniciais para o formulário (opcionalmente
 * limpando o identificador, para duplicação).
 * @param {MaintenanceRecord} record
 * @param {{ clearId?: boolean }} [options]
 * @returns {MaintenanceFormInitial}
 */
export function toFormInitial(record, { clearId = false } = {}) {
  return {
    equipmentId: clearId ? "" : record.equipmentId,
    type: record.type,
    brandModel: record.brandModel,
    location: record.location,
    mainProblem: record.mainProblem,
    technicalDescription: record.technicalDescription,
    priority: record.priority,
    status: record.status,
    ticketNumber: record.ticketNumber,
    responsibleContact: record.responsibleContact,
    actionsTaken: record.actionsTaken,
    notes: record.notes,
  };
}
