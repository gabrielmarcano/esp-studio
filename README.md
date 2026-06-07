<h1 align="center">ESPStudio</h1>
<p align="center">A hyper-simplified, cross-platform IDE for MicroPython on ESP32 / ESP8266</p>

<div align="center">

[![tauri](https://img.shields.io/badge/built%20with-Tauri%202-24C8DB?logo=tauri&logoColor=white)](https://tauri.app)
[![react](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![micropython](https://img.shields.io/badge/for-MicroPython-3776AB?logo=micropython)](https://micropython.org/)

</div>

A small desktop app (macOS · Linux · Windows) that wraps the MicroPython workflow:
a VSCode-like layout — sidebar file tree, top toolbar, Monaco editor, output console —
with the device tools (`mpremote`, `mpy-cross`, `esptool`) bundled in, so there's
nothing to install.

## Features

- **Quick start** — scaffold a new project (folder + `git init` + `boot.py`/`main.py`/
  `env.template.py`/`.gitignore`/`README.md`) from your conventions, in one dialog.
- **IDE-like** — browse the project tree, edit with Monaco, **upload the current file
  with one button**, or upload the whole project (with optional `.mpy` cross-compile).
- **Read the device** — list and open the ESP's filesystem (read-only), in one round-trip.
- **Detect & flash** — auto-detect the chip and whether MicroPython is installed, then
  guided-flash a MicroPython `.bin` at the right offset (erase + write via `esptool`).
- **Settings** — optional tool overrides, serial baud, flash offset, firmware path,
  compile toggle — persisted locally.

## Device tools — bundled

ESPStudio bundles the device tools it needs as sidecars, so there's nothing to install:

| Tool | License | Purpose |
|---|---|---|
| `esptool` | GPLv2 | flash MicroPython firmware |
| `mpremote` | MIT | upload / run / read the device filesystem |
| `mpy-cross` | MIT | cross-compile `.py` → `.mpy` on project upload |

Advanced users can point at their own installs via **Settings → Use my own binaries**.
Attributions and sources: [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md).

## Develop

```bash
pnpm install
./scripts/fetch-binaries.sh   # fetch the bundled device tools (once per OS)
pnpm tauri dev                # dev window with hot reload
pnpm tauri build              # production bundle for the current OS
```

The bundled sidecars in `src-tauri/binaries/` are gitignored, so run
`scripts/fetch-binaries.sh` after cloning (and again to refresh tool versions).
Requires Node, pnpm, the Rust toolchain (`rustup`), and Python 3 (for the script).

## Project layout

See [CONTEXT.md](./CONTEXT.md) for the full architecture and a handoff guide
(command list, design decisions, known gaps).
