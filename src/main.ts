import "../assets/css/main.css";
import { createAppController } from "./app/controller";
import { loadState } from "./persistence/store";
import { createUI } from "./ui/create-ui";

const loaded = loadState();

const controller = createAppController({
  initialState: loaded.state,
});

const ui = createUI({
  getState: controller.getState,
  actions: controller.actions,
  initialNotice: loaded.notice,
});

ui.init();
