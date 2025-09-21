# Repository Guidelines

## Project Structure & Module Organization
项目为 Electron + Vite + TypeScript。核心代码在 `src/`：`main.ts` 负责主进程，`preload.ts` 暴露安全桥接，`renderer.ts` 与 `index.html` 负责渲染层，样式集中在 `index.css`。构建配置集中在 `forge.config.ts` 与 `vite.*.config.ts`。打包后的产物会写入 `out/`（临时文件）与 `.vite/`（由 Vite 生成），请勿提交这两个目录。环境类型声明位于 `forge.env.d.ts`。

## Build, Test, and Development Commands
推荐使用 `pnpm`：`pnpm dev` 启动带热更新的开发窗口，`pnpm package` 生成平台安装包，`pnpm make` 触发 Forge maker（产出 `out/make/` 下的安装文件），`pnpm publish` 走 Forge GitHub 发布流程。`pnpm lint` 使用 ESLint 检查 TypeScript/Preload/Renderer 代码。首次贡献前运行 `pnpm install` 同步依赖。

## Coding Style & Naming Conventions
采用 TypeScript，统一使用 2 空格缩进和双引号字符串；文件名保持小写横线分隔（例如 `new-feature.ts`）。模块出口使用具名导出，避免默认导出。ESLint 配合 `@typescript-eslint` 规则；提交前确保 `pnpm lint` 通过。如需格式化，请参考项目已有风格或本地另行配置 Prettier，但勿覆盖现有 ESLint 约束。

## Testing Guidelines
当前未集成自动化测试框架；新增功能请至少提供可复现步骤并在 PR 描述中列出手动验证命令（如 `pnpm dev` 启动后操作路径）。如添加测试，优先使用 Vitest/Vitest Electron 结合，并将文件命名为 `*.spec.ts` 存放在 `src/__tests__/`。请在后续 PR 中更新此节说明覆盖率目标。

## Commit & Pull Request Guidelines
遵循简洁、类 Conventional Commit 风格（现有历史多为 `chore: update`）；建议使用前缀如 `feat:`, `fix:`, `docs:` 等概括变更。提交前确保工作树干净，PR 描述中需列出关键改动、测试结果、相关 issue 链接及必要截图（UI 变更时）。合并前等待 CI（构建、lint）全部通过。

## Release & Configuration Notes
打包或发布需在本地或 CI 设置环境变量支持签名（例如 Windows Squirrel 证书、macOS notarization）。若在 GitHub Actions 中运行，请在项目 Secrets 中配置 `GH_TOKEN` 等凭据，并适时清理 `out/` 中的旧二进制文件。
