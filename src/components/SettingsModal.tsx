import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import Toggle from "./Toggle";
import type { Settings } from "../lib/settings";

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
  onAbout: () => void;
}

export default function SettingsModal({ settings, onSave, onClose, onAbout }: Props) {
  const [s, setS] = useState<Settings>(settings);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) =>
    setS((prev) => ({ ...prev, [k]: v }));

  const pickFirmware = async () => {
    const file = await open({
      multiple: false,
      filters: [{ name: "Firmware", extensions: ["bin"] }],
    });
    if (typeof file === "string") set("firmwarePath", file);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        <fieldset>
          <legend>Tool binaries</legend>
          <Toggle
            checked={s.useOwnBinaries}
            onChange={(v) => set("useOwnBinaries", v)}
            label="Use my own binaries (advanced)"
          />
          {!s.useOwnBinaries ? (
            <p className="muted">
              Using the tools bundled with the app. Turn this on to point at your
              own mpremote / mpy-cross / esptool installs.
            </p>
          ) : (
            <>
              <p className="muted">
                Full path to each tool. Leave a field blank to keep using the
                bundled one (e.g.<code> /Users/you/.local/bin/mpremote</code>).
              </p>
              <label>
                mpremote
                <input
                  value={s.mpremote}
                  onChange={(e) => set("mpremote", e.target.value)}
                  placeholder="bundled"
                />
              </label>
              <label>
                mpy-cross
                <input
                  value={s.mpyCross}
                  onChange={(e) => set("mpyCross", e.target.value)}
                  placeholder="bundled"
                />
              </label>
              <label>
                esptool
                <input
                  value={s.esptool}
                  onChange={(e) => set("esptool", e.target.value)}
                  placeholder="bundled"
                />
              </label>
            </>
          )}
        </fieldset>

        <fieldset>
          <legend>Device & upload</legend>
          <label>
            Flash offset
            <select value={s.offset} onChange={(e) => set("offset", e.target.value)}>
              <option value="0x1000">0x1000 (ESP32)</option>
              <option value="0x0">0x0 (ESP8266 / ESP32-S3 / C3)</option>
            </select>
          </label>
          <Toggle
            checked={s.autoBaud}
            onChange={(v) => set("autoBaud", v)}
            label="App-managed flash speed"
            help={
              "ESPStudio flashes at a fast speed and automatically retries slower if it " +
              "fails, so you don't have to pick a baud rate. Turn this off only to force a " +
              "specific speed."
            }
          />
          {!s.autoBaud && (
            <label>
              Baud (flash)
              <input
                value={s.baud}
                onChange={(e) => set("baud", e.target.value)}
                placeholder="460800"
              />
            </label>
          )}
          <Toggle
            checked={s.compileOnUpload}
            onChange={(v) => set("compileOnUpload", v)}
            label={'Cross-compile subdir .py → .mpy on "Upload project"'}
            help={
              ".mpy files are MicroPython bytecode compiled ahead of time with mpy-cross. " +
              "Compiling library/driver files (in subfolders like lib/ or drivers/) makes them " +
              "import faster and use less RAM on the device. The trade-offs: the .mpy format is " +
              "tied to a firmware version, and the source isn't readable on the board. Entry " +
              "points (main.py, boot.py) are always left as plain .py so tracebacks stay readable. " +
              "If you're unsure, leave this off — plain .py always works."
            }
          />
        </fieldset>

        <fieldset>
          <legend>Firmware</legend>
          <label>
            Firmware .bin
            <div className="path-row">
              <input
                value={s.firmwarePath}
                onChange={(e) => set("firmwarePath", e.target.value)}
                placeholder="path to MicroPython .bin"
              />
              <button onClick={pickFirmware}>Browse…</button>
            </div>
          </label>
        </fieldset>

        <div className="modal-actions">
          <button className="link" onClick={onAbout}>
            About ESPStudio
          </button>
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => onSave(s)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
