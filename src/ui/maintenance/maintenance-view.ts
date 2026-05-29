import type { AppActions } from "../../app/controller";
import { IMPORT_MAX_BYTES } from "../../domain/limits";
import {
  filterMaintenance,
  formatDateTime,
  getMaintenancePriorityLabel,
  getMaintenanceStatusLabel,
  getMaintenanceStatusTone,
  normalizeCase,
  normalizeText,
} from "../../domain/model";
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUSES,
  type AppState,
  type MaintenancePayload,
  type MaintenanceRecord,
} from "../../domain/types";
import type { DialogManager } from "../dialogs";
import { el, icon, option, replaceChildren, span } from "../dom";
import { refreshIcons } from "../icons";
import type { ToastManager } from "../toasts";
import { iconButton } from "../ui-elements";
import type { UIRefs } from "../ui-refs";
import {
  openMaintenanceBulkModal,
  openMaintenanceFormModal,
  type MaintenanceFormInitial,
} from "./maintenance-modal";

type MaintenanceRefs = Pick<
  UIRefs,
  | "maintenanceResultsCount"
  | "maintenanceSummary"
  | "maintenanceFilter"
  | "maintenanceFilterClear"
  | "maintenanceFilterType"
  | "maintenanceFilterStatus"
  | "maintenanceFilterPriority"
  | "maintenanceNew"
  | "maintenanceBulk"
  | "maintenanceExportCsv"
  | "maintenanceExportJson"
  | "maintenanceImportFile"
  | "maintenanceTableWrap"
>;

interface MaintenanceView {
  bindEvents(): void;
  render(): void;
}

interface Filters {
  query: string;
  type: string;
  status: string;
  priority: string;
}

