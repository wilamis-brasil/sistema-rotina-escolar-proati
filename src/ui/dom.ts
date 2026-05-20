type Child = Node | string | number | null | undefined | false;

interface ElementOptions {
  className?: string;
  text?: string;
  attrs?: Record<string, string>;
}

export function qs<T extends Element>(selector: string, root: ParentNode = document): T {
  const node = root.querySelector<T>(selector);
  if (!node) {
    throw new Error(`Elemento obrigatório não encontrado: ${selector}`);
  }
  return node;
}

export function qsa<T extends Element>(selector: string, root: ParentNode = document): NodeListOf<T> {
  return root.querySelectorAll<T>(selector);
}

export function replaceChildren(parent: Element, children: Child[]): void {
  parent.replaceChildren(...children.filter(Boolean).map(toNode));
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options: ElementOptions = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      node.setAttribute(key, value);
    });
  }

  children.filter(Boolean).forEach((child) => {
    node.appendChild(toNode(child));
  });

  return node;
}

export function span(text: unknown): HTMLSpanElement {
  return el("span", { text: String(text ?? "") });
}

export function option(value: unknown, label: unknown): HTMLOptionElement {
  const node = document.createElement("option");
  node.value = String(value ?? "");
  node.textContent = String(label ?? "");
  return node;
}

export function icon(name: string): HTMLElement {
  return el("i", { attrs: { "data-lucide": name, "aria-hidden": "true" } });
}

function toNode(child: Child): Node {
  if (child instanceof Node) return child;
  return document.createTextNode(String(child ?? ""));
}
