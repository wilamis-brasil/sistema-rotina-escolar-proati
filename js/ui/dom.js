// @ts-check

// Pequenos utilitários de DOM compartilhados por toda a UI. São os blocos de
// construção do projeto — sem framework, apenas a API nativa do documento.

/** @typedef {Node | string | number | null | undefined | false} Child */
/** @typedef {{ className?: string, text?: string, attrs?: Record<string, string> }} ElementOptions */

/**
 * Seleciona um elemento obrigatório. Lança se ele não existir.
 * @template {Element} T
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {T}
 */
export function qs(selector, root = document) {
  const node = /** @type {T | null} */ (root.querySelector(selector));
  if (!node) {
    throw new Error(`Elemento obrigatório não encontrado: ${selector}`);
  }
  return node;
}

/**
 * @template {Element} T
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {NodeListOf<T>}
 */
export function qsa(selector, root = document) {
  return /** @type {NodeListOf<T>} */ (root.querySelectorAll(selector));
}

/**
 * Substitui o conteúdo de um elemento, ignorando filhos falsy.
 * @param {Element} parent
 * @param {Child[]} children
 */
export function replaceChildren(parent, children) {
  parent.replaceChildren(...children.filter(Boolean).map(toNode));
}

/**
 * Cria um elemento com classe, texto, atributos e filhos opcionais.
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {ElementOptions} [options]
 * @param {Child[]} [children]
 * @returns {HTMLElementTagNameMap[K]}
 */
export function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    for (const [key, value] of Object.entries(options.attrs)) {
      node.setAttribute(key, value);
    }
  }
  children.filter(Boolean).forEach((child) => node.appendChild(toNode(child)));
  return node;
}

/** @param {unknown} text @returns {HTMLSpanElement} */
export function span(text) {
  return el("span", { text: String(text ?? "") });
}

/** @param {unknown} value @param {unknown} label @returns {HTMLOptionElement} */
export function option(value, label) {
  const node = document.createElement("option");
  node.value = String(value ?? "");
  node.textContent = String(label ?? "");
  return node;
}

/**
 * Placeholder de ícone. É substituído por um SVG inline por refreshIcons.
 * @param {string} name
 * @returns {HTMLElement}
 */
export function icon(name) {
  return el("i", { attrs: { "data-lucide": name, "aria-hidden": "true" } });
}

/** @param {Child} child @returns {Node} */
function toNode(child) {
  if (child instanceof Node) return child;
  return document.createTextNode(String(child ?? ""));
}