export function createMaintenanceView({
  refs,
  getState,
  actions,
  dialogs,
  toasts,
  onChange,
}: {
  refs: MaintenanceRefs;
  getState: () => AppState;
  actions: AppActions;
  dialogs: DialogManager;
  toasts: ToastManager;
  onChange: () => void;
}): MaintenanceView {
  const filters: Filters = { query: "", type: "", status: "", priority: "" };
  const expandedRecordIds = new Set<string>();

  function bindEvents(): void {
    refs.maintenanceFilter.addEventListener("input", () => {
      filters.query = refs.maintenanceFilter.value;
      renderTable();
    });
    refs.maintenanceFilterType.addEventListener("change", () => {
      filters.type = refs.maintenanceFilterType.value;
      renderTable();
    });
    refs.maintenanceFilterStatus.addEventListener("change", () => {
      filters.status = refs.maintenanceFilterStatus.value;
      renderTable();
    });
    refs.maintenanceFilterPriority.addEventListener("change", () => {
      filters.priority = refs.maintenanceFilterPriority.value;
      renderTable();
    });
    refs.maintenanceFilterClear.addEventListener("click", () => {
      filters.query = "";
      filters.type = "";
      filters.status = "";
      filters.priority = "";
      refs.maintenanceFilter.value = "";
      refs.maintenanceFilterType.value = "";
      refs.maintenanceFilterStatus.value = "";
      refs.maintenanceFilterPriority.value = "";
      renderTable();
    });

    refs.maintenanceNew.addEventListener("click", () => openForm(null));
    refs.maintenanceBulk.addEventListener("click", () => openBulk());
    refs.maintenanceExportCsv.addEventListener("click", handleExportCsv);
    refs.maintenanceExportJson.addEventListener("click", handleExportJson);
    refs.maintenanceImportFile.addEventListener("change", handleImport);
  }

  function render(): void {
    populateStaticFilters();
    populateTypeFilter();
    renderSummary();
    renderTable();
  }

  function populateStaticFilters(): void {
    if (refs.maintenanceFilterStatus.options.length === 0) {
      replaceChildren(refs.maintenanceFilterStatus, [
        option("", "Todos os status"),
        ...MAINTENANCE_STATUSES.map((s) => option(s.value, s.label)),
      ]);
    }
    if (refs.maintenanceFilterPriority.options.length === 0) {
      replaceChildren(refs.maintenanceFilterPriority, [
        option("", "Todas as prioridades"),
        ...MAINTENANCE_PRIORITIES.map((p) => option(p.value, p.label)),
      ]);
    }
  }

  function populateTypeFilter(): void {
    const state = getState();
    const catalogNames = [...state.devices]
      .map((d) => d.name)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const prev = refs.maintenanceFilterType.value;
    replaceChildren(refs.maintenanceFilterType, [
      option("", "Todos os tipos"),
      ...catalogNames.map((name) => option(name, name)),
    ]);
    refs.maintenanceFilterType.value = prev;
  }

  function renderSummary(): void {
    const records = getState().maintenanceRecords;
    const tiles: Array<{ label: string; value: number; tone?: string }> = [
      { label: "Total", value: records.length },
      { label: "Com problema", value: countBy(records, (r) => r.status === "com-problema"), tone: "warning" },
      {
        label: "Aguardando chamado",
        value: countBy(records, (r) => r.status === "aguardando-chamado"),
        tone: "warning",
      },
      { label: "Chamado aberto", value: countBy(records, (r) => r.status === "chamado-aberto"), tone: "info" },
      { label: "Em manutenção", value: countBy(records, (r) => r.status === "em-manutencao"), tone: "info" },
      { label: "Resolvidos", value: countBy(records, (r) => r.status === "resolvido"), tone: "success" },
      {
        label: "Alta / Urgente",
        value: countBy(records, (r) => r.priority === "alta" || r.priority === "urgente"),
        tone: "danger",
      },
    ];

    replaceChildren(
      refs.maintenanceSummary,
      tiles.map((tile) =>
        el(
          "div",
          { className: `maintenance-metric${tile.tone ? ` is-${tile.tone}` : ""}` },
          [
            el("span", { className: "maintenance-metric-label", text: tile.label }),
            el("strong", { className: "maintenance-metric-value", text: String(tile.value) }),
          ],
        ),
      ),
    );
  }

  function renderTable(): void {
    const activeExpandId = (document.activeElement as HTMLElement | null)?.dataset?.expandId ?? null;

    const state = getState();
    const all = state.maintenanceRecords;
    const filtered = applyFilters(all, filters);

    const total = all.length;
    const shown = filtered.length;
    refs.maintenanceResultsCount.textContent =
      shown < total ? `${shown} de ${total} registro${total !== 1 ? 's' : ''}` : `${total} registro${total !== 1 ? 's' : ''}`;

    refs.maintenanceFilterClear.hidden = !hasActiveFilters(filters);

    if (!total) {
      replaceChildren(refs.maintenanceTableWrap, [
        emptyState("Sem manutenções cadastradas. Use “Cadastrar manutenção” para registrar o primeiro equipamento com problema."),
      ]);
      return;
    }
    if (!shown) {
      replaceChildren(refs.maintenanceTableWrap, [
        emptyState("Nenhuma manutenção corresponde aos filtros atuais. Limpe os filtros para ver tudo."),
      ]);
      return;
    }

    replaceChildren(refs.maintenanceTableWrap, [renderTableElement(filtered)]);
    refreshIcons(refs.maintenanceTableWrap);

    if (activeExpandId) {
      refs.maintenanceTableWrap
        .querySelector<HTMLElement>(`[data-expand-id=”${activeExpandId}”]`)
        ?.focus({ preventScroll: true });
    }
  }

  function renderTableElement(records: MaintenanceRecord[]): HTMLElement {
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
        el(
          "tbody",
          {},
          records.flatMap((record) => renderRowGroup(record)),
        ),
      ]),
    ]);
  }

  function hasExpandableContent(record: MaintenanceRecord): boolean {
    return Boolean(
      normalizeText(record.technicalDescription) ||
      normalizeText(record.actionsTaken) ||
      normalizeText(record.notes),
    );
  }

  function toggleExpanded(id: string): void {
    if (expandedRecordIds.has(id)) expandedRecordIds.delete(id);
    else expandedRecordIds.add(id);
    renderTable();
  }

  function renderRowGroup(record: MaintenanceRecord): HTMLElement[] {
    const isExpanded = expandedRecordIds.has(record.id);
    const hasExtra = hasExpandableContent(record);
    const rows: HTMLElement[] = [renderMainRow(record, isExpanded, hasExtra)];
    if (isExpanded && hasExtra) rows.push(renderExpandedRow(record));
    return rows;
  }

  function renderMainRow(record: MaintenanceRecord, isExpanded: boolean, hasExtra: boolean): HTMLElement {
    return el("tr", { className: "maintenance-row" }, [
      el("th", { className: "maintenance-cell-id", attrs: { scope: "row" } }, [
        el("strong", { text: record.equipmentId }),
      ]),
      el("td", { text: record.type || "—" }),
      el("td", { text: record.brandModel || "—" }),
      el("td", { text: record.location || "—" }),
      renderProblemCell(record, isExpanded, hasExtra),
      el("td", {}, [priorityBadge(record.priority)]),
      el("td", {}, [statusBadge(record.status)]),
      el("td", { text: record.ticketNumber || "—" }),
      el("td", { text: formatDateTime(record.createdAt) || "—" }),
      el("td", { text: formatDateTime(record.updatedAt) || "—" }),
      el("td", { className: "maintenance-cell-actions" }, [renderRowActions(record)]),
    ]);
  }

  function renderProblemCell(record: MaintenanceRecord, isExpanded: boolean, hasExtra: boolean): HTMLElement {
    const stackChildren: (HTMLElement | false)[] = [
      el("span", { className: "maintenance-problem-title", text: record.mainProblem || "—" }),
      !!normalizeText(record.responsibleContact) &&
        el("span", { className: "maintenance-problem-meta", text: record.responsibleContact }),
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
      btn.addEventListener("click", () => toggleExpanded(record.id));
      stackChildren.push(btn);
    }

    return el("td", { className: "maintenance-cell-problem" }, [
      el("div", { className: "maintenance-problem-stack" }, stackChildren),
    ]);
  }

  function renderExpandedRow(record: MaintenanceRecord): HTMLElement {
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

  function renderRowActions(record: MaintenanceRecord): HTMLElement {
    const label = record.equipmentId || "registro";
    return el("div", { className: "maintenance-actions" }, [
      iconButton("eye", `Ver detalhes da manutenção ${label}`, () => openDetails(record)),
      iconButton("pencil", `Editar manutenção ${label}`, () => openForm(record)),
      iconButton(
        "copy",
        `Duplicar manutenção ${label}`,
        () => openForm(null, toFormInitial(record, { clearId: true })),
      ),
      iconButton("trash-2", `Excluir manutenção ${label}`, () => confirmDelete(record), "danger"),
    ]);
  }

  function openForm(record: MaintenanceRecord | null, initialOverride?: MaintenanceFormInitial): void {
    const initial: MaintenanceFormInitial = initialOverride
      ?? (record ? toFormInitial(record) : { status: "com-problema", priority: "media" });

    openMaintenanceFormModal({
      title: record ? "Editar manutenção" : "Cadastrar manutenção",
      submitLabel: record ? "Salvar alterações" : "Salvar manutenção",
      initial,
      allowSaveAndAnother: !record,
      devices: getState().devices,
      onSubmit: (payload, mode) => {
        const result = record
          ? actions.updateMaintenanceRecord(record.id, payload)
          : actions.addMaintenanceRecord(payload);
        if (!result.ok) {
          toasts.show({
            type: "error",
            title: "Revise os campos da manutenção",
            message: result.errors.join(" "),
            timeout: 6800,
          });
          return false;
        }
        toasts.show({
          type: "success",
          title: record ? "Manutenção atualizada" : "Manutenção cadastrada",
          message: record ? "As alterações foram salvas." : `${payload.equipmentId || "Equipamento"} adicionado ao controle de manutenção.`,
          timeout: 3400,
        });
        onChange();
        return mode !== "save-and-new";
      },
    });
  }

  function openBulk(): void {
    openMaintenanceBulkModal({
      devices: getState().devices,
      onSubmit: (entries) => {
        const created: string[] = [];
        const errors: string[] = [];

        for (const payload of entries) {
          const result = actions.addMaintenanceRecord(payload);
          if (!result.ok) {
            errors.push(`${normalizeText(payload.equipmentId) || "(sem id)"}: ${result.errors.join(" ")}`);
          } else {
            created.push(normalizeText(payload.equipmentId));
          }
        }

        if (errors.length) {
          toasts.show({
            type: "error",
            title: "Algumas manutenções não foram cadastradas",
            message: errors.join(" • "),
            timeout: 7800,
          });
        }
        if (created.length) {
          toasts.show({
            type: "success",
            title: "Manutenções cadastradas em lote",
            message: `${created.length} nova${created.length > 1 ? "s" : ""} manutenç${created.length > 1 ? "ões" : "ão"} no controle.`,
            timeout: 3400,
          });
          onChange();
        }

        return errors.length === 0;
      },
    });
  }

  async function confirmDelete(record: MaintenanceRecord): Promise<void> {
    const confirmed = await dialogs.dangerConfirm({
      title: "Excluir esta manutenção?",
      message:
        "A manutenção sairá do controle. O histórico técnico desta entrada será perdido. Essa ação não pode ser desfeita.",
      details: [
        { label: "Identificador", value: record.equipmentId },
        { label: "Status", value: getMaintenanceStatusLabel(record.status) },
      ],
      confirmLabel: "Excluir manutenção",
    });
    if (!confirmed) return;

    const result = actions.deleteMaintenanceRecord(record.id);
    if (!result.ok) {
      toasts.show({
        type: "error",
        title: "Não foi possível excluir a manutenção",
        message: result.errors.join(" "),
      });
      return;
    }
    toasts.show({
      type: "success",
      title: "Manutenção excluída",
      message: `${record.equipmentId} foi removida do controle de manutenção.`,
      timeout: 3400,
    });
    onChange();
  }

  function openDetails(record: MaintenanceRecord): void {
    const details = [
      { label: "Identificador", value: record.equipmentId },
      { label: "Tipo", value: record.type || "—" },
      { label: "Modelo", value: record.brandModel || "—" },
      { label: "Local", value: record.location || "—" },
      { label: "Problema", value: record.mainProblem || "—" },
      { label: "Descrição técnica", value: record.technicalDescription || "—" },
      { label: "Ações realizadas", value: record.actionsTaken || "—" },
      { label: "Observações", value: record.notes || "—" },
      { label: "Prioridade", value: getMaintenancePriorityLabel(record.priority) },
      { label: "Status", value: getMaintenanceStatusLabel(record.status) },
      { label: "Chamado", value: record.ticketNumber || "—" },
      { label: "Responsável", value: record.responsibleContact || "—" },
      { label: "Criado em", value: formatDateTime(record.createdAt) },
      { label: "Atualizado em", value: formatDateTime(record.updatedAt) },
    ];

    const historyLines = record.history.length
      ? record.history
          .map((entry) => `• ${formatDateTime(entry.at)} — ${entry.message}`)
          .join("\n")
      : "Sem eventos registrados.";

    dialogs.alert({
      tone: "neutral",
      title: `Manutenção ${record.equipmentId}`,
      icon: "wrench",
      message: `Histórico técnico:\n${historyLines}`,
      details,
      confirmLabel: "Fechar",
    });
  }

  function handleExportCsv(): void {
    const records = applyFilters(getState().maintenanceRecords, filters);
    if (!records.length) {
      toasts.show({
        type: "warning",
        title: "Nada a exportar",
        message: "Nenhuma manutenção visível com os filtros atuais. Ajuste os filtros e tente novamente.",
      });
      return;
    }
    const csv = buildCsv(records);
    downloadBlob(csv, "text/csv;charset=utf-8", `manutencao-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function handleExportJson(): void {
    const data = actions.exportMaintenanceData();
    downloadBlob(data, "application/json", `manutencao-${new Date().toISOString().slice(0, 10)}.json`);
  }

  function handleImport(event: Event): void {
    const input = event.target instanceof HTMLInputElement ? event.target : refs.maintenanceImportFile;
    const [file] = input.files ?? [];
    if (!file) return;

    if (file.size > IMPORT_MAX_BYTES) {
      toasts.show({
        type: "error",
        title: "Arquivo grande demais",
        message: `O backup excede o limite de ${IMPORT_MAX_BYTES / 1_048_576} MB. Reduza o arquivo e importe novamente.`,
      });
      input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      const confirmed = await dialogs.confirm({
        tone: "warning",
        title: "Importar backup de manutenções?",
        message:
          "As manutenções atuais serão substituídas pelas do arquivo. Rotinas e demais catálogos permanecem intactos.",
        confirmLabel: "Importar manutenções",
      });
      if (!confirmed) {
        input.value = "";
        return;
      }

      const result = actions.importMaintenanceData(String(reader.result ?? ""));
      if (!result.ok) {
        toasts.show({
          type: "error",
          title: "Não foi possível importar o backup",
          message: result.errors.join(" "),
        });
      } else {
        const total = getState().maintenanceRecords.length;
        toasts.show({
          type: "success",
          title: "Backup de manutenções importado",
          message: `${total} manutenç${total === 1 ? "ão" : "ões"} disponíve${total === 1 ? "l" : "is"} após a importação.`,
          timeout: 3400,
        });
        onChange();
      }
      input.value = "";
    });
    reader.addEventListener("error", () => {
      toasts.show({
        type: "error",
        title: "Não foi possível ler o arquivo",
        message: "Verifique se o backup (.json) não está corrompido e tente novamente.",
      });
      input.value = "";
    });
    reader.readAsText(file);
  }

  return { bindEvents, render };
}

function applyFilters(records: MaintenanceRecord[], filters: Filters): MaintenanceRecord[] {
  let result = filterMaintenance(records, filters.query);
  if (filters.type) {
    const key = normalizeCase(filters.type);
    result = result.filter((r) => normalizeCase(r.type) === key);
  }
  if (filters.status) {
    result = result.filter((r) => r.status === filters.status);
  }
  if (filters.priority) {
    result = result.filter((r) => r.priority === filters.priority);
  }
  return result;
}

function hasActiveFilters(filters: Filters): boolean {
  return Boolean(filters.query || filters.type || filters.status || filters.priority);
}

function priorityBadge(priority: MaintenanceRecord["priority"]): HTMLElement {
  return el("span", {
    className: `maintenance-badge maintenance-priority is-${priority}`,
    text: getMaintenancePriorityLabel(priority),
  });
}

function statusBadge(status: MaintenanceRecord["status"]): HTMLElement {
  return el("span", {
    className: `maintenance-badge maintenance-status is-${getMaintenanceStatusTone(status)}`,
    text: getMaintenanceStatusLabel(status),
  });
}

function th(label: string, className = ""): HTMLElement {
  return el("th", { className, attrs: { scope: "col" } }, [span(label)]);
}

function emptyState(message: string): HTMLElement {
  return el("div", { className: "maintenance-empty" }, [icon("wrench"), el("strong", { text: message })]);
}

function detailBlock(label: string, value: string | undefined): HTMLElement {
  return el("div", { className: "maintenance-detail-block" }, [
    el("span", { className: "maintenance-detail-label", text: label }),
    el("p", { className: "maintenance-detail-value", text: normalizeText(value) || "Não informado" }),
  ]);
}

function countBy(records: MaintenanceRecord[], predicate: (r: MaintenanceRecord) => boolean): number {
  return records.reduce((acc, record) => acc + (predicate(record) ? 1 : 0), 0);
}

function toFormInitial(
  record: MaintenanceRecord,
  { clearId = false }: { clearId?: boolean } = {},
): MaintenanceFormInitial {
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

function buildCsv(records: MaintenanceRecord[]): string {
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

function csvEscape(value: unknown): string {
  const text = String(value ?? "");
  if (/[",\n\r;]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadBlob(content: string, type: string, filename: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type { MaintenancePayload };
