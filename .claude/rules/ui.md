---
description: UI conventions for the React frontend
paths:
  - "src/**"
---

# UI conventions

## Icons & glyphs — no emojis

**Never use emojis or decorative Unicode glyphs in the UI.** This includes buttons,
the file tree, tabs, the toolbar, badges, and console/log output strings.

- For iconography, use **`lucide-react`** components (`import { Save } from "lucide-react"`),
  sized explicitly (e.g. `size={14}` in the toolbar, `size={13}` in the tree). Icons inherit
  `currentColor`, so they pick up the theme automatically.
- For status in **console/log text**, use plain words (`done`, `error:`), not symbols like
  `✓`/`✗`/`●`.
- Typographic punctuation is fine and not considered an emoji: `·` (separator), `—` (em dash),
  `…` (ellipsis), `→` (transformation arrow). Use them where they read well.

## Why
The app's north star is a polished, professional IDE (a simplified Android Studio — see
VISION.md). Emoji icons render inconsistently across platforms and look unprofessional; a real
icon set gives consistent sizing, color, and weight.

## Webview is WKWebView/WebKitGTK, not Chromium

This is a Tauri 2 app — the frontend runs in the OS-native webview, so **Chromium/Electron-only
CSS and JS silently do nothing**. Use Tauri-native equivalents (see CLAUDE.md for the full rule).
- Window dragging: the `data-tauri-drag-region` attribute on non-interactive elements, **not**
  `-webkit-app-region: drag` (no-ops in WKWebView). Keep it off buttons/`select` so they stay clickable.
- Be cautious with bleeding-edge CSS; prefer features WebKit + WebKitGTK both support.
