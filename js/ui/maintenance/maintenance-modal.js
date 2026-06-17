// @ts-check

import { MAX_MAINTENANCE_BATCH } from "../../domain/limits.js";
import { MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from "../../domain/types.js";
import { el, icon, option } from "../dom.js";
import { refreshIcons } from "../icons.js";

/** @typedef {import("../../domain/types.js").MaintenancePayload} MaintenancePayload */
/** @typedef {"save" | "save-and-new"} SubmitMode */
/**
 * @typedef {object} MaintenanceFormInitial
 * @property {string} [equipmentId]
 * @property {string} [type]
 * @property {string} [brandModel]
 * @property {string} [location]
 * @property {string} [mainProblem]
 * @property {string} [technicalDescription]
 * @property {string} [priority]
 * @property {string} [status]
 * @property {string} [ticketNumber]
 * @property {string} [responsibleContact]
 * @property {string} [actionsTaken]
 * @property {string} [notes]
 */

/**
 * Abre o modal de cadastro/edição de uma manutenção.
 * @param {{
 *   title: string,
 *   submitLabel: string,
 *   initial: MaintenanceFormInitial,
 *   allowSaveAndAnother: boolean,
 *   devices: Array<{ name: string }>,
 *   onSubmit: (payload: MaintenancePayload, mode: SubmitMode) => boolean,
 * }} options
 */
export function openMaintenanceFormModal(options) {
  const { backdrop, close } = openDialog();

  const idInput = textInput("Identificador do equipamento", "Ex.: NB-014, CB-007", true, options.initial.equipmentId, 60);
  const typeSelect = selectInput("Tipo de equipamento", deviceTypeOptions(options.devices, options.initial.type), options.initial.type ?? "", true);
  const brandInput = textInput("Marca e modelo", "Ex.: Positivo UL124", false, options.initial.brandModel, 80);
  const locationInput = textInput("Local atual", "Ex.: Sala 12, Lab. Informática", false, options.initial.location, 80);
  const problemInput = textInput("Problema principal", "Ex.: Não liga, tela quebrada", true, options.initial.mainProblem, 200);
  const techArea = textAreaWithMax("Descrição técnica", options.initial.technicalDescription, 500);
  const prioritySelect = selectInput("Prioridade", priorityOptions(), options.initial.priority ?? "media");
  const statusSelect = selectInput("Status", statusOptions(), options.initial.status ?? "com-problema");
  const ticketInput = textInput("Número do chamado", "Ex.: 12345", false, options.initial.ticketNumber, 30);
  const responsibleInput = textInput("Responsável pelo acompanhamento", "Ex.: PROATEC - Maria", false, options.initial.responsibleContact, 80);
  const actionsArea = textAreaWithMax("Ações realizadas", options.initial.actionsTaken, 500);
  const notesArea = textAreaWithMax("Observações", options.initial.notes, 500);

  const cancelBtn = secondaryButton("Cancelar");
  const saveAndNewBtn = options.allowSaveAndAnother ? secondaryButton("Salvar e cadastrar outra") : null;
  const submitBtn = primaryButton(options.submitLabel);

  const dialog = el(
    "section",
    { className: "dialog maintenance-form-dialog", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "maintenance-form-title" } },
    [
      el("div", { className: "dialog-header" }, [
        el("span", { className: "dialog-icon" }, [icon("wrench")]),
        el("div", {}, [el("h2", { text: options.title, attrs: { id: "maintenance-form-title" } })]),
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
        el("div", { className: "dialog-actions" }, [cancelBtn, saveAndNewBtn, submitBtn]),
      ]),
    ],
  );

  backdrop.appendChild(dialog);
  refreshIcons(backdrop);

  /** @returns {MaintenancePayload} */
  function collectPayload() {
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

  /** @param {SubmitMode} mode */
  function handleSubmit(mode) {
    const shouldClose = options.onSubmit(collectPayload(), mode);
    if (shouldClose) {
      close();
    } else if (mode === "save-and-new") {
      // Preserva tipo, prioridade e status para o próximo cadastro em sequência.
      [idInput, brandInput, locationInput, problemInput, ticketInput, responsibleInput, techArea, actionsArea, notesArea].forEach((field) => {
        field.input.value = "";
      });
      idInput.input.focus();
    }
  }

  cancelBtn.addEventListener("click", close);
  submitBtn.addEventListener("click", () => handleSubmit("save"));
  saveAndNewBtn?.addEventListener("click", () => handleSubmit("save-and-new"));

  focusSoon(() => {
    idInput.input.focus();
    if (idInput.input.value) idInput.input.select();
  });
}

/**
 * Abre o modal de cadastro de manutenções em lote.
 * @param {{ devices: Array<{ name: string }>, onSubmit: (entries: MaintenancePayload[]) => boolean }} options
 */
export function openMaintenanceBulkModal(options) {
  const { backdrop, close } = openDialog();

  const problemInput = textInput("Problema principal", "Ex.: Não liga, tela quebrada", true);
  const prioritySelect = selectInput("Prioridade", priorityOptions(), "media");
  const statusSelect = selectInput("Status", statusOptions(), "com-problema");
  const techArea = textAreaWithMax("Descrição técnica (opcional)", "", 500);
  const actionsArea = textAreaWithMax("Ações já realizadas (opcional)", "", 500);
  const notesArea = textAreaWithMax("Observações (opcional)", "", 500);

  const devicesContainer = el("div", { className: "maintenance-bulk-devices" });
  const addDeviceBtn = /** @type {HTMLButtonElement} */ (
    el("button", { className: "button button-secondary maintenance-bulk-add-device", attrs: { type: "button" } }, [
      icon("plus"),
      el("span", { text: "Adicionar outro equipamento ao lote" }),
    ])
  );

  /** @type {Array<{ wrap: HTMLElement, equipmentId: HTMLInputElement, type: HTMLSelectElement, brandModel: HTMLInputElement, location: HTMLInputElement }>} */
  const rows = [];

  function updateRowIndexes() {
    rows.forEach((row, idx) => {
      const badge = row.wrap.querySelector(".maintenance-bulk-device-index");
      if (badge) badge.textContent = `#${idx + 1}`;
      const removeBtn = /** @type {HTMLButtonElement | null} */ (row.wrap.querySelector(".maintenance-bulk-device-remove"));
      if (removeBtn) removeBtn.disabled = rows.length <= 1;
    });
  }

  function addDeviceRow() {
    const equipmentId = textInput("Identificador do equipamento", "Ex.: TAB-003", true);
    const type = selectInput("Tipo de equipamento", deviceTypeOptions(options.devices), "", true);
    const brandModel = textInput("Marca e modelo", "Ex.: Positivo T1060", false);
    const location = textInput("Local atual", "Ex.: Sala 12", false);

    const removeBtn = /** @type {HTMLButtonElement} */ (
      el("button", {
        className: "icon-button is-danger maintenance-bulk-device-remove",
        attrs: { type: "button", "aria-label": "Remover este equipamento do lote", title: "Remover do lote" },
      }, [icon("trash-2")])
    );
    const indexBadge = el("span", { className: "maintenance-bulk-device-index", text: "#" });

    const rowEl = el("div", { className: "maintenance-bulk-device-row" }, [
      el("div", { className: "maintenance-bulk-device-header" }, [indexBadge, removeBtn]),
      el("div", { className: "maintenance-bulk-device-grid" }, [equipmentId.wrap, type.wrap, brandModel.wrap, location.wrap]),
    ]);

    const row = { wrap: rowEl, equipmentId: equipmentId.input, type: type.input, brandModel: brandModel.input, location: location.input };

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
  const submitBtn = primaryButton("Cadastrar lote de manutenções");

  const dialog = el(
    "section",
    { className: "dialog maintenance-form-dialog maintenance-bulk-dialog", attrs: { role: "dialog", "aria-modal": "true", "aria-labelledby": "maintenance-bulk-title" } },
    [
      el("div", { className: "dialog-header" }, [
        el("span", { className: "dialog-icon" }, [icon("list-plus")]),
        el("div", {}, [el("h2", { text: "Cadastrar manutenções em lote", attrs: { id: "maintenance-bulk-title" } })]),
      ]),
      el("form", { className: "maintenance-form" }, [
        el("section", { className: "maintenance-bulk-section" }, [
          el("header", { className: "maintenance-bulk-section-header" }, [
            el("h3", { className: "maintenance-bulk-section-title", text: "Dados comuns do lote" }),
            el("p", { className: "maintenance-bulk-section-hint", text: "Aplicados a todos os equipamentos do lote." }),
          ]),
          el("div", { className: "maintenance-form-grid" }, [problemInput.wrap, prioritySelect.wrap, statusSelect.wrap]),
          techArea.wrap,
          actionsArea.wrap,
          notesArea.wrap,
        ]),
        el("section", { className: "maintenance-bulk-section" }, [
          el("header", { className: "maintenance-bulk-section-header" }, [
            el("h3", { className: "maintenance-bulk-section-title", text: "Equipamentos do lote" }),
            el("p", { className: "maintenance-bulk-section-hint", text: "Inclua um ou mais equipamentos. Tipos e identificadores podem variar." }),
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

  /** @param {string} message */
  function showError(message) {
    feedback.textContent = message;
    feedback.dataset.type = "error";
  }

  function handleSubmit() {
    const mainProblem = problemInput.input.value.trim();
    /** @type {string[]} */
    const errors = [];

    if (!mainProblem) errors.push("Informe o problema principal aplicado ao lote.");
    if (rows.length === 0) errors.push("Adicione ao menos um equipamento ao lote.");
    if (rows.length > MAX_MAINTENANCE_BATCH) {
      errors.push(`O lote suporta até ${MAX_MAINTENANCE_BATCH} equipamentos. Remova ${rows.length - MAX_MAINTENANCE_BATCH} item(ns) para continuar.`);
    }

    /** @type {MaintenancePayload[]} */
    const entries = [];
    rows.forEach((row, idx) => {
      const equipmentId = row.equipmentId.value.trim();
      const type = row.type.value.trim();
      if (!equipmentId) errors.push(`Equipamento #${idx + 1}: informe o identificador.`);
      if (!type) errors.push(`Equipamento #${idx + 1}: selecione o tipo.`);
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
      showError(errors.join(" "));
      return;
    }

    feedback.textContent = "";
    delete feedback.dataset.type;
    if (options.onSubmit(entries)) close();
  }

  addDeviceBtn.addEventListener("click", () => {
    if (rows.length >= MAX_MAINTENANCE_BATCH) {
      showError(`Limite de ${MAX_MAINTENANCE_BATCH} equipamentos por lote atingido. Cadastre os demais em um novo lote.`);
      return;
    }
    addDeviceRow().equipmentId.focus();
  });
  cancelBtn.addEventListener("click", close);
  submitBtn.addEventListener("click", handleSubmit);

  focusSoon(() => problemInput.input.focus());
}

// --- Infraestrutura de diálogo e campos -----------------------------------

/**
 * Monta o backdrop do diálogo, registra Escape/click-fora e devolve a função
 * de fechamento que restaura o foco anterior.
 * @returns {{ backdrop: HTMLElement, close: () => void }}
 */
function openDialog() {
  const backdrop = el("div", { className: "dialog-backdrop" });
  ensureRoot().appendChild(backdrop);
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

  function close() {
    document.removeEventListener("keydown", onKey);
    backdrop.remove();
    if (previousFocus?.isConnected) previousFocus.focus();
  }

  /** @param {KeyboardEvent} event */
  function onKey(event) {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    }
  }

  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener("keydown", onKey);

  return { backdrop, close };
}

/** @returns {Array<{ value: string, label: string }>} */
function priorityOptions() {
  return MAINTENANCE_PRIORITIES.map((p) => ({ value: p.value, label: p.label }));
}

/** @returns {Array<{ value: string, label: string }>} */
function statusOptions() {
  return MAINTENANCE_STATUSES.map((s) => ({ value: s.value, label: s.label }));
}

/**
 * Opções do select de tipo: placeholder + catálogo ordenado em pt-BR, mais o
 * valor atual marcado como "(legado)" quando não está no catálogo.
 * @param {Array<{ name: string }>} devices
 * @param {string} [current]
 * @returns {Array<{ value: string, label: string }>}
 */
function deviceTypeOptions(devices, current) {
  const names = devices.map((d) => d.name).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const opts = [{ value: "", label: "Selecione o tipo de equipamento" }, ...names.map((name) => ({ value: name, label: name }))];
  if (current && !names.includes(current)) opts.push({ value: current, label: `${current} (legado)` });
  return opts;
}

/**
 * @param {string} label @param {string} placeholder @param {boolean} required
 * @param {string} [value] @param {number} [maxLength]
 * @returns {{ wrap: HTMLLabelElement, input: HTMLInputElement }}
 */
function textInput(label, placeholder, required, value, maxLength) {
  const input = /** @type {HTMLInputElement} */ (
    el("input", {
      className: "form-input",
      attrs: {
        type: "text",
        autocomplete: "off",
        placeholder,
        ...(required ? { required: "" } : {}),
        ...(maxLength !== undefined ? { maxlength: String(maxLength) } : {}),
      },
    })
  );
  if (value) input.value = value;
  return { wrap: fieldWrap(label, required, input), input };
}

/**
 * @param {string} label @param {string} [value] @param {number} [maxLength]
 * @returns {{ wrap: HTMLLabelElement, input: HTMLTextAreaElement }}
 */
function textAreaWithMax(label, value, maxLength) {
  const input = /** @type {HTMLTextAreaElement} */ (
    el("textarea", { className: "form-input", attrs: { rows: "3", ...(maxLength !== undefined ? { maxlength: String(maxLength) } : {}) } })
  );
  if (value) input.value = value;
  return { wrap: fieldWrap(label, false, input, "maintenance-field-full"), input };
}

/**
 * @param {string} label @param {Array<{ value: string, label: string }>} opts
 * @param {string} value @param {boolean} [required]
 * @returns {{ wrap: HTMLLabelElement, input: HTMLSelectElement }}
 */
function selectInput(label, opts, value, required = false) {
  const input = /** @type {HTMLSelectElement} */ (
    el("select", { className: "form-input", attrs: { ...(required ? { required: "" } : {}) } })
  );
  opts.forEach((opt) => input.appendChild(option(opt.value, opt.label)));
  input.value = value;
  return { wrap: fieldWrap(label, required, input), input };
}

/**
 * @param {string} label @param {boolean} required @param {HTMLElement} input @param {string} [extraClass]
 * @returns {HTMLLabelElement}
 */
function fieldWrap(label, required, input, extraClass = "") {
  return /** @type {HTMLLabelElement} */ (
    el("label", { className: `maintenance-field${extraClass ? ` ${extraClass}` : ""}` }, [
      el("span", { className: "form-label", text: required ? `${label} *` : label }),
      input,
    ])
  );
}

/** @param {string} label @returns {HTMLButtonElement} */
function primaryButton(label) {
  return /** @type {HTMLButtonElement} */ (el("button", { className: "button button-primary", attrs: { type: "button" } }, [el("span", { text: label })]));
}

/** @param {string} label @returns {HTMLButtonElement} */
function secondaryButton(label) {
  return /** @type {HTMLButtonElement} */ (el("button", { className: "button button-secondary", attrs: { type: "button" } }, [el("span", { text: label })]));
}

/** @returns {HTMLElement} */
function ensureRoot() {
  const existing = /** @type {HTMLElement | null} */ (document.querySelector("#dialog-root"));
  if (existing) return existing;
  const created = el("div", { className: "dialog-root", attrs: { id: "dialog-root" } });
  document.body.appendChild(created);
  return created;
}

/** @param {() => void} fn */
function focusSoon(fn) {
  window.setTimeout(fn, 0);
}
