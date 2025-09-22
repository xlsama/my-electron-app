export interface CommandRunPayload {
  command: string; // base command, e.g. 'date'
  args?: string[]; // optional arguments
  timeoutMs?: number; // optional kill timeout
}

export interface CommandRunResult {
  code: number | null; // exit code or null if killed
  signal?: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  error?: string; // populated when spawn itself failed
}

export interface CommandRunner {
  run: (payload: CommandRunPayload) => Promise<CommandRunResult>;
}

declare global {
  interface Window {
    commandRunner?: CommandRunner;
  }
}
