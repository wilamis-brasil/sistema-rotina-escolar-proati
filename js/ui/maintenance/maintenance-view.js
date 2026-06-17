import { IMPORT_MAX_BYTES } from "../../domain/limits.js";
import { filterMaintenance, formatDateTime, getMaintenancePriorityLabel, getMaintenanceStatusLabel, normalizeCase, normalizeText } from "../../domain/model.js";
import { MAINTENANCE_PRIORITIES, MAINTENANCE_STATUSES } from "../../domain/types.js";
import { el, option, replaceChildren } from "../dom.js";
import { refreshIcons } from "../icons.js";
import { openMaintenanceBulkModal, openMaintenanceFormModal } from "./maintenance-modal.js";
import { maintenanceEmptyState, renderMaintenanceTable } from "./maintenance-table.js";
import { buildCsv, downloadBlob, toFormInitial } from "./maintenance-export.js";

/** @typedef {import("../../domain/types.js").AppState} AppState */
/** @typedef {import("../../domain/types.js").MaintenanceRecord} MaintenanceRecord */
/** @typedef {{ query: string, type: string, status: string, priority: string }} Filters */

/**
 * Controle de manutenção: resumo, filtros, tabela expansível, cadastro
 * individual/em lote, exportação (CSV/JSON) e importação.
 * @param {{ refs: any, getState: () => AppState, actions: any, dialogs: any, toasts: any, onChange: () => void }} deps
 */
