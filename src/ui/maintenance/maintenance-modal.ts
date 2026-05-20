import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  type MaintenancePayload,
} from "../../domain/types";
import { el, icon, option } from "../dom";
import { refreshIcons } from "../icons";

export interface MaintenanceFormInitial {
  equipmentId?: string;
  type?: string;
  brandModel?: string;
  location?: string;
  mainProblem?: string;
  technicalDescription?: string;
  priority?: string;
  status?: string;
  ticketNumber?: string;
  responsibleContact?: string;
  actionsTaken?: string;
  notes?: string;
}

export type SubmitMode = "save" | "save-and-new";

interface MaintenanceFormOptions {
  title: string;
  submitLabel: string;
  initial: MaintenanceFormInitial;
  allowSaveAndAnother: boolean;
  onSubmit(payload: MaintenancePayload, mode: SubmitMode): boolean;
}

export function openMaintenanceFormModal(options: MaintenanceFormOptions): void {
  const backdrop = el("div", { className: "dialog-backdrop" });
  const container = ensureRoot();
  container.appendChild(backdrop);

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const idInput = textInput("Nº / Identificador", "Ex.: PC-001, NB-014", true, options.initial.equipmentId);
  const typeInput = textInput("Tipo", "Ex.: Notebook, Tablet", true, options.initial.type);
  const brandInput = textInput("Marca / Modelo", "Ex.: Lenovo IdeaPad 1", false, options.initial.brandModel);
  const locationInput = textInput("Local", "Ex.: Sala 12, Lab. Informática", false, options.initial.location);
  const problemInput = textInput("Problema principal", "Ex.: Não liga", true, options.initial.mainProblem);
  const techArea = textArea("Descrição técnica", options.initial.technicalDescription);
  const prioritySelect = selectInput(
    "Prioridade",
    MAINTENANCE_PRIORITIES.map((p) => ({ value: p.value, label: p.label })),
    options.initial.priority ?? "media",
  );
  const statusSelect = selectInput(
    "Status",
    MAINTENANCE_STATUSES.map((s) => ({ value: s.value, label: s.label })),
    options.initial.status ?? "com-problema",
  );
  const ticketInput = textInput("Número do chamado", "Ex.: SED-12345", false, options.initial.ticketNumber);
  const responsibleInput = textInput(
    "Responsável / contato",
    "Ex.: PROATEC – Maria",
    false,
    options.initial.responsibleContact,
  );
  const actionsArea = textArea("Ações realizadas", options.initial.actionsTaken);
  const notesArea = textArea("Observações", options.initial.notes);

  const feedback = el("p", { className: "form-feedback", attrs: { role: "alert" } });

  const cancelBtn = secondaryButton("Cancelar");
  const saveAndNewBtn = options.allowSaveAndAnother ? secondaryButton("Salvar e adicionar outro") : null;
  const submitBtn = primaryButton(options.submitLabel);

  const dialog = el(
    "section",
    {
      className: "dialog maintenance-form-dialog",
      attrs: {
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "maintenance-form-title",
      },
    },
    [
      el("div", { className: "dialog-header" }, [
        el("span", { className: "dialog-icon" }, [icon("wrench")]),
        el("div", {}, [
          el("span", { className: "dialog-kicker", text: "Manutenção" }),
          el("h2", { text: options.title, attrs: { id: "maintenance-form-title" } }),
        ]),
      ]),
      el("form", { className: "maintenance-form" }, [
        el("div", { className: "maintenance-form-grid" }, [
          idInput.wrap,
          typeInput.wrap,
          brandInput.wrap,
          locationInput.wrap,
          problemInput.wrap,
          prioritySelect.wrap,
          statusSelect.wrap,
          ticketInput.wrap,
          responsibleInput.wrap,
        ]),
        techArea.wrap,
        actionsArea.wrap,
        notesArea.wrap,
        feedback,
        el("div", { className: "dialog-actions" }, [cancelBtn, saveAndNewBtn, submitBtn].filter(Boolean) as Node[]),
      ]),
    ],
  );

  backdrop.appendChild(dialog);
  refreshIcons(backdrop);

  function close(): void {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  function collectPayload(): MaintenancePayload {
    return {
      equipmentId: idInput.input.value,
      type: typeInput.input.value,
      brandModel: brandInput.input.value,
      location: locationInput.input.value,
      mainProblem: problemInput.input.value,
      technicalDescription: techArea.input.value,
      priority: prioritySelect.input.value,
      status: statusSelect.input.value,
      ticketNumber: ticketInput.input.value,
      responsibleContact: responsibleInput.input.value,
      actionsTaken: actionsArea.input.value,
      notes: notesArea.input.value,
    };
  }

  function handleSubmit(mode: SubmitMode): void {
    const payload = collectPayload();
    const shouldClose = options.onSubmit(payload, mode);
    if (shouldClose) {
      close();
    } else if (mode === "save-and-new") {
      [idInput, brandInput, locationInput, problemInput, ticketInput, responsibleInput].forEach((field) => {
        field.input.value = "";
      });
      [techArea, actionsArea, notesArea].forEach((field) => {
        field.input.value = "";
      });
      idInput.input.focus();
    }
  }

  cancelBtn.addEventListener("click", close);
  submitBtn.addEventListener("click", () => handleSubmit("save"));
  saveAndNewBtn?.addEventListener("click", () => handleSubmit("save-and-new"));
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey);

  window.setTimeout(() => {
    idInput.input.focus();
    if (idInput.input.value) idInput.input.select();
  }, 0);
}

