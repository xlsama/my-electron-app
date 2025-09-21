import { contextBridge, ipcRenderer } from "electron";
import type {
  ConfigExportPayload,
  ConfigExportResult,
  ConfigExporter,
} from "./types/config-exporter";

const channel = "config:export";

const configExporter: ConfigExporter = {
  exportYaml: (payload: ConfigExportPayload) =>
    ipcRenderer.invoke(channel, payload) as Promise<ConfigExportResult>,
};

contextBridge.exposeInMainWorld("configExporter", configExporter);
