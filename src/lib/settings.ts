// User settings, persisted in localStorage. Tool paths are passed to every
// Rust command so the app works even when launched from Finder (minimal PATH).

export interface Settings {
  mpremote: string;
  python: string;
  esptool: string;
  port: string;
  baud: string;
  offset: string; // flash offset: 0x1000 for ESP32, 0x0 for ESP8266/S3/C3
  firmwarePath: string;
  compileOnUpload: boolean;
  projectDir: string; // currently opened project folder
}

const DEFAULTS: Settings = {
  mpremote: "mpremote",
  python: "python3",
  esptool: "esptool",
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
    if (raw) return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(s));
}
