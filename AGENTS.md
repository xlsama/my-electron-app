# Repository Guidelines

## 项目结构与模块组织
- 代码主体位于 `src/`：`main.ts` 管理 Electron 主进程，`preload.ts` 提供受控桥接，`renderer.ts` 与 `index.html` 负责渲染 UI，样式集中在 `index.css`。
- 构建配置集中在 `forge.config.ts`、`vite.main.config.ts`、`vite.preload.config.ts` 与 `vite.renderer.config.mjs`，按进程维度拆分。
- 临时输出写入 `out/` 与 `.vite/`，二者不应提交；类型与自动导入声明在 `forge.env.d.ts`、`auto-imports.d.ts`、`components.d.ts`。

## 构建、测试与开发命令
- `pnpm install`：首次或依赖变更后同步依赖。
- `pnpm dev`：运行带热更新的调试窗口，用于快速验证 UI 与主进程交互。
- `pnpm package`：生成本地安装包；`pnpm make` 触发 Forge maker 产出 `out/make/` 安装文件。
- `pnpm lint`：执行 ESLint + `@typescript-eslint` 规则；`pnpm publish` 走 Electron Forge GitHub 发布流程。

## 编码风格与命名约定
- 统一使用 TypeScript、2 空格缩进、双引号字符串，禁止混用；禁止默认导出，保持具名导出便于静态分析。
- 文件命名采用 `kebab-case`（例：`user-menu.ts`），组件/钩子等保持语义清晰。
- 提交前保证 ESLint 无警告；如需格式化，遵循现有风格，勿覆盖既有配置。

## 测试指南
- 当前未集成自动化测试；新增功能需在 PR 描述列出手动验证路径（示例：运行 `pnpm dev` 后的交互步骤）。
- 若补充单测，优先使用 Vitest + Electron 环境，文件放置于 `src/__tests__/`，命名 `*.spec.ts`。
- 建议在测试脚本中模拟 Ipc 通道及关键渲染逻辑，保持测试独立无外部状态依赖。

## 提交与 PR 规范
- 提交信息遵循类 Conventional Commit 风格（`feat:`, `fix:`, `docs:` 等）；一次提交专注单一目标。
- PR 描述需列出关键改动、验证结果、相关 issue；涉及 UI 变更附带截图或录屏。
- 合并前确认工作树干净、`pnpm lint` 通过，并等待 CI 构建完成；避免将生成物与敏感凭据纳入版本库。

## 安全与配置提示
- 本地或 CI 打包需配置签名证书与 `GH_TOKEN` 等凭据；将密钥放入安全存储而非源码库。
- 清理 `out/` 旧产物防止混淆；提交前再次确认 `.env`、临时日志未被纳入版本控制。
