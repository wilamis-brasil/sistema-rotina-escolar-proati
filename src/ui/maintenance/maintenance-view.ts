import type { AppActions } from "../../app/controller";
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
import type { FeedbackPresenter } from "../ui-feedback";
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
  | "storageStatus"
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
  feedback,
  onChange,
}: {
  refs: MaintenanceRefs;
  getState: () => AppState;
  actions: AppActions;
  dialogs: DialogManager;
  toasts: ToastManager;
  feedback: FeedbackPresenter;
  onChange: () => void;
}): MaintenanceView {
  const filters: Filters = { query: "", type: "", status: "", priority: "" };

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
    const types = [...new Set(state.maintenanceRecords.map((r) => r.type).filter(Boolean))].sort(
      (a, b) => a.localeCompare(b, "pt-BR"),
    );
    const prev = refs.maintenanceFilterType.value;
    replaceChildren(refs.maintenanceFilterType, [
      option("", "Todos os tipos"),
      ...types.map((t) => option(t, t)),
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
      {
        label: "Sem chamado",
        value: countBy(records, (r) => !normalizeText(r.ticketNumber)),
        tone: "neutral",
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
    const state = getState();
    const all = state.maintenanceRecords;
    const filtered = applyFilters(all, filters);

    const total = all.length;
    const shown = filtered.length;
    refs.maintenanceResultsCount.textContent =
      shown < total ? `${shown} de ${total} registro${total !== 1 ? "s" : ""}` : `${total} registro${total !== 1 ? "s" : ""}`;

    refs.maintenanceFilterClear.hidden = !hasActiveFilters(filters);

    if (!total) {
      replaceChildren(refs.maintenanceTableWrap, [emptyState("Nenhum registro de manutenção cadastrado.")]);
      return;
    }
    if (!shown) {
      replaceChildren(refs.maintenanceTableWrap, [emptyState("Nenhum registro corresponde aos filtros.")]);
      return;
    }

    replaceChildren(refs.maintenanceTableWrap, [renderTableElement(filtered)]);
    refreshIcons(refs.maintenanceTableWrap);
  }

  function renderTableElement(records: MaintenanceRecord[]): HTMLElement {
    return el("div", { className: "maintenance-table-scroll" }, [
      el("table", { className: "maintenance-table" }, [
        el("thead", {}, [
          el("tr", {}, [
            th("Nº / Identificador", "maintenance-col-id"),
            th("Tipo"),
            th("Marca / Modelo"),
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
          records.map((record) => renderRow(record)),
        ),
      ]),
    ]);
  }

  function renderRow(record: MaintenanceRecord): HTMLElement {
    return el("tr", {}, [
      el("th", { className: "maintenance-cell-id", attrs: { scope: "row" } }, [
        el("strong", { text: record.equipmentId }),
      ]),
      el("td", { text: record.type || "—" }),
      el("td", { text: record.brandModel || "—" }),
      el("td", { text: record.location || "—" }),
      el("td", { text: record.mainProblem || "—" }),
      el("td", {}, [priorityBadge(record.priority)]),
      el("td", {}, [statusBadge(record.status)]),
      el("td", { text: record.ticketNumber || "—" }),
      el("td", { text: formatDateTime(record.createdAt) || "—" }),
      el("td", { text: formatDateTime(record.updatedAt) || "—" }),
      el("td", { className: "maintenance-cell-actions" }, [renderRowActions(record)]),
    ]);
  }

  function renderRowActions(record: MaintenanceRecord): HTMLElement {
    return el("div", { className: "maintenance-actions" }, [
      iconButton("eye", "Ver detalhes", () => openDetails(record)),
      iconButton("pencil", "Editar registro", () => openForm(record)),
      iconButton("copy", "Duplicar registro", () => openForm(null, toFormInitial(record, { clearId: true }))),
      iconButton("trash-2", "Excluir registro", () => confirmDelete(record), "danger"),
    ]);
  }

  function openForm(record: MaintenanceRecord | null, initialOverride?: MaintenanceFormInitial): void {
    const initial: MaintenanceFormInitial = initialOverride
      ?? (record ? toFormInitial(record) : { status: "com-problema", priority: "media" });

    openMaintenanceFormModal({
      title: record ? "Editar registro de manutenção" : "Novo registro de manutenção",
      submitLabel: record ? "Atualizar registro" : "Salvar registro",
      initial,
      allowSaveAndAnother: !record,
      onSubmit: (payload, mode) => {
        const result = record
          ? actions.updateMaintenanceRecord(record.id, payload)
          : actions.addMaintenanceRecord(payload);
        if (!result.ok) {
          toasts.show({
            type: "error",
            title: "Revise o registro",
            message: result.errors.join(" "),
            timeout: 6800,
          });
          return false;
        }
        toasts.show({
          type: "success",
          title: record ? "Registro atualizado" : "Registro salvo",
          message: record ? "As alterações foram salvas." : "O registro foi cadastrado.",
          timeout: 3400,
        });
        refs.storageStatus.textContent = "Dados locais salvos.";
        onChange();
        return mode !== "save-and-new";
      },
    });
  }

  function openBulk(): void {
    openMaintenanceBulkModal({
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
            title: "Alguns registros não foram criados",
            message: errors.join(" • "),
            timeout: 7800,
          });
        }
        if (created.length) {
          toasts.show({
            type: "success",
            title: "Registros criados em massa",
            message: `${created.length} novo${created.length > 1 ? "s" : ""} registro${created.length > 1 ? "s" : ""}.`,
            timeout: 3400,
          });
          refs.storageStatus.textContent = "Dados locais salvos.";
          onChange();
        }

        return errors.length === 0;
      },
    });
  }

  async function confirmDelete(record: MaintenanceRecord): Promise<void> {
    const confirmed = await dialogs.dangerConfirm({
      title: "Excluir registro de manutenção?",
      message: "Tem certeza que deseja excluir este registro de manutenção?",
      details: [
        { label: "Identificador", value: record.equipmentId },
        { label: "Status", value: getMaintenanceStatusLabel(record.status) },
      ],
      confirmLabel: "Excluir",
    });
    if (!confirmed) return;

    const result = actions.deleteMaintenanceRecord(record.id);
    if (!result.ok) {
      toasts.show({
        type: "error",
        title: "Não foi possível excluir",
        message: result.errors.join(" "),
      });
      return;
    }
    toasts.show({
      type: "success",
      title: "Registro excluído",
      message: `O registro ${record.equipmentId} foi removido.`,
      timeout: 3400,
    });
    refs.storageStatus.textContent = "Dados locais salvos.";
    onChange();
  }

  function openDetails(record: MaintenanceRecord): void {
    const details = [
      { label: "Identificador", value: record.equipmentId },
      { label: "Tipo", value: record.type || "—" },
      { label: "Marca / Modelo", value: record.brandModel || "—" },
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
      title: `Registro ${record.equipmentId}`,
      kicker: "Detalhes",
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
        message: "Não há registros visíveis para exportar.",
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

    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      const confirmed = await dialogs.confirm({
        tone: "warning",
        title: "Importar registros de manutenção?",
        message: "Os registros atuais de manutenção serão substituídos. Rotinas, catálogos e senhas não serão afetados.",
        confirmLabel: "Importar",
      });
      if (!confirmed) {
        input.value = "";
        return;
      }

      const result = actions.importMaintenanceData(String(reader.result ?? ""));
      if (!result.ok) {
        toasts.show({
          type: "error",
          title: "Não foi possível importar",
          message: result.errors.join(" "),
        });
      } else {
        feedback.showResult(result, refs.maintenanceResultsCount, "Registros de manutenção importados.");
        onChange();
      }
      input.value = "";
    });
    reader.addEventListener("error", () => {
      toasts.show({
        type: "error",
        title: "Falha na leitura",
        message: "Não foi possível ler o arquivo selecionado.",
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
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export type { MaintenancePayload };
