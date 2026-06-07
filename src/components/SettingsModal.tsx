import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import type { Settings } from "../lib/settings";

interface Props {
  settings: Settings;
  onSave: (s: Settings) => void;
  onClose: () => void;
}

export default function SettingsModal({ settings, onSave, onClose }: Props) {
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
          <legend>Tool paths</legend>
          <p className="muted">
            Use full paths if the app can't find them (e.g.
            <code> /Users/you/.local/bin/mpremote</code>).
          </p>
          <label>
            mpremote
            <input value={s.mpremote} onChange={(e) => set("mpremote", e.target.value)} />
          </label>
          <label>
            python (for mpy_cross)
            <input value={s.python} onChange={(e) => set("python", e.target.value)} />
          </label>
          <label>
            esptool
            <input value={s.esptool} onChange={(e) => set("esptool", e.target.value)} />
          </label>
        </fieldset>

        <fieldset>
          <legend>Device & upload</legend>
          <label>
            Baud (flash)
            <input value={s.baud} onChange={(e) => set("baud", e.target.value)} />
          </label>
          <label>
            Flash offset
            <select value={s.offset} onChange={(e) => set("offset", e.target.value)}>
              <option value="0x1000">0x1000 (ESP32)</option>
              <option value="0x0">0x0 (ESP8266 / ESP32-S3 / C3)</option>
            </select>
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={s.compileOnUpload}
              onChange={(e) => set("compileOnUpload", e.target.checked)}
            />
            Cross-compile subdir .py → .mpy on "Upload project"
          </label>
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
          <button onClick={onClose}>Cancel</button>
          <button className="primary" onClick={() => onSave(s)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