interface MaintenanceBulkOptions {
  onSubmit(entries: MaintenancePayload[]): boolean;
}

export function openMaintenanceBulkModal(options: MaintenanceBulkOptions): void {
  const backdrop = el("div", { className: "dialog-backdrop" });
  const container = ensureRoot();
  container.appendChild(backdrop);
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const typeInput = textInput("Tipo", "Ex.: Tablet", true);
  const prefixInput = textInput("Prefixo", "Ex.: TAB-", true);
  const startInput = numberInput("Numeração inicial", "1", 1);
  const countInput = numberInput("Quantidade", "10", 1);
  const padInput = numberInput("Dígitos do número", "3", 1);
  const brandInput = textInput("Marca / Modelo", "Ex.: Positivo T1060", false);
  const locationInput = textInput("Local", "Ex.: Sala 12", false);
  const problemInput = textInput("Problema principal", "Ex.: Não liga", true);
  const prioritySelect = selectInput(
    "Prioridade",
    MAINTENANCE_PRIORITIES.map((p) => ({ value: p.value, label: p.label })),
    "media",
  );
  const statusSelect = selectInput(
    "Status",
    MAINTENANCE_STATUSES.map((s) => ({ value: s.value, label: s.label })),
    "com-problema",
  );
  const techArea = textArea("Descrição técnica (opcional)", "");
  const actionsArea = textArea("Ações realizadas (opcional)", "");
  const notesArea = textArea("Observações (opcional)", "");

  const feedback = el("p", { className: "form-feedback", attrs: { role: "alert" } });

  const cancelBtn = secondaryButton("Cancelar");
  const submitBtn = primaryButton("Adicionar em massa");

  const dialog = el(
    "section",
    {
      className: "dialog maintenance-form-dialog",
      attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "maintenance-bulk-title" },
    },
    [
      el("div", { className: "dialog-header" }, [
        el("span", { className: "dialog-icon" }, [icon("list-plus")]),
        el("div", {}, [
          el("span", { className: "dialog-kicker", text: "Manutenção" }),
          el("h2", { text: "Adicionar registros em massa", attrs: { id: "maintenance-bulk-title" } }),
        ]),
      ]),
      el("form", { className: "maintenance-form" }, [
        el("div", { className: "maintenance-form-grid" }, [
          typeInput.wrap,
          prefixInput.wrap,
          startInput.wrap,
          countInput.wrap,
          padInput.wrap,
          brandInput.wrap,
          locationInput.wrap,
          problemInput.wrap,
          prioritySelect.wrap,
          statusSelect.wrap,
        ]),
        techArea.wrap,
        actionsArea.wrap,
        notesArea.wrap,
        feedback,
        el("div", { className: "dialog-actions" }, [cancelBtn, submitBtn]),
      ]),
    ],
  );

  backdrop.appendChild(dialog);
  refreshIcons(backdrop);

  function close(): void {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  function handleSubmit(): void {
    const type = typeInput.input.value.trim();
    const prefix = prefixInput.input.value.trim();
    const start = Number(startInput.input.value);
    const count = Number(countInput.input.value);
    const pad = Math.max(1, Number(padInput.input.value) || 0);

    const errors: string[] = [];
    if (!type) errors.push("Informe o tipo do equipamento.");
    if (!prefix) errors.push("Informe o prefixo.");
    if (!Number.isInteger(start) || start < 0) errors.push("Numeração inicial inválida.");
    if (!Number.isInteger(count) || count < 1) errors.push("Quantidade inválida.");
    if (!problemInput.input.value.trim()) errors.push("Informe o problema principal.");

    if (errors.length) {
      feedback.textContent = errors.join(" ");
      feedback.dataset.type = "error";
      return;
    }

    const entries: MaintenancePayload[] = [];
    for (let i = 0; i < count; i++) {
      const number = String(start + i).padStart(pad, "0");
      entries.push({
        equipmentId: `${prefix}${number}`,
        type,
        brandModel: brandInput.input.value,
        location: locationInput.input.value,
        mainProblem: problemInput.input.value,
        technicalDescription: techArea.input.value,
        priority: prioritySelect.input.value,
        status: statusSelect.input.value,
        ticketNumber: "",
        responsibleContact: "",
        actionsTaken: actionsArea.input.value,
        notes: notesArea.input.value,
      });
    }

    const shouldClose = options.onSubmit(entries);
    if (shouldClose) close();
  }

  cancelBtn.addEventListener("click", close);
  submitBtn.addEventListener("click", handleSubmit);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey);

  window.setTimeout(() => typeInput.input.focus(), 0);
}

