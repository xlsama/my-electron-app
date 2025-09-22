import { contextBridge, ipcRenderer } from "electron";
import type {
  ConfigExportPayload,
  ConfigExportResult,
  ConfigExporter,
} from "./types/config-exporter";
import type {
  CommandRunPayload,
  CommandRunResult,
  CommandRunner,
} from "./types/command-runner";

const channel = "config:export";
const runCommandChannel = "system:run-command";

const configExporter: ConfigExporter = {
  exportYaml: (payload: ConfigExportPayload) =>
    ipcRenderer.invoke(channel, payload) as Promise<ConfigExportResult>,
};

contextBridge.exposeInMainWorld("configExporter", configExporter);

const commandRunner: CommandRunner = {
  run: (payload: CommandRunPayload) =>
    ipcRenderer.invoke(runCommandChannel, payload) as Promise<CommandRunResult>,
};

contextBridge.exposeInMainWorld("commandRunner", commandRunner);
