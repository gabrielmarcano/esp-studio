<h1 align="center">⚡ esp-studio</h1>
<p align="center">A hyper-simplified, cross-platform IDE for MicroPython on ESP32 / ESP8266</p>

<div align="center">

[![tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![react](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![micropython](https://img.shields.io/badge/for-MicroPython-3776AB?logo=micropython)](https://micropython.org/)

</div>

A small desktop app (macOS · Linux · Windows) that wraps the MicroPython workflow:
a VSCode-like layout — sidebar file tree, top toolbar, Monaco editor, output console —
on top of the tools you already use: `mpremote`, `mpy-cross`, and `esptool`.

## Features

- **Quick start** — scaffold a new project (folder + `git init` + `boot.py`/`main.py`/
  `env.template.py`/`.gitignore`/`README.md`) from your conventions, in one dialog.
- **IDE-like** — browse the project tree, edit with Monaco, **upload the current file
  with one button**, or upload the whole project (with optional `.mpy` cross-compile).
- **Read the device** — list and open the ESP's filesystem (read-only), in one round-trip.
- **Flash firmware** — erase + write a MicroPython `.bin` via `esptool`.
- **Settings** — tool paths, serial baud, flash offset, firmware path, compile toggle —
  persisted locally.

## Requirements

These CLIs must be installed (the app shells out to them):

| Tool | Install |
|---|---|
| `mpremote` | `pip install mpremote` |
| `mpy_cross` | `pip install mpy-cross` (only for project compile-on-upload) |
| `esptool` | `pip install esptool` (only for flashing) |

If the app can't find them (e.g. launched from Finder with a minimal PATH), set their
**full paths** in Settings (e.g. `~/.local/bin/mpremote`).

## Develop

```bash
pnpm install
pnpm tauri dev        # dev window with hot reload
pnpm tauri build      # production bundle for the current OS
```

Requires Node, pnpm, and the Rust toolchain (`rustup`).

## Project layout

See [CONTEXT.md](./CONTEXT.md) for the full architecture and a handoff guide
(command list, design decisions, known gaps).
