# ForgeaX Studio — forgeax-interface

[English](./README.md) · [简体中文](./README.zh-CN.md) · [↑ studio](https://github.com/ForgeaX-Games/forgeax-studio)

> **Studio 界面 —— 一个三栏式 React 工作区:一侧跟 Forge 聊天,另一侧实时看着你的游戏渲染出来。既是 Web 应用,也是原生桌面外壳。**

`@forgeax/interface` 是 ForgeaX Studio 的前端:在 **`:18920`** 提供服务的 React + Vite 应用,以及
包裹它的 Tauri 2 桌面外壳。整套体验在这里汇聚——对话、实时引擎预览、可视化 workbench——构成一个
连贯、键盘驱动的工作区,通过 HTTP / SSE / WebSocket 与运行时通信。

## 它为何重要

- **聊天与结果并排。** 右栏是 **Forge**(agent 卡、思考过程、输入框);中栏是**实时引擎预览
  iframe**;左栏放 agent 会话、workbench 工具与长期记忆。你描述一个游戏,就看着它出现——无需在
  「跟 AI 对话」和「看游戏」之间来回切换。
- **一个 UI,三种视图。** 顶部模式切换把中栏在 **Preview**(`⌘1`)、**Workbench**(`⌘2`)、
  **Bus**(`⌘3`)之间翻转,而两侧栏保持不动——于是你在游玩、编辑、检视之间移动而不丢失位置。
- **一份代码,Web 与桌面通吃。** 同一个 React 应用既跑在浏览器里,也通过 `src-tauri/` 的 Tauri 2
  外壳作为原生桌面应用运行——无需维护单独的桌面 UI。
- **可组装的外壳。** `app-kit.ts` 是 AppKit 组装入口,studio 外壳是被「组装」出来的而非写死的,
  为更多 app 挂载进来留出空间。
- **白标就绪。** `brand/` 层在启动时注入产品名、logo、splash 与强调色(标志性的 `#D4FF48`),
  `i18n/` 层保持 UI 双语——外壳无需 fork 即可换肤。

## 技术栈

**Bun** 运行时 · **Vite 6** 开发服务器 · **React 19** + **TypeScript** · **Zustand** 状态 ·
**Radix UI** 原语(dialog / popover / tabs / menu / tooltip …)· **dockview** 可停靠面板 ·
**Tailwind** · **lucide-react** 图标 · **Tauri 2** 桌面。

## 架构(src/)

| 区域 | 职责 |
|:--|:--|
| `main.tsx` / `App.tsx` | 入口 + 三栏外壳 |
| `store.ts`(Zustand) | UI 状态:mode / 当前会话 / 当前 agent |
| `components/TopBar` | 模式切换(Preview / Workbench / Bus) |
| `components/Sidebar` | agent 会话 · workbench 工具 · 长期记忆 |
| `components/MainArea` | 实时预览 iframe / workbench 编辑器 |
| `components/ChatPanel` | Forge 卡 · 思考过程 · 输入框 |
| `app-kit.ts` | AppKit 组装入口 |
| `brand/` · `i18n/` | brand pack 注入 · 双语 UI |
| `src-tauri/` | Tauri 2 原生桌面外壳 |

## 关键概念

三栏外壳(聊天 ⇄ 预览 ⇄ 工具)· 模式切换 `⌘1`/`⌘2`/`⌘3` · 实时引擎预览 iframe · 经
HTTP/SSE/WebSocket 连 server(`:18900`)· AppKit `app-kit.ts` 组装 · brand pack + i18n ·
Tauri 2 桌面。

## 运行(独立)

```bash
bun install
bun dev            # Web UI 在 http://localhost:18920
bun tauri:dev      # 指向同一 UI 的原生桌面窗口
```

正常使用下,studio 的 `start.sh` 会替你启动它(由 server 拉起)。注:同级的
[`@forgeax/studio`](https://github.com/ForgeaX-Games/forgeax-studio) 包是把本 interface 组装成
完整 studio(在 `:18920` 提供服务)的产品外壳。

---

本仓是 **ForgeaX Studio** 的一个子模块,隶属
[`ForgeaX-Games/forgeax-studio`](https://github.com/ForgeaX-Games/forgeax-studio) ——
用 `--recurse-submodules` 克隆超级仓即可运行完整 studio。许可:Apache-2.0。
