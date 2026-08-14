// @ts-check

// Ponto de entrada: carrega o estado salvo, cria o controller e a UI, e inicia.
// O CSS é carregado pelo index.html; aqui só orquestramos o JavaScript.

import { createAppController } from "./app/controller.js";
import { loadState } from "./persistence/store.js";
import { createUI } from "./ui/create-ui.js";

const controller = createAppController({ initialState: loadState() });

const ui = createUI({
  getState: controller.getState,
  actions: controller.actions,
});

ui.init();
