import { IMPORT_MAX_BYTES } from "../../domain/limits.js";

/** @typedef {import("../../domain/types.js").AppState} AppState */

const JSON_MIME_TYPES = new Set(["application/json", "text/json"]);
const IMPORT_SUCCESS_MESSAGE = "Backup importado. Dados locais atualizados.";

/**
 * Configurações locais: exportar/importar backup (.json) e apagar dados.
 * @param {{ refs: any, actions: any, dialogs: any, feedback: any, onResetData: () => void, onImported: () => void }} deps
 */
export function createSettingsView({ refs, actions, dialogs, feedback, onResetData, onImported }) {
  let importInProgress = false;

  function bindEvents() {
    refs.exportDataButton.addEventListener("click", handleExport);
    refs.importDataTrigger.addEventListener("click", handleImportTrigger);
    refs.importDataFile.addEventListener("change", (event) => void handleImport(event));
    refs.resetDataButton.addEventListener("click", handleResetData);
  }

  function handleExport() {
    const blob = new Blob([actions.exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sistema-rotina-escolar-proati-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function handleImportTrigger() {
    if (importInProgress) return;
    refs.importDataFile.click();
  }

  /** @param {Event} event */
  async function handleImport(event) {
    const input = event.target instanceof HTMLInputElement ? event.target : refs.importDataFile;
    const [file] = input.files ?? [];
    if (!file) return;

    if (importInProgress) {
      input.value = "";
      return;
    }

    const fileError = validateSelectedFile(file);
    if (fileError) {
      showImportError(fileError.message, fileError.title);
      input.value = "";
      return;
    }

    setImportState(true, "Lendo o backup selecionado...");
    try {
      const rawText = await readFileAsText(file);
      feedback.setFeedback(refs.settingsFeedback, "Validando o backup (.json)...", "info");

      const validation = actions.validateImportData(rawText);
      if (!validation.ok) {
        feedback.showResult(validation, refs.settingsFeedback, IMPORT_SUCCESS_MESSAGE, { errorTitle: "Backup inválido" });
        return;
      }

      feedback.setFeedback(refs.settingsFeedback, `${file.name} validado. Confirme para substituir os dados locais deste navegador.`, "info");
      const confirmed = await dialogs.confirm({
        tone: "warning",
        title: "Importar backup e substituir dados locais?",
        message:
          "Rotinas, catálogos e configurações deste navegador serão substituídos pelo conteúdo do arquivo. Exporte um backup atual antes de continuar se quiser preservá-lo.",
        confirmLabel: "Importar backup",
      });
      if (!confirmed) {
        feedback.setFeedback(refs.settingsFeedback, "Importação cancelada. Nenhum dado foi alterado.", "info");
        return;
      }

      feedback.setFeedback(refs.settingsFeedback, "Aplicando o backup validado...", "info");
      const result = actions.importData(rawText);
      feedback.showResult(result, refs.settingsFeedback, IMPORT_SUCCESS_MESSAGE, {
        errorTitle: "Não foi possível importar o backup",
        successTitle: "Backup importado",
      });
      if (result.ok) onImported();
    } catch {
      showImportError(
        "Não foi possível ler o backup selecionado. Verifique se o arquivo .json não está corrompido.",
        "Não foi possível ler o backup",
      );
    } finally {
      input.value = "";
      setImportState(false);
    }
  }

  async function handleResetData() {
    const confirmed = await dialogs.textConfirm({
      title: "Apagar todos os dados locais?",
      message:
        "Rotinas, professores, turmas, equipamentos, manutenções e configurações deste navegador serão removidos. Essa ação não pode ser desfeita - exporte um backup antes de continuar.",
      expectedText: "APAGAR",
      confirmLabel: "Apagar dados locais",
    });
    if (!confirmed) return;

    const result = actions.resetData();
    feedback.showResult(result, refs.settingsFeedback, "Dados locais apagados deste navegador.", { successTitle: "Dados locais apagados" });
    onResetData();
  }

  /** @param {boolean} active @param {string} [message] */
  function setImportState(active, message) {
    importInProgress = active;
    refs.importDataTrigger.disabled = active;
    refs.importDataTrigger.classList.toggle("is-loading", active);
    refs.importDataTrigger.setAttribute("aria-busy", active ? "true" : "false");
    if (message) feedback.setFeedback(refs.settingsFeedback, message, "info");
  }

  /** @param {string} message @param {string} title */
  function showImportError(message, title) {
    feedback.showResult({ ok: false, errors: [message] }, refs.settingsFeedback, IMPORT_SUCCESS_MESSAGE, { errorTitle: title });
  }

  return { bindEvents };
}

/** @param {File} file @returns {{ title: string, message: string } | null} */
function validateSelectedFile(file) {
  if (!isJsonFile(file)) {
    return { title: "Formato não suportado", message: "Selecione um arquivo de backup (.json) exportado pelo Sistema de Rotina Escolar PROATI." };
  }
  if (file.size === 0) {
    return { title: "Backup vazio", message: "O arquivo selecionado está vazio. Exporte um novo backup e tente novamente." };
  }
  if (file.size > IMPORT_MAX_BYTES) {
    return { title: "Backup grande demais", message: `O arquivo excede o limite de ${IMPORT_MAX_BYTES / 1_048_576} MB. Reduza o backup e importe novamente.` };
  }
  return null;
}

/** @param {File} file @returns {boolean} */
function isJsonFile(file) {
  const name = file.name.trim().toLowerCase();
  return name.endsWith(".json") || JSON_MIME_TYPES.has(file.type);
}

/** @param {File} file @returns {Promise<string>} */
function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Falha ao ler arquivo.")));
    reader.readAsText(file);
  });
}
