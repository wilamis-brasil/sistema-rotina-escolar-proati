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
  devices: Array<{ name: string }>;
  onSubmit(payload: MaintenancePayload, mode: SubmitMode): boolean;
}

export function openMaintenanceFormModal(options: MaintenanceFormOptions): void {
  const backdrop = el("div", { className: "dialog-backdrop" });
  const container = ensureRoot();
  container.appendChild(backdrop);

  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  const idInput = textInput("Nº / Identificador", "Ex.: 01", true, options.initial.equipmentId);
  const sortedTypeNames = [...options.devices].map((d) => d.name).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const typeNameSet = new Set(sortedTypeNames);
  const typeOpts: Array<{ value: string; label: string }> = [
    { value: "", label: "— selecione o tipo —" },
    ...sortedTypeNames.map((name) => ({ value: name, label: name })),
  ];
  if (options.initial.type && !typeNameSet.has(options.initial.type)) {
    typeOpts.push({ value: options.initial.type, label: `${options.initial.type} (legado)` });
  }
  const typeSelect = selectInput("Tipo *", typeOpts, options.initial.type ?? "");
  const brandInput = textInput("Modelo", "Ex.: UL124", false, options.initial.brandModel);
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
  const ticketInput = textInput("Número do chamado", "Ex.: 12345", false, options.initial.ticketNumber);
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
          typeSelect.wrap,
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
      type: typeSelect.input.value,
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
  devices: Array<{ name: string }>;
  onSubmit(entries: MaintenancePayload[]): boolean;
}

interface BulkDeviceDefaults {
  equipmentId?: string;
  type?: string;
  brandModel?: string;
  location?: string;
}

interface BulkDeviceRow {
  wrap: HTMLElement;
  equipmentId: HTMLInputElement;
  type: HTMLSelectElement;
  brandModel: HTMLInputElement;
  location: HTMLInputElement;
}

