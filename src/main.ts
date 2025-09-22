import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import type {
  CommandRunPayload,
  CommandRunResult,
} from "./types/command-runner";
import started from "electron-squirrel-startup";
import type {
  ConfigExportPayload,
  ConfigExportResult,
} from "./types/config-exporter";

const exportChannel = "config:export";
const runCommandChannel = "system:run-command";

const handleConfigExport = async (
  event: IpcMainInvokeEvent,
  payload: ConfigExportPayload
): Promise<ConfigExportResult> => {
  if (!payload || typeof payload.content !== "string") {
    return {
      canceled: false,
      error: "导出内容缺失",
    };
  }

  const senderWindow = BrowserWindow.fromWebContents(event.sender);

  try {
    const defaultPath = payload.defaultPath?.trim() || "lottery-config.yaml";
    const options = {
      title: "导出配置",
      defaultPath,
      filters: [
        { name: "YAML 文件", extensions: ["yaml", "yml"] },
        { name: "所有文件", extensions: ["*"] },
      ],
    };

    const result = senderWindow
      ? await dialog.showSaveDialog(senderWindow, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await writeFile(result.filePath, payload.content, "utf-8");

    return {
      canceled: false,
      filePath: result.filePath,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      canceled: false,
      error: message,
    };
  }
};

ipcMain.handle(exportChannel, handleConfigExport);

// 固定运行的命令（已锁定为 date）
const RUN_COMMAND = "date";

const handleRunCommand = async (
  _event: IpcMainInvokeEvent,
  payload: CommandRunPayload
): Promise<CommandRunResult> => {
  try {
    if (!payload || typeof payload.command !== "string") {
      return { code: null, stdout: "", stderr: "", error: "缺少命令" };
    }
    // 忽略传入 payload.command，统一执行 RUN_COMMAND
    const cmd = RUN_COMMAND;
    const args: string[] = [];
    return await new Promise<CommandRunResult>((resolve) => {
      const child = spawn(cmd, args, { shell: false });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      let settled = false;
      const timeout = payload.timeoutMs
        ? setTimeout(() => {
            if (!settled) {
              settled = true;
              child.kill();
              resolve({
                code: null,
                signal: null,
                stdout,
                stderr,
                error: "执行超时",
              });
            }
          }, payload.timeoutMs)
        : null;
      child.on("close", (code, signal) => {
        if (settled) return;
        if (timeout) clearTimeout(timeout);
        settled = true;
        resolve({ code, signal, stdout, stderr });
      });
      child.on("error", (err) => {
        if (settled) return;
        if (timeout) clearTimeout(timeout);
        settled = true;
        resolve({ code: null, stdout, stderr, error: err.message });
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { code: null, stdout: "", stderr: "", error: message };
  }
};

ipcMain.handle(runCommandChannel, handleRunCommand);

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`)
    );
  }

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on("ready", createWindow);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
