// @ts-check

import { normalizeText } from "../domain/model.js";
import { el, icon, span } from "./dom.js";

/**
 * Botão apenas com ícone (ações compactas).
 * @param {string} iconName
 * @param {string} label
 * @param {() => void | Promise<void>} onClick
 * @param {string} [variant]
 * @returns {HTMLButtonElement}
 */
export function iconButton(iconName, label, onClick, variant = "neutral") {
  const button = el(
    "button",
    { className: `icon-button${variant === "danger" ? " is-danger" : ""}`, attrs: { type: "button", "aria-label": label, title: label } },
    [icon(iconName)],
  );
  button.addEventListener("click", () => void onClick());
  return button;
}

/**
 * Botão com ícone e rótulo visível.
 * @param {string} iconName
 * @param {string} label
 * @param {string} ariaLabel
 * @param {() => void | Promise<void>} onClick
 * @param {string} [variant]
 * @returns {HTMLButtonElement}
 */
export function actionButton(iconName, label, ariaLabel, onClick, variant = "neutral") {
  const button = el(
    "button",
    { className: `action-button${variant === "danger" ? " is-danger" : ""}`, attrs: { type: "button", "aria-label": ariaLabel, title: ariaLabel } },
    [icon(iconName), span(label)],
  );
  button.addEventListener("click", () => void onClick());
  return button;
}

/**
 * @param {string} label @param {string} value @param {string} helper
 * @returns {HTMLElement}
 */
export function metricItem(label, value, helper) {
  return el("div", { className: "metric-item" }, [
    el("span", { text: label }),
    el("strong", { text: value }),
    el("small", { text: helper }),
  ]);
}

/** @param {string} iconName @param {string} text @returns {HTMLElement} */
export function detailLine(iconName, text) {
  return el("p", { className: "detail-line" }, [icon(iconName), span(text)]);
}

/** @param {string} message @returns {HTMLElement} */
export function emptyState(message) {
  return el("div", { className: "empty-state", text: message });
}

/** @param {string} value @returns {string} versão kebab-case segura para ids. */
export function slug(value) {
  return normalizeText(value)
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
}
