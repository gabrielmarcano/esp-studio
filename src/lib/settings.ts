// User settings, persisted in localStorage.
//
// Tool paths (mpremote/esptool/mpyCross) are OPTIONAL OVERRIDES: leave them
// blank to use the binaries bundled with the app (resolved in Rust's
// tool_path()). Set a full path only to point at a system install instead.

export interface Settings {
  useOwnBinaries: boolean; // off = always bundled; on = honor the override paths
  mpremote: string; // override path (only when useOwnBinaries); blank = bundled
  mpyCross: string; // override path (only when useOwnBinaries); blank = bundled
  esptool: string; // override path (only when useOwnBinaries); blank = bundled
  port: string;
  baud: string;
  offset: string; // flash offset: 0x1000 for ESP32, 0x0 for ESP8266/S3/C3
  firmwarePath: string;
  compileOnUpload: boolean;
  projectDir: string; // currently opened project folder
}

const DEFAULTS: Settings = {
  useOwnBinaries: false,
  mpremote: "",
  mpyCross: "",
  esptool: "",
  port: "",
  baud: "460800",
  offset: "0x1000",
  firmwarePath: "",
  compileOnUpload: true,
  projectDir: "",
};

const KEY = "esp-studio.settings";

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Settings> & { python?: string };
      // Migration from pre-bundling builds: tool paths used to be bare names
      // ("mpremote", "esptool", "python3"). Those now mean "use the bundled
      // sidecar", so clear any legacy bare value and drop the old `python` key.
      const legacy = new Set(["mpremote", "esptool", "python3", "mpy_cross", "mpy-cross"]);
      for (const k of ["mpremote", "esptool", "mpyCross"] as const) {
        if (parsed[k] && legacy.has(parsed[k] as string)) parsed[k] = "";
      }
      delete parsed.python;
      return { ...DEFAULTS, ...parsed };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}
