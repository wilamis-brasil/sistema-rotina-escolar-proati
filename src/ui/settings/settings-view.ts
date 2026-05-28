import type { AppActions } from "../../app/controller";
import { IMPORT_MAX_BYTES } from "../../domain/limits";
import type { DialogManager } from "../dialogs";
import type { FeedbackPresenter } from "../ui-feedback";
import type { UIRefs } from "../ui-refs";

type SettingsRefs = Pick<
  UIRefs,
  "settingsFeedback" | "exportDataButton" | "importDataTrigger" | "importDataFile" | "resetDataButton"
>;

interface SettingsView {
  bindEvents(): void;
}

const JSON_MIME_TYPES = new Set(["application/json", "text/json"]);
const IMPORT_SUCCESS_MESSAGE = "Backup importado. Dados locais atualizados.";

export function createSettingsView({
  refs,
  actions,
  dialogs,
  feedback,
  onResetData,
  onImported,
}: {
  refs: SettingsRefs;
  actions: AppActions;
  dialogs: DialogManager;
  feedback: FeedbackPresenter;
  onResetData: () => void;
  onImported: () => void;
}): SettingsView {
  let importInProgress = false;

  function bindEvents(): void {
    refs.exportDataButton.addEventListener("click", handleExport);
    refs.importDataTrigger.addEventListener("click", handleImportTrigger);
    refs.importDataFile.addEventListener("change", (event) => {
      void handleImport(event);
    });
    refs.resetDataButton.addEventListener("click", handleResetData);
  }

  function handleExport(): void {
    const blob = new Blob([actions.exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sistema-rotina-escolar-proati-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function handleImportTrigger(): void {
    if (importInProgress) return;
    refs.importDataFile.click();
  }

  async function handleImport(event: Event): Promise<void> {
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
        feedback.showResult(validation, refs.settingsFeedback, IMPORT_SUCCESS_MESSAGE, {
          errorTitle: "Backup inválido",
        });
        return;
      }

      feedback.setFeedback(
        refs.settingsFeedback,
        `${file.name} validado. Confirme para substituir os dados locais deste navegador.`,
        "info",
      );
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
      if (result.ok) {
        onImported();
      }
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

  async function handleResetData(): Promise<void> {
    const confirmed = await dialogs.textConfirm({
      title: "Apagar todos os dados locais?",
      message:
        "Rotinas, professores, turmas, equipamentos, manutenções e configurações deste navegador serão removidos. Essa ação não pode ser desfeita - exporte um backup antes de continuar.",
      expectedText: "APAGAR",
      confirmLabel: "Apagar dados locais",
    });
    if (!confirmed) return;

    const result = actions.resetData();
    feedback.showResult(result, refs.settingsFeedback, "Dados locais apagados deste navegador.", {
      successTitle: "Dados locais apagados",
    });
    onResetData();
  }

  function setImportState(active: boolean, message?: string): void {
    importInProgress = active;
    refs.importDataTrigger.disabled = active;
    refs.importDataTrigger.classList.toggle("is-loading", active);
    refs.importDataTrigger.setAttribute("aria-busy", active ? "true" : "false");
    if (message) {
      feedback.setFeedback(refs.settingsFeedback, message, "info");
    }
  }

  function showImportError(message: string, title: string): void {
    feedback.showResult(
      { ok: false, errors: [message] },
      refs.settingsFeedback,
      IMPORT_SUCCESS_MESSAGE,
      { errorTitle: title },
    );
  }

  return { bindEvents };
}

function validateSelectedFile(file: File): { title: string; message: string } | null {
  if (!isJsonFile(file)) {
    return {
      title: "Formato não suportado",
      message: "Selecione um arquivo de backup (.json) exportado pelo Sistema de Rotina Escolar PROATI.",
    };
  }
  if (file.size === 0) {
    return {
      title: "Backup vazio",
      message: "O arquivo selecionado está vazio. Exporte um novo backup e tente novamente.",
    };
  }
  if (file.size > IMPORT_MAX_BYTES) {
    return {
      title: "Backup grande demais",
      message: `O arquivo excede o limite de ${IMPORT_MAX_BYTES / 1_048_576} MB. Reduza o backup e importe novamente.`,
    };
  }
  return null;
}

function isJsonFile(file: File): boolean {
  const name = file.name.trim().toLowerCase();
  return name.endsWith(".json") || JSON_MIME_TYPES.has(file.type);
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Falha ao ler arquivo.")));
    reader.readAsText(file);
  });
}
