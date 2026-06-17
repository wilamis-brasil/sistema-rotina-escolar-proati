import { el, icon, span } from "../dom.js";

/** @typedef {import("../../domain/notifications.js").NotificationPlan} NotificationPlan */

// Construtores stateless de pequenos pedaços de UI da central de avisos.

/** @param {string} label @param {string} value @param {string} helper @returns {HTMLElement} */
export function statusCard(label, value, helper) {
  return el("div", { className: "notifications-status-card" }, [
    el("span", { className: "eyebrow", text: label }),
    el("strong", { text: value }),
    el("small", { text: helper }),
  ]);
}

/** @param {string} title @param {Node[]} controls @returns {HTMLElement} */
export function settingsRow(title, controls) {
  return el("div", { className: "notifications-setting" }, [
    el("strong", { className: "notifications-setting-title", text: title }),
    el("div", { className: "notifications-setting-controls" }, controls),
  ]);
}

/** @param {string} title @param {HTMLElement[]} rows @returns {HTMLElement} */
export function settingsGroup(title, rows) {
  return el("div", { className: "notifications-settings-group" }, [el("span", { className: "notifications-settings-group-title", text: title }), ...rows]);
}

/** @param {string} label @param {boolean} checked @param {(value: boolean) => void} onChange @returns {HTMLElement} */
export function toggleRow(label, checked, onChange) {
  const input = el("input", { attrs: { type: "checkbox" } });
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  return el("label", { className: "notifications-toggle" }, [input, span(label)]);
}

/** @param {string} value @param {string} label @param {boolean} [selected] @returns {HTMLOptionElement} */
export function optionNode(value, label, selected = false) {
  const node = document.createElement("option");
  node.value = value;
  node.textContent = label;
  if (selected) node.selected = true;
  return node;
}

/** @param {string} label @param {HTMLElement} control @returns {HTMLElement} */
export function labeledInline(label, control) {
  return el("label", { className: "notifications-inline-field" }, [el("span", { text: label }), control]);
}

/** @param {string[]} values @returns {string[]} */
export function uniqueSorted(values) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

/** @param {string} iconName @param {string} label @param {() => void} onClick @returns {HTMLButtonElement} */
export function actionButtonInline(iconName, label, onClick) {
  const btn = el("button", { className: "button button-secondary button-small", attrs: { type: "button" } }, [icon(iconName), span(label)]);
  btn.addEventListener("click", onClick);
  return btn;
}

/** @param {NotificationPlan} plan @returns {string} */
export function labelForStatus(plan) {
  if (plan.isOverdue && plan.status === "pendente") return "Em atraso";
  switch (plan.status) {
    case "pendente":
      return "Pendente";
    case "exibida":
      return "Exibido";
    case "vista":
      return "Visto";
    case "adiada":
      return "Adiado";
    case "ignorada":
      return "Silenciado";
    case "desativada":
      return "Desativado";
    default:
      return plan.status;
  }
}

/** @param {number} value @returns {string} */
export function formatMinutes(value) {
  const safe = Math.max(0, Math.min(23 * 60 + 59, value));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}