export function createMaintenanceView({ refs, getState, actions, dialogs, toasts, onChange }) {
  /** @type {Filters} */
  const filters = { query: "", type: "", status: "", priority: "" };
  const expandedRecordIds = new Set();

  function bindEvents() {
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
      filters.query = filters.type = filters.status = filters.priority = "";
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

  function render() {
    populateStaticFilters();
    populateTypeFilter();
    renderSummary();
    renderTable();
  }

  function populateStaticFilters() {
    if (refs.maintenanceFilterStatus.options.length === 0) {
      replaceChildren(refs.maintenanceFilterStatus, [option("", "Todos os status"), ...MAINTENANCE_STATUSES.map((s) => option(s.value, s.label))]);
    }
    if (refs.maintenanceFilterPriority.options.length === 0) {
      replaceChildren(refs.maintenanceFilterPriority, [option("", "Todas as prioridades"), ...MAINTENANCE_PRIORITIES.map((p) => option(p.value, p.label))]);
    }
  }

  function populateTypeFilter() {
    const catalogNames = [...getState().devices].map((d) => d.name).sort((a, b) => a.localeCompare(b, "pt-BR"));
    const prev = refs.maintenanceFilterType.value;
    replaceChildren(refs.maintenanceFilterType, [option("", "Todos os tipos"), ...catalogNames.map((name) => option(name, name))]);
    refs.maintenanceFilterType.value = prev;
  }

  function renderSummary() {
    const records = getState().maintenanceRecords;
    const tiles = [
      { label: "Total", value: records.length },
      { label: "Com problema", value: countBy(records, (r) => r.status === "com-problema"), tone: "warning" },
      { label: "Aguardando chamado", value: countBy(records, (r) => r.status === "aguardando-chamado"), tone: "warning" },
      { label: "Chamado aberto", value: countBy(records, (r) => r.status === "chamado-aberto"), tone: "info" },
      { label: "Em manutenção", value: countBy(records, (r) => r.status === "em-manutencao"), tone: "info" },
      { label: "Resolvidos", value: countBy(records, (r) => r.status === "resolvido"), tone: "success" },
      { label: "Alta / Urgente", value: countBy(records, (r) => r.priority === "alta" || r.priority === "urgente"), tone: "danger" },
    ];

    replaceChildren(
      refs.maintenanceSummary,
      tiles.map((tile) =>
        el("div", { className: `maintenance-metric${tile.tone ? ` is-${tile.tone}` : ""}` }, [
          el("span", { className: "maintenance-metric-label", text: tile.label }),
          el("strong", { className: "maintenance-metric-value", text: String(tile.value) }),
        ]),
      ),
    );
  }

  function renderTable() {
    const active = /** @type {HTMLElement | null} */ (document.activeElement);
    const activeExpandId = active?.dataset?.expandId ?? null;

    const all = getState().maintenanceRecords;
    const filtered = applyFilters(all, filters);
    const total = all.length;
    const shown = filtered.length;

    refs.maintenanceResultsCount.textContent =
      shown < total ? `${shown} de ${total} registro${total !== 1 ? "s" : ""}` : `${total} registro${total !== 1 ? "s" : ""}`;
    refs.maintenanceFilterClear.hidden = !hasActiveFilters(filters);

    if (!total) {
      replaceChildren(refs.maintenanceTableWrap, [
        maintenanceEmptyState("Sem manutenções cadastradas. Use “Cadastrar manutenção” para registrar o primeiro equipamento com problema."),
      ]);
      return;
    }
    if (!shown) {
      replaceChildren(refs.maintenanceTableWrap, [maintenanceEmptyState("Nenhuma manutenção corresponde aos filtros atuais. Limpe os filtros para ver tudo.")]);
      return;
    }

    replaceChildren(refs.maintenanceTableWrap, [
      renderMaintenanceTable(filtered, {
        expandedRecordIds,
        onToggleExpand: toggleExpanded,
        onDetails: openDetails,
        onEdit: (record) => openForm(record),
        onDuplicate: (record) => openForm(null, toFormInitial(record, { clearId: true })),
        onDelete: confirmDelete,
      }),
    ]);
    refreshIcons(refs.maintenanceTableWrap);

    if (activeExpandId) {
      refs.maintenanceTableWrap.querySelector(`[data-expand-id="${activeExpandId}"]`)?.focus({ preventScroll: true });
    }
  }

  /** @param {string} id */
  function toggleExpanded(id) {
    if (expandedRecordIds.has(id)) expandedRecordIds.delete(id);
    else expandedRecordIds.add(id);
    renderTable();
  }

  /** @param {MaintenanceRecord | null} record @param {any} [initialOverride] */
  function openForm(record, initialOverride) {
    const initial = initialOverride ?? (record ? toFormInitial(record) : { status: "com-problema", priority: "media" });

    openMaintenanceFormModal({
      title: record ? "Editar manutenção" : "Cadastrar manutenção",
      submitLabel: record ? "Salvar alterações" : "Salvar manutenção",
      initial,
      allowSaveAndAnother: !record,
      devices: getState().devices,
      onSubmit: (payload, mode) => {
        const result = record ? actions.updateMaintenanceRecord(record.id, payload) : actions.addMaintenanceRecord(payload);
        if (!result.ok) {
          toasts.show({ type: "error", title: "Revise os campos da manutenção", message: result.errors.join(" "), timeout: 6800 });
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

  function openBulk() {
    openMaintenanceBulkModal({
      devices: getState().devices,
      onSubmit: (entries) => {
        const created = [];
        const errors = [];
        for (const payload of entries) {
          const result = actions.addMaintenanceRecord(payload);
          if (!result.ok) errors.push(`${normalizeText(payload.equipmentId) || "(sem id)"}: ${result.errors.join(" ")}`);
          else created.push(normalizeText(payload.equipmentId));
        }

        if (errors.length) {
          toasts.show({ type: "error", title: "Algumas manutenções não foram cadastradas", message: errors.join(" • "), timeout: 7800 });
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

  /** @param {MaintenanceRecord} record */
  async function confirmDelete(record) {
    const confirmed = await dialogs.dangerConfirm({
      title: "Excluir esta manutenção?",
      message: "A manutenção sairá do controle. O histórico técnico desta entrada será perdido. Essa ação não pode ser desfeita.",
      details: [
        { label: "Identificador", value: record.equipmentId },
        { label: "Status", value: getMaintenanceStatusLabel(record.status) },
      ],
      confirmLabel: "Excluir manutenção",
    });
    if (!confirmed) return;

    const result = actions.deleteMaintenanceRecord(record.id);
    if (!result.ok) {
      toasts.show({ type: "error", title: "Não foi possível excluir a manutenção", message: result.errors.join(" ") });
      return;
    }
    toasts.show({ type: "success", title: "Manutenção excluída", message: `${record.equipmentId} foi removida do controle de manutenção.`, timeout: 3400 });
    onChange();
  }

  /** @param {MaintenanceRecord} record */
  function openDetails(record) {
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
      ? record.history.map((entry) => `• ${formatDateTime(entry.at)} — ${entry.message}`).join("\n")
      : "Sem eventos registrados.";

    dialogs.alert({ tone: "neutral", title: `Manutenção ${record.equipmentId}`, icon: "wrench", message: `Histórico técnico:\n${historyLines}`, details, confirmLabel: "Fechar" });
  }

  function handleExportCsv() {
    const records = applyFilters(getState().maintenanceRecords, filters);
    if (!records.length) {
      toasts.show({ type: "warning", title: "Nada a exportar", message: "Nenhuma manutenção visível com os filtros atuais. Ajuste os filtros e tente novamente." });
      return;
    }
    downloadBlob(buildCsv(records), "text/csv;charset=utf-8", `manutencao-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  function handleExportJson() {
    downloadBlob(actions.exportMaintenanceData(), "application/json", `manutencao-${new Date().toISOString().slice(0, 10)}.json`);
  }

  /** @param {Event} event */
  function handleImport(event) {
    const input = event.target instanceof HTMLInputElement ? event.target : refs.maintenanceImportFile;
    const [file] = input.files ?? [];
    if (!file) return;

    if (file.size > IMPORT_MAX_BYTES) {
      toasts.show({ type: "error", title: "Arquivo grande demais", message: `O backup excede o limite de ${IMPORT_MAX_BYTES / 1_048_576} MB. Reduza o arquivo e importe novamente.` });
      input.value = "";
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("load", async () => {
      const confirmed = await dialogs.confirm({
        tone: "warning",
        title: "Importar backup de manutenções?",
        message: "As manutenções atuais serão substituídas pelas do arquivo. Rotinas e demais catálogos permanecem intactos.",
        confirmLabel: "Importar manutenções",
      });
      if (!confirmed) {
        input.value = "";
        return;
      }

      const result = actions.importMaintenanceData(String(reader.result ?? ""));
      if (!result.ok) {
        toasts.show({ type: "error", title: "Não foi possível importar o backup", message: result.errors.join(" ") });
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
      toasts.show({ type: "error", title: "Não foi possível ler o arquivo", message: "Verifique se o backup (.json) não está corrompido e tente novamente." });
      input.value = "";
    });
    reader.readAsText(file);
  }

  return { bindEvents, render };
}

/** @param {MaintenanceRecord[]} records @param {Filters} filters @returns {MaintenanceRecord[]} */
function applyFilters(records, filters) {
  let result = filterMaintenance(records, filters.query);
  if (filters.type) {
    const key = normalizeCase(filters.type);
    result = result.filter((r) => normalizeCase(r.type) === key);
  }
  if (filters.status) result = result.filter((r) => r.status === filters.status);
  if (filters.priority) result = result.filter((r) => r.priority === filters.priority);
  return result;
}

/** @param {Filters} filters @returns {boolean} */
function hasActiveFilters(filters) {
  return Boolean(filters.query || filters.type || filters.status || filters.priority);
}

/** @param {MaintenanceRecord[]} records @param {(r: MaintenanceRecord) => boolean} predicate @returns {number} */
function countBy(records, predicate) {
  return records.reduce((acc, record) => acc + (predicate(record) ? 1 : 0), 0);
}
