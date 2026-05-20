import { normalizeText } from "../domain/model";
import { el, icon, span } from "./dom";

export function iconButton(
  iconName: string,
  label: string,
  onClick: () => void | Promise<void>,
  variant = "neutral",
): HTMLButtonElement {
  const button = el(
    "button",
    {
      className: `icon-button${variant === "danger" ? " is-danger" : ""}`,
      attrs: {
        type: "button",
        "aria-label": label,
        title: label,
      },
    },
    [icon(iconName)],
  );
  button.addEventListener("click", () => void onClick());
  return button;
}

export function actionButton(
  iconName: string,
  label: string,
  ariaLabel: string,
  onClick: () => void | Promise<void>,
  variant = "neutral",
): HTMLButtonElement {
  const button = el(
    "button",
    {
      className: `action-button${variant === "danger" ? " is-danger" : ""}`,
      attrs: {
        type: "button",
        "aria-label": ariaLabel,
        title: ariaLabel,
      },
    },
    [icon(iconName), span(label)],
  );
  button.addEventListener("click", () => void onClick());
  return button;
}

export function metricItem(label: string, value: string, helper: string): HTMLElement {
  return el("div", { className: "metric-item" }, [
    el("span", { text: label }),
    el("strong", { text: value }),
    el("small", { text: helper }),
  ]);
}

export function detailLine(iconName: string, text: string): HTMLElement {
  return el("p", { className: "detail-line" }, [icon(iconName), span(text)]);
}

export function emptyState(message: string): HTMLElement {
  return el("div", { className: "empty-state", text: message });
}

export function slug(value: string): string {
  return normalizeText(value)
    .toLocaleLowerCase("pt-BR")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "");
}
