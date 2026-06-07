# esp-studio — Vision & Roadmap

> Product direction and UX north star. Read alongside [CONTEXT.md](./CONTEXT.md)
> (which covers the *current* architecture). Last updated: 2026-06-07.

## North star

**A simplified Android Studio, for MicroPython on ESP boards.**

Android Studio's strength is a calm, dockable, IDE-grade shell where the device,
the code, and the run/output flow all live in one window without clutter. esp-studio
should feel like that — but stripped to exactly what an ESP + MicroPython workflow
needs, nothing more. The owner already lives in `mpremote`/`mpy-cross`/`esptool`;
this app is the polished cockpit around them.

Principle: **the UI is a first-class deliverable, iterated continuously.** We ship a
working layout, then refine UX every session. Wrapping the owner's existing CLIs stays
the architectural rule (see CONTEXT.md) — the vision is about the *experience* on top.

## The Android Studio layout, mapped to esp-studio

```
┌───────────────────────────────────────────────────────────────────────┐
│  Main toolbar:  ⚡esp-studio   [▾ device ▾]  ▶Run  ⬆Upload  ⚡Flash  ⚙   │  ← target/run controls, like AS's device picker + run bar
├──┬────────────────────────────────────────────────────────────────────┤
│P │ ┌ main.py ✕ ┌ boot.py ✕ ┌ device:/main.py ✕  (editor TABS)          │
│r │ ────────────────────────────────────────────────────────────────── │
│o │                                                                      │
│j │                    Monaco editor (tabbed)                            │
│e │                                                                      │
│c │                                                                      │
│t │                                                                      │
├──┴────────────────────────────────────────────────────────────────────┤
│ [Serial Monitor] [Build/Output] [Problems]      ← bottom tool windows   │  ← like AS's Logcat / Build / Terminal
│ >>> REPL / streamed device output                                       │
├───────────────────────────────────────────────────────────────────────┤
│ Status bar:  ● connected /dev/cu.usbserial-100 · ESP32 · 1.27.0 · Ln 4  │  ← like AS's status bar
└───────────────────────────────────────────────────────────────────────┘
   ↑ left/bottom tool-window stripes with icons to toggle panels (P = Project)
```

Key Android-Studio-isms to adopt (simplified):

1. **Dockable, toggleable tool windows** — Project (left), Serial Monitor / Build /
   Problems (bottom). Each has a stripe icon button; collapsible to maximize the editor.
2. **Editor tabs** — multiple open files, including read-only `device:` tabs, with a
   dirty indicator and middle-click / ✕ to close. (Today: single open file — first upgrade.)
3. **Device/target selector in the toolbar** — like AS's device dropdown: shows the
   selected port + detected chip, with a connection status dot.
4. **A real run/output flow** — "Run" streams live device output into a Serial Monitor
   panel (like Logcat), not just one-shot command results.
5. **Status bar** — persistent connection state, board info, firmware version, cursor
   position, save state.
6. **Command palette** (later) — ⌘K / ⌘⇧P for all actions, very IDE-native.
7. **Polished theming** — a refined dark theme (Darcula-like) now; light theme later;
   consistent spacing, icons, and motion. UX gets a deliberate pass every milestone.

## Roadmap (milestones)

Phases 0–4 (scaffold + core features) are **done** — see CONTEXT.md status. From here
the work is UX-led, in shippable milestones. Reorder freely as priorities shift.

### M1 — Hardware-true core *(do this first; unblocks everything)*
- Plug in a real ESP32, validate every `mpremote`/`esptool` call end-to-end.
- Fix whatever differs from assumptions (port formats, error surfaces, offsets).
- Surface chip type + firmware version (read from the board) in the UI.
- **Goal adjustment:** nothing UI-heavy ships until the device path is proven real.

### M2 — Editor tabs + layout shell
- Multi-file tabs (local + read-only `device:` tabs), dirty markers, close/reorder.
- Dockable/collapsible tool windows with a left + bottom stripe (AS-style).
- Persistent status bar (connection, board, firmware, cursor, save state).
- Resizable panels (drag the sidebar / bottom panel; remember sizes).

### M3 — Serial Monitor / REPL (the "Logcat")
- Live streaming serial output panel (background read loop from the device).
- Send-line input → interactive REPL; clear/scroll-lock/timestamp toggles.
- "Run" wires its output here instead of the one-shot console.
- *(Needs a streaming channel from Rust → frontend; Tauri events. Notable new infra.)*

### M4 — Project & device file management
- Create / rename / delete / move in the local tree (context menu).
- Upload/download/delete on the device tree; drag local→device.
- Diff a local file against its on-device version.

### M5 — Quick-start polish
- More templates (ESP-NOW sender/receiver, web server w/ Microdot, sensor starter)
  derived from the owner's real projects.
- Optional "flash firmware as part of new-project setup" guided flow.
- Detect & offer to download the latest MicroPython firmware for the chip.

### M6 — UX refinement pass
- Command palette (⌘K), keyboard shortcuts, toasts instead of console spam for status.
- Light/dark theme toggle; settings as a proper pane (not just a modal).
- Onboarding empty-states; first-run "set your tool paths" check.
- App icon + branding.

### Later / maybe
- Per-project config file committed to the repo (board, offset, baud) so settings travel.
- Multiple-board awareness; remember last device per project.
- OTA/WebREPL upload path (the owner already uses WebREPL).
- Cross-platform packaging & signing (mac .dmg, Linux AppImage/deb).

## UX principles (the bar for "polished")

- **One window, calm by default.** Panels collapse away; the editor is the hero.
- **Every long action has visible state** — never a frozen button; show progress + result.
- **Errors are readable and actionable**, not raw stderr dumps (offer the fix, e.g.
  "mpremote not found → set its path in Settings").
- **Nothing destructive without confirmation** (device wipe, flash, delete).
- **Keyboard-first where it matters**; mouse-friendly everywhere.
- **It must always mirror the CLI** — what works in the terminal works here.
