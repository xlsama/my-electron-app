export interface ConfigExportPayload {
  content: string;
  defaultPath?: string;
}

export interface ConfigExportResult {
  canceled: boolean;
  filePath?: string;
  error?: string;
}

export interface ConfigExporter {
  exportYaml: (payload: ConfigExportPayload) => Promise<ConfigExportResult>;
}

declare global {
  interface Window {
    configExporter?: ConfigExporter;
  }
}
