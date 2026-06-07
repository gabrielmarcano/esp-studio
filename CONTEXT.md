# esp-studio — Context & Handoff

> Read this first if you're an agent (or human) picking up this project.
> Last updated: 2026-06-07.

## What this is

A cross-platform (macOS + Linux, Windows as a bonus) desktop IDE for the
owner's **MicroPython ESP32/ESP8266** workflow. It does **not** reinvent device
tooling — it wraps the CLIs the owner already uses.

**Product north star: a simplified Android Studio for MicroPython/ESP.** The current
build is a working VSCode-like shell (sidebar tree, toolbar, Monaco, output console);
the target experience — dockable tool windows, editor tabs, a device/target selector,
a Serial Monitor "Logcat", a status bar, and a polished UX iterated every session —
is specified in **[VISION.md](./VISION.md)**. Read it before doing UI work.

## The owner's actual ESP32 workflow (what this app automates)

Discovered from the sibling projects in `/Users/gabriel/Code/iot/` (esp-distance,
esp-doorbell, esp-mqtt-wol-proxy, roaster):

- **MicroPython**, not C/Arduino.
- **`mpremote`** — the core device tool (installed at `~/.local/bin/mpremote`):
  - `mpremote connect list` — list serial ports
  - `mpremote connect <port> fs cp main.py :` — upload a file
  - `mpremote connect <port> fs ls/cat/rm` — device filesystem ops
  - `mpremote connect <port> run <file>` — run a script live
- **`mpy-cross`** via the `mpy_cross` Python module — cross-compiles `.py` → `.mpy`
  (used for library/driver files; entry points like `main.py`/`boot.py` stay as source).
- **`esptool`** — flashes MicroPython firmware (`.bin`). ESP32 offset `0x1000`.
- **WebREPL** — wireless REPL, started in `boot.py`.
- Conventions: `boot.py` (WiFi + WebREPL) + `main.py` (app); secrets in
  `env.py`/`secrets.py` are gitignored with committed `*.template.py`/`*.example.py`;
  bigger projects use `lib/` + `drivers/` + vendored frameworks.
- The owner's most evolved setup is `roaster/pyroaster/build.py` — the
  `upload_project` Rust command is a direct port of its compile+upload logic.

## Stack (decided with the owner)

- **Tauri 2** (Rust backend, native WebView) — chosen over Electron (10x smaller/faster)
  and over a pure-Python GUI (worse editor). Owner already knows React (Expo app).
- **React 19 + TypeScript + Vite** frontend.
- **Monaco** (`@monaco-editor/react`) — the editor (same engine as VSCode).
- **Settings live in `localStorage`** (frontend), passed to every Rust command —
  so configured tool paths work even when the app is launched from Finder (minimal PATH).

## Architecture

The Rust side is a set of thin subprocess wrappers. Every device/tool command takes the
tool path as an argument (frontend supplies it from settings).

```
src-tauri/src/
  lib.rs        # Tauri builder + invoke_handler registration
  commands.rs   # ALL backend logic (see command list below)
src/
  App.tsx                    # orchestrator: state, actions, layout
  lib/api.ts                 # typed invoke() wrappers
  lib/settings.ts            # Settings type + localStorage load/save
  components/
    Toolbar.tsx              # top buttons + port selector
    FileTree.tsx             # recursive tree (used for LOCAL and DEVICE)
    Editor.tsx               # Monaco wrapper
    SettingsModal.tsx
    NewProjectModal.tsx
  App.css                    # VSCode-like dark theme
```

### Rust commands (`commands.rs`)

| Command | Wraps | Purpose |
|---|---|---|
| `read_dir` / `read_file` / `write_file` | std::fs | local file tree + open/save |
| `list_ports` | `mpremote connect list` | populate port dropdown |
| `device_tree` | `mpremote ... exec <walk script>` | JSON tree of device fs in one round-trip |
| `device_read` | `mpremote ... fs cat :path` | open device file (read-only) |
| `device_delete` | `mpremote ... fs rm :path` | delete on device |
| `upload_file` | `mpremote ... fs cp <local> :` | single-button upload |
| `run_file` | `mpremote ... run <local>` | run without persisting |
| `reset_device` | `mpremote ... reset` | soft reset |
| `upload_project` | port of `build.py` | compile subdir `.py`→`.mpy` + upload whole project |
| `flash_firmware` | `esptool erase-flash` + `write-flash` | flash MicroPython `.bin` |
| `new_project` | std::fs + `git init` | scaffold folder + template + README + .gitignore |

Templates in `new_project`: `"wifi"` (boot.py WiFi+WebREPL, main.py, env.template.py)
and `"blink"` (main.py only). Both get `.gitignore` + `README.md`.

## How to run

```bash
source "$HOME/.cargo/env"      # Rust was installed via rustup
cd /Users/gabriel/Code/iot/esp-studio
pnpm install                   # once
pnpm tauri dev                 # dev window with hot reload
pnpm tauri build               # production .app / .dmg (and Linux/Windows on those OSes)
```

Prerequisites already present on this machine: Node 22, pnpm 11, Rust 1.96 (rustup),
Xcode CLT, and the device tools (`mpremote`, `mpy_cross`, `esptool`).

## Status

- [x] Phase 0 — Rust + Tauri scaffold, builds & runs
- [x] Phase 1 — UI shell: toolbar + sidebar + Monaco editing local files
- [x] Phase 2 — device bridge: ports, device tree, read, upload, run, reset
- [x] Phase 3 — quick-start (new project wizard) + firmware flash
- [x] Phase 4 — settings modal, persisted to localStorage

### Next step (start here)

**M1 in [VISION.md](./VISION.md): hardware-true core.** All device/flash commands are
wired but verified by compilation only. Plug in a real ESP32, validate every
`mpremote`/`esptool` call end-to-end, and fix whatever differs from assumptions before
building more UI. Then proceed through the M2+ UX milestones in VISION.md.

### Not done / known gaps / next ideas

- **No hardware test yet** — see "Next step" above.
- **Finder PATH**: defaults are bare names (`mpremote`, `esptool`, `python3`). If a
  packaged app can't find them, set full paths in Settings (e.g. `~/.local/bin/mpremote`).
- No serial REPL/monitor terminal yet (only one-shot command output in the console panel).
- No file create/rename/delete from the local tree UI (only open + save).
- `upload_project` mkdir on device ignores "already exists" errors by design.
- App icons are still the Tauri defaults.
- Not yet a git repo (the iot parent folder is not a git repo).

## Why decisions were made

See [DECISIONS.md](./DECISIONS.md) if present, otherwise the "Stack" section above.
The single most important principle: **wrap the owner's existing CLIs, don't replace
them** — so anything that works in their terminal works here, and vice versa.
