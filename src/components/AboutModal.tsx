import { useEffect, useState } from "react";
import { getName, getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import * as api from "../lib/api";
import type { ToolVersions } from "../lib/api";
import type { Settings } from "../lib/settings";

interface Props {
  settings: Settings;
  onClose: () => void;
}

const SOURCES = {
  esptool: "https://github.com/espressif/esptool",
  mpremote: "https://github.com/micropython/micropython/tree/master/tools/mpremote",
  mpyCross: "https://github.com/micropython/micropython/tree/master/mpy-cross",
};

// A version cell: "…" while loading, the value, or a fallback for blanks.
const cell = (v: string | undefined, blank: string) =>
  v === undefined ? "…" : v === "" ? blank : v;

function ToolRows({ v, blank }: { v: ToolVersions | null; blank: string }) {
  return (
    <>
      <div className="about-row">
        <span>mpremote</span>
        <span>{cell(v?.mpremote, blank)}</span>
      </div>
      <div className="about-row">
        <span>mpy-cross</span>
        <span>{cell(v?.mpy_cross, blank)}</span>
      </div>
      <div className="about-row">
        <span>esptool</span>
        <span>{cell(v?.esptool, blank)}</span>
      </div>
    </>
  );
}

export default function AboutModal({ settings, onClose }: Props) {
  const [appName, setAppName] = useState("ESPStudio");
  const [appVersion, setAppVersion] = useState("");
  const [bundled, setBundled] = useState<ToolVersions | null>(null);
  const [overrides, setOverrides] = useState<ToolVersions | null>(null);

  useEffect(() => {
    getName()
      .then(setAppName)
      .catch(() => {});
    getVersion()
      .then(setAppVersion)
      .catch(() => {});
    api
      .bundledVersions()
      .then(setBundled)
      .catch(() => {});
    if (settings.useOwnBinaries) {
      api
        .overrideVersions(settings)
        .then(setOverrides)
        .catch(() => {});
    }
  }, [settings]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>About ESPStudio</h2>
        <p className="muted">
          A hyper-simplified IDE for MicroPython on ESP32 / ESP8266.
        </p>

        <fieldset>
          <legend>Version</legend>
          <div className="about-row">
            <span>{appName}</span>
            <span>{appVersion || "…"}</span>
          </div>
        </fieldset>

        <fieldset>
          <legend>Bundled tools</legend>
          <ToolRows v={bundled} blank="unknown" />
          <p className="muted">
            Bundled tools —{" "}
            <a className="ext" onClick={() => openUrl(SOURCES.esptool)}>
              esptool
            </a>{" "}
            (GPLv2),{" "}
            <a className="ext" onClick={() => openUrl(SOURCES.mpremote)}>
              mpremote
            </a>{" "}
            and{" "}
            <a className="ext" onClick={() => openUrl(SOURCES.mpyCross)}>
              mpy-cross
            </a>{" "}
            (MIT). Click a name for its source.
          </p>
        </fieldset>

        {settings.useOwnBinaries && (
          <fieldset>
            <legend>Your binaries</legend>
            <ToolRows v={overrides} blank="bundled" />
            <p className="muted">
              Tools you've pointed at in Settings. "bundled" means that tool has no
              override and uses the bundled one.
            </p>
          </fieldset>
        )}

        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
