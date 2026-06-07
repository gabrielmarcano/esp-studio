# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A cross-platform (macOS · Linux · Windows) desktop IDE for a **MicroPython ESP32/ESP8266**
workflow. It is a VSCode-like shell (sidebar file tree, top toolbar, Monaco editor, output
console) that **wraps the user's existing CLIs** — `mpremote`, `mpy-cross` (via `python -m mpy_cross`),
and `esptool` — rather than reimplementing device tooling. North star: a simplified Android Studio
for MicroPython/ESP.

Read **CONTEXT.md** (current architecture + handoff/status) and **VISION.md** (UX roadmap,
milestones M1–M6) before doing substantial work, especially UI work.

## Commands

```bash
pnpm install          # once (uses pnpm, not npm/yarn)
pnpm tauri dev        # dev window with hot reload (runs Vite on :1420 + Rust)
pnpm tauri build      # production bundle for the current OS
pnpm build            # frontend only: tsc typecheck + vite build
```

Rust was installed via rustup; if cargo isn't on PATH run `source "$HOME/.cargo/env"` first.
There is no test suite or linter configured — the backend is verified by compilation, the
frontend by `tsc` (run via `pnpm build`).

The app shells out to `mpremote`, `mpy_cross`, and `esptool` (install via pip). Device/flash
commands are **wired but not yet hardware-verified** (see CONTEXT.md "Next step" / VISION M1).

## Architecture

The Rust backend is a set of **thin subprocess wrappers**. The single most important rule:
**wrap the user's existing CLIs, don't replace them** — anything that works in their terminal
must work here and vice versa.

```
src-tauri/src/
  lib.rs        # Tauri builder + invoke_handler registration (add new commands here too)
  commands.rs   # ALL backend logic: every #[tauri::command]
src/
  App.tsx       # orchestrator: all state, actions, layout (single component)
  lib/api.ts    # typed invoke() wrappers, one per Rust command
  lib/settings.ts  # Settings type + localStorage load/save
  components/   # Toolbar, FileTree (used for BOTH local & device trees), Editor, *Modal
  App.css       # VSCode-like dark theme
```

### Key conventions

- **Tool paths flow frontend → backend.** Settings live in `localStorage` (frontend) and every
  device/tool command receives the configured binary path as an argument (`s.mpremote`,
  `s.python`, `s.esptool`). This is deliberate: a Finder-launched app has a minimal PATH, so
  bare names like `mpremote` may not resolve — users can set full paths in Settings.
- **Adding a backend command** requires three coordinated edits: write the `#[tauri::command]`
  in `commands.rs`, register it in the `generate_handler!` macro in `lib.rs`, and add a typed
  wrapper in `lib/api.ts`. Commands with many params take a single `args` struct (see
  `flash_firmware` / `new_project`) — invoke arg names must match the Rust param names.
- **`run()` helper** in `commands.rs` runs a subprocess and returns stdout on success or a
  combined stdout+stderr error string on failure. All shell-outs go through it.
- **`device_tree`** returns the device filesystem as a JSON string from a single `mpremote exec`
  walk script; the frontend `JSON.parse`s it. One round-trip, not N.
- **`upload_project`** is a direct port of the user's `roaster/pyroaster/build.py` — it
  compiles subdir `.py`→`.mpy` (entry points `main.py`/`boot.py` stay as source) and uploads
  the whole project.
- **Frontend actions** funnel through `withBusy(label, fn)` in `App.tsx`, which toggles the busy
  state and appends `$ label` / output / `✓ done` (or `✗ error`) to the output console.
- **Open files** carry a `readOnly` flag; `device:`-prefixed paths are read-only device files,
  local paths are editable. ESP32 flash offset is `0x1000` (ESP8266/S3/C3 use `0x0`).
- **Icons use `lucide-react`, never emojis** — see `.claude/rules/ui.md` (auto-loads when editing
  files under `src/`) for the full UI convention.
- **This is Tauri 2, not Electron — never use Electron/Chromium-only APIs.** The frontend runs in
  the OS-native webview (WKWebView on macOS, WebKitGTK on Linux), *not* Chromium, so Chromium-only
  features silently no-op. Always reach for the Tauri-native equivalent and add the matching
  capability permission in `src-tauri/capabilities/default.json`. Examples that bit us:
  window dragging is `data-tauri-drag-region` (+ `core:window:allow-start-dragging`), **not**
  `-webkit-app-region: drag`; dialogs/fs/shell go through `@tauri-apps/plugin-*`, not browser/Node
  APIs. When unsure whether a web API works here, verify against Tauri 2 docs before using it.