export function openMaintenanceBulkModal(options: MaintenanceBulkOptions): void {
  const backdrop = el("div", { className: "dialog-backdrop" });
  const container = ensureRoot();
  container.appendChild(backdrop);
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

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

  const devicesContainer = el("div", { className: "maintenance-bulk-devices" });
  const addDeviceBtn = el(
    "button",
    { className: "button button-secondary maintenance-bulk-add-device", attrs: { type: "button" } },
    [icon("plus"), el("span", { text: "Adicionar equipamento" })],
  ) as HTMLButtonElement;

  const rows: BulkDeviceRow[] = [];

  function updateRowIndexes(): void {
    rows.forEach((row, idx) => {
      const badge = row.wrap.querySelector<HTMLElement>(".maintenance-bulk-device-index");
      if (badge) badge.textContent = `#${idx + 1}`;
      const removeBtn = row.wrap.querySelector<HTMLButtonElement>(".maintenance-bulk-device-remove");
      if (removeBtn) removeBtn.disabled = rows.length <= 1;
    });
  }

  function addDeviceRow(defaults: BulkDeviceDefaults = {}): BulkDeviceRow {
    const equipmentId = textInput("Identificador / Número", "Ex.: TAB-003", true, defaults.equipmentId);
    const bulkSortedNames = [...options.devices].map((d) => d.name).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const bulkNameSet = new Set(bulkSortedNames);
    const bulkTypeOpts: Array<{ value: string; label: string }> = [
      { value: "", label: "— selecione o tipo —" },
      ...bulkSortedNames.map((name) => ({ value: name, label: name })),
    ];
    if (defaults.type && !bulkNameSet.has(defaults.type)) {
      bulkTypeOpts.push({ value: defaults.type, label: `${defaults.type} (legado)` });
    }
    const type = selectInput("Tipo *", bulkTypeOpts, defaults.type ?? "");
    const brandModel = textInput("Modelo", "Ex.: Positivo T1060", false, defaults.brandModel);
    const location = textInput("Local", "Ex.: Sala 12", false, defaults.location);

    const removeBtn = el(
      "button",
      {
        className: "icon-button is-danger maintenance-bulk-device-remove",
        attrs: { type: "button", "aria-label": "Remover equipamento", title: "Remover equipamento" },
      },
      [icon("trash-2")],
    ) as HTMLButtonElement;

    const indexBadge = el("span", { className: "maintenance-bulk-device-index", text: "#" });

    const rowEl = el("div", { className: "maintenance-bulk-device-row" }, [
      el("div", { className: "maintenance-bulk-device-header" }, [indexBadge, removeBtn]),
      el("div", { className: "maintenance-bulk-device-grid" }, [
        equipmentId.wrap,
        type.wrap,
        brandModel.wrap,
        location.wrap,
      ]),
    ]);

    const row: BulkDeviceRow = {
      wrap: rowEl,
      equipmentId: equipmentId.input,
      type: type.input,
      brandModel: brandModel.input,
      location: location.input,
    };

    removeBtn.addEventListener("click", () => {
      if (rows.length <= 1) return;
      const idx = rows.indexOf(row);
      if (idx === -1) return;
      rows.splice(idx, 1);
      rowEl.remove();
      updateRowIndexes();
    });

    rows.push(row);
    devicesContainer.appendChild(rowEl);
    refreshIcons(rowEl);
    updateRowIndexes();
    return row;
  }

  const feedback = el("p", { className: "form-feedback", attrs: { role: "alert" } });

  const cancelBtn = secondaryButton("Cancelar");
  const submitBtn = primaryButton("Adicionar em massa");

  const dialog = el(
    "section",
    {
      className: "dialog maintenance-form-dialog maintenance-bulk-dialog",
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
        el("section", { className: "maintenance-bulk-section" }, [
          el("header", { className: "maintenance-bulk-section-header" }, [
            el("h3", { className: "maintenance-bulk-section-title", text: "Dados comuns do lote" }),
            el("p", {
              className: "maintenance-bulk-section-hint",
              text: "Aplicado a todos os equipamentos abaixo.",
            }),
          ]),
          el("div", { className: "maintenance-form-grid" }, [
            problemInput.wrap,
            prioritySelect.wrap,
            statusSelect.wrap,
          ]),
          techArea.wrap,
          actionsArea.wrap,
          notesArea.wrap,
        ]),
        el("section", { className: "maintenance-bulk-section" }, [
          el("header", { className: "maintenance-bulk-section-header" }, [
            el("h3", { className: "maintenance-bulk-section-title", text: "Equipamentos" }),
            el("p", {
              className: "maintenance-bulk-section-hint",
              text: "Adicione quantos equipamentos forem necessários — eles podem ser de tipos e numerações diferentes.",
            }),
          ]),
          devicesContainer,
          addDeviceBtn,
        ]),
        feedback,
        el("div", { className: "dialog-actions" }, [cancelBtn, submitBtn]),
      ]),
    ],
  );

  backdrop.appendChild(dialog);
  refreshIcons(backdrop);

  addDeviceRow();

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
    const mainProblem = problemInput.input.value.trim();
    const errors: string[] = [];

    if (!mainProblem) errors.push("Informe o problema principal.");
    if (rows.length === 0) errors.push("Adicione ao menos um equipamento.");

    const entries: MaintenancePayload[] = [];
    rows.forEach((row, idx) => {
      const equipmentId = row.equipmentId.value.trim();
      const type = row.type.value.trim();
      if (!equipmentId) errors.push(`Equipamento #${idx + 1}: informe o identificador.`);
      if (!type) errors.push(`Equipamento #${idx + 1}: informe o tipo.`);
      if (equipmentId && type) {
        entries.push({
          equipmentId,
          type,
          brandModel: row.brandModel.value,
          location: row.location.value,
          mainProblem,
          technicalDescription: techArea.input.value,
          priority: prioritySelect.input.value,
          status: statusSelect.input.value,
          ticketNumber: "",
          responsibleContact: "",
          actionsTaken: actionsArea.input.value,
          notes: notesArea.input.value,
        });
      }
    });

    if (errors.length) {
      feedback.textContent = errors.join(" ");
      feedback.dataset.type = "error";
      return;
    }

    feedback.textContent = "";
    delete feedback.dataset.type;

    const shouldClose = options.onSubmit(entries);
    if (shouldClose) close();
  }

  addDeviceBtn.addEventListener("click", () => {
    const row = addDeviceRow();
    row.equipmentId.focus();
  });
  cancelBtn.addEventListener("click", close);
  submitBtn.addEventListener("click", handleSubmit);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey);

  window.setTimeout(() => problemInput.input.focus(), 0);
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
