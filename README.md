# ForgeaX Studio — forgeax-interface

[English](./README.md) · [简体中文](./README.zh-CN.md) · [↑ studio](https://github.com/ForgeaX-Games/forgeax-studio)

> **The Studio UI — a three-column React workspace where you chat with Forge on one side and watch your game render live on the other. Ships as both a web app and a native desktop shell.**

`@forgeax/interface` is the front end of ForgeaX Studio: the React + Vite app served at
**`:18920`** and the Tauri 2 desktop shell that wraps it. It is where the whole experience comes
together — conversation, a live engine preview, and the visual workbench — in one cohesive,
keyboard-driven workspace that talks to the runtime over HTTP / SSE / WebSocket.

## Why it matters

- **Chat and result, side by side.** The right column is **Forge** (agent card, thought process,
  composer); the center is a **live engine preview iframe**; the left holds agent sessions,
  workbench tools, and long-term memory. You describe a game and watch it appear — no context
  switch between "talking to the AI" and "seeing the game."
- **One UI, three views.** A top mode switcher flips the center pane between **Preview** (`⌘1`),
  **Workbench** (`⌘2`), and **Bus** (`⌘3`) while the side columns stay put — so you move between
  playing, editing, and inspecting without losing your place.
- **Web and desktop from one codebase.** The same React app runs in the browser and, via the
  `src-tauri/` Tauri 2 shell, as a native desktop application — no separate desktop UI to
  maintain.
- **A composable shell.** `app-kit.ts` is the AppKit composition entry, so the studio shell is
  assembled rather than hardcoded, leaving room for additional apps to mount into it.
- **White-label ready.** A `brand/` layer injects product name, logo, splash, and accent
  (the signature `#D4FF48`) at startup, and an `i18n/` layer keeps the UI bilingual — the shell
  is themeable without forking it.

## Stack

**Bun** runtime · **Vite 6** dev server · **React 19** + **TypeScript** · **Zustand** state ·
**Radix UI** primitives (dialog / popover / tabs / menus / tooltip …) · **dockview** dockable
panels · **Tailwind** · **lucide-react** icons · **Tauri 2** desktop.

## Architecture (src/)

| Area | Role |
|:--|:--|
| `main.tsx` / `App.tsx` | entry + the three-column shell |
| `store.ts` (Zustand) | UI state: mode / active session / active agent |
| `components/TopBar` | mode switcher (Preview / Workbench / Bus) |
| `components/Sidebar` | agent sessions · workbench tools · long-term memory |
| `components/MainArea` | the live preview iframe / workbench editor |
| `components/ChatPanel` | Forge card · thought process · composer |
| `app-kit.ts` | AppKit composition entry |
| `brand/` · `i18n/` | brand-pack injection · bilingual UI |
| `src-tauri/` | the Tauri 2 native desktop shell |

## Key concepts

Three-column shell (chat ⇄ preview ⇄ tools) · mode switch `⌘1`/`⌘2`/`⌘3` · live engine preview
iframe · HTTP/SSE/WebSocket to the server (`:18900`) · AppKit `app-kit.ts` composition · brand
pack + i18n · Tauri 2 desktop.

## Run (standalone)

```bash
bun install
bun dev            # web UI at http://localhost:18920
bun tauri:dev      # native desktop window onto the same UI
```

In normal use the studio's `start.sh` launches this for you (the server spawns it). Note: the
sibling [`@forgeax/studio`](https://github.com/ForgeaX-Games/forgeax-studio) package is the
product shell that composes this interface into the full studio served at `:18920`.

---

Part of the **ForgeaX Studio** monorepo. This repo is a submodule of
[`ForgeaX-Games/forgeax-studio`](https://github.com/ForgeaX-Games/forgeax-studio) — clone that
with `--recurse-submodules` to run the full studio. License: Apache-2.0.
