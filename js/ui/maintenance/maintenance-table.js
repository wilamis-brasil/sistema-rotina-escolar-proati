import {
  formatDateTime,
  getMaintenancePriorityLabel,
  getMaintenanceStatusLabel,
  getMaintenanceStatusTone,
  normalizeText,
} from "../../domain/model.js";
import { el, icon, span } from "../dom.js";
import { iconButton } from "../ui-elements.js";

/** @typedef {import("../../domain/types.js").MaintenanceRecord} MaintenanceRecord */
/**
 * @typedef {object} TableCallbacks
 * @property {Set<string>} expandedRecordIds
 * @property {(id: string) => void} onToggleExpand
 * @property {(record: MaintenanceRecord) => void} onDetails
 * @property {(record: MaintenanceRecord) => void} onEdit
 * @property {(record: MaintenanceRecord) => void} onDuplicate
 * @property {(record: MaintenanceRecord) => void} onDelete
 */

/**
 * Renderiza a tabela de manutenções (linhas + linhas expandidas).
 * @param {MaintenanceRecord[]} records
 * @param {TableCallbacks} callbacks
 * @returns {HTMLElement}
 */
export function renderMaintenanceTable(records, callbacks) {
  return el("div", { className: "maintenance-table-scroll" }, [
    el("table", { className: "maintenance-table" }, [
      el("thead", {}, [
        el("tr", {}, [
          th("Nº / Identificador", "maintenance-col-id"),
          th("Tipo"),
          th("Modelo"),
          th("Local"),
          th("Problema principal"),
          th("Prioridade"),
          th("Status"),
          th("Chamado"),
          th("Data do registro"),
          th("Última atualização"),
          th("Ações", "maintenance-col-actions"),
        ]),
      ]),
      el("tbody", {}, records.flatMap((record) => renderRowGroup(record, callbacks))),
    ]),
  ]);
}

/** @param {string} message @returns {HTMLElement} */
export function maintenanceEmptyState(message) {
  return el("div", { className: "maintenance-empty" }, [icon("wrench"), el("strong", { text: message })]);
}

/** @param {MaintenanceRecord} record @param {TableCallbacks} callbacks @returns {HTMLElement[]} */
function renderRowGroup(record, callbacks) {
  const isExpanded = callbacks.expandedRecordIds.has(record.id);
  const hasExtra = hasExpandableContent(record);
  const rows = [renderMainRow(record, isExpanded, hasExtra, callbacks)];
  if (isExpanded && hasExtra) rows.push(renderExpandedRow(record));
  return rows;
}

/** @param {MaintenanceRecord} record @returns {boolean} */
function hasExpandableContent(record) {
  return Boolean(normalizeText(record.technicalDescription) || normalizeText(record.actionsTaken) || normalizeText(record.notes));
}

/** @param {MaintenanceRecord} record @param {boolean} isExpanded @param {boolean} hasExtra @param {TableCallbacks} callbacks @returns {HTMLElement} */
function renderMainRow(record, isExpanded, hasExtra, callbacks) {
  return el("tr", { className: "maintenance-row" }, [
    el("th", { className: "maintenance-cell-id", attrs: { scope: "row" } }, [el("strong", { text: record.equipmentId })]),
    el("td", { text: record.type || "—" }),
    el("td", { text: record.brandModel || "—" }),
    el("td", { text: record.location || "—" }),
    renderProblemCell(record, isExpanded, hasExtra, callbacks),
    el("td", {}, [priorityBadge(record.priority)]),
    el("td", {}, [statusBadge(record.status)]),
    el("td", { text: record.ticketNumber || "—" }),
    el("td", { text: formatDateTime(record.createdAt) || "—" }),
    el("td", { text: formatDateTime(record.updatedAt) || "—" }),
    el("td", { className: "maintenance-cell-actions" }, [renderRowActions(record, callbacks)]),
  ]);
}

/** @param {MaintenanceRecord} record @param {boolean} isExpanded @param {boolean} hasExtra @param {TableCallbacks} callbacks @returns {HTMLElement} */
function renderProblemCell(record, isExpanded, hasExtra, callbacks) {
  const stackChildren = [
    el("span", { className: "maintenance-problem-title", text: record.mainProblem || "—" }),
    !!normalizeText(record.responsibleContact) && el("span", { className: "maintenance-problem-meta", text: record.responsibleContact }),
  ];

  if (hasExtra) {
    const btn = el(
      "button",
      {
        className: "maintenance-expand-toggle",
        attrs: {
          type: "button",
          "aria-expanded": String(isExpanded),
          "aria-controls": `maintenance-expanded-${record.id}`,
          "aria-label": `${isExpanded ? "Recolher detalhes de" : "Ver mais sobre"} ${record.equipmentId}`,
          "data-expand-id": record.id,
        },
      },
      [icon("chevron-down"), el("span", { text: isExpanded ? "Ver menos" : "Ver mais" })],
    );
    btn.addEventListener("click", () => callbacks.onToggleExpand(record.id));
    stackChildren.push(btn);
  }

  return el("td", { className: "maintenance-cell-problem" }, [el("div", { className: "maintenance-problem-stack" }, stackChildren)]);
}

/** @param {MaintenanceRecord} record @returns {HTMLElement} */
function renderExpandedRow(record) {
  return el("tr", { className: "maintenance-expanded-row" }, [
    el("td", { className: "maintenance-expanded-cell", attrs: { colspan: "11" } }, [
      el("div", { className: "maintenance-expanded-panel", attrs: { id: `maintenance-expanded-${record.id}` } }, [
        el("div", { className: "maintenance-detail-grid" }, [
          detailBlock("Descrição técnica", record.technicalDescription),
          detailBlock("Ações realizadas", record.actionsTaken),
          detailBlock("Observações", record.notes),
          detailBlock("Responsável", record.responsibleContact),
        ]),
      ]),
    ]),
  ]);
}

/** @param {MaintenanceRecord} record @param {TableCallbacks} callbacks @returns {HTMLElement} */
function renderRowActions(record, callbacks) {
  const label = record.equipmentId || "registro";
  return el("div", { className: "maintenance-actions" }, [
    iconButton("eye", `Ver detalhes da manutenção ${label}`, () => callbacks.onDetails(record)),
    iconButton("pencil", `Editar manutenção ${label}`, () => callbacks.onEdit(record)),
    iconButton("copy", `Duplicar manutenção ${label}`, () => callbacks.onDuplicate(record)),
    iconButton("trash-2", `Excluir manutenção ${label}`, () => callbacks.onDelete(record), "danger"),
  ]);
}

/** @param {string} priority @returns {HTMLElement} */
function priorityBadge(priority) {
  return el("span", { className: `maintenance-badge maintenance-priority is-${priority}`, text: getMaintenancePriorityLabel(priority) });
}

/** @param {string} status @returns {HTMLElement} */
function statusBadge(status) {
  return el("span", { className: `maintenance-badge maintenance-status is-${getMaintenanceStatusTone(status)}`, text: getMaintenanceStatusLabel(status) });
}

/** @param {string} label @param {string} [className] @returns {HTMLElement} */
function th(label, className = "") {
  return el("th", { className, attrs: { scope: "col" } }, [span(label)]);
}

/** @param {string} label @param {string | undefined} value @returns {HTMLElement} */
function detailBlock(label, value) {
  return el("div", { className: "maintenance-detail-block" }, [
    el("span", { className: "maintenance-detail-label", text: label }),
    el("p", { className: "maintenance-detail-value", text: normalizeText(value) || "Não informado" }),
  ]);
}
