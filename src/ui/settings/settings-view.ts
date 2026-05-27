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
const IMPORT_SUCCESS_MESSAGE = "Dados importados.";

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

    setImportState(true, "Lendo arquivo selecionado...");
    try {
      const rawText = await readFileAsText(file);
      feedback.setFeedback(refs.settingsFeedback, "Validando arquivo JSON...", "info");

      const validation = actions.validateImportData(rawText);
      if (!validation.ok) {
        feedback.showResult(validation, refs.settingsFeedback, IMPORT_SUCCESS_MESSAGE, {
          errorTitle: "Arquivo inválido",
        });
        return;
      }

      feedback.setFeedback(
        refs.settingsFeedback,
        `${file.name} validado. Confirme para substituir os dados locais.`,
        "info",
      );
      const confirmed = await dialogs.confirm({
        tone: "warning",
        title: "Importar dados?",
        message: "A importação substituirá as rotinas, catálogos e configurações locais deste navegador.",
        confirmLabel: "Importar",
      });
      if (!confirmed) {
        feedback.setFeedback(refs.settingsFeedback, "Importação cancelada. Nenhum dado foi alterado.", "info");
        return;
      }

      feedback.setFeedback(refs.settingsFeedback, "Importando dados validados...", "info");
      const result = actions.importData(rawText);
      feedback.showResult(result, refs.settingsFeedback, IMPORT_SUCCESS_MESSAGE, {
        errorTitle: "Não foi possível importar",
        successTitle: "Importação concluída",
      });
      if (result.ok) {
        onImported();
      }
    } catch {
      showImportError("Não foi possível ler o arquivo selecionado.", "Falha na leitura");
    } finally {
      input.value = "";
      setImportState(false);
    }
  }

  async function handleResetData(): Promise<void> {
    const confirmed = await dialogs.textConfirm({
      title: "Apagar dados locais?",
      message:
        "Esta ação remove todas as rotinas, professores, turmas, dispositivos e configurações salvas neste navegador.",
      expectedText: "APAGAR",
      confirmLabel: "Apagar dados",
    });
    if (!confirmed) return;

    const result = actions.resetData();
    feedback.showResult(result, refs.settingsFeedback, "Dados locais apagados.");
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
      title: "Formato inválido",
      message: "Selecione um arquivo JSON (.json) exportado pelo sistema.",
    };
  }
  if (file.size === 0) {
    return {
      title: "Arquivo vazio",
      message: "O arquivo selecionado está vazio.",
    };
  }
  if (file.size > IMPORT_MAX_BYTES) {
    return {
      title: "Arquivo muito grande",
      message: `Arquivo excede o limite de ${IMPORT_MAX_BYTES / 1_048_576} MB permitido para importação.`,
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