interface Field<T extends HTMLElement> {
  wrap: HTMLLabelElement;
  input: T;
}

function textInput(label: string, placeholder: string, required: boolean, value?: string): Field<HTMLInputElement> {
  const input = el("input", {
    className: "form-input",
    attrs: {
      type: "text",
      autocomplete: "off",
      placeholder,
      ...(required ? { required: "" } : {}),
    },
  }) as HTMLInputElement;
  if (value) input.value = value;
  const wrap = el("label", { className: "maintenance-field" }, [
    el("span", { className: "form-label", text: required ? `${label} *` : label }),
    input,
  ]) as HTMLLabelElement;
  return { wrap, input };
}

function numberInput(label: string, placeholder: string, min: number): Field<HTMLInputElement> {
  const input = el("input", {
    className: "form-input",
    attrs: {
      type: "number",
      placeholder,
      min: String(min),
      step: "1",
    },
  }) as HTMLInputElement;
  const wrap = el("label", { className: "maintenance-field" }, [
    el("span", { className: "form-label", text: label }),
    input,
  ]) as HTMLLabelElement;
  return { wrap, input };
}

function textArea(label: string, value?: string): Field<HTMLTextAreaElement> {
  const input = el("textarea", {
    className: "form-input",
    attrs: { rows: "3" },
  }) as HTMLTextAreaElement;
  if (value) input.value = value;
  const wrap = el("label", { className: "maintenance-field maintenance-field-full" }, [
    el("span", { className: "form-label", text: label }),
    input,
  ]) as HTMLLabelElement;
  return { wrap, input };
}

function selectInput(
  label: string,
  options: Array<{ value: string; label: string }>,
  value: string,
): Field<HTMLSelectElement> {
  const input = el("select", { className: "form-input" }) as HTMLSelectElement;
  options.forEach((opt) => input.appendChild(option(opt.value, opt.label)));
  input.value = value;
  const wrap = el("label", { className: "maintenance-field" }, [
    el("span", { className: "form-label", text: label }),
    input,
  ]) as HTMLLabelElement;
  return { wrap, input };
}

function primaryButton(label: string): HTMLButtonElement {
  return el("button", { className: "button button-primary", attrs: { type: "button" } }, [
    el("span", { text: label }),
  ]) as HTMLButtonElement;
}

function secondaryButton(label: string): HTMLButtonElement {
  return el("button", { className: "button button-secondary", attrs: { type: "button" } }, [
    el("span", { text: label }),
  ]) as HTMLButtonElement;
}

function ensureRoot(): HTMLElement {
  const existing = document.querySelector<HTMLElement>("#dialog-root");
  if (existing) return existing;
  const created = el("div", { className: "dialog-root", attrs: { id: "dialog-root" } });
  document.body.appendChild(created);
  return created;
}
