import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { Download, RefreshCw } from "lucide-react";
import Toolbar from "./components/Toolbar";
import FileTree from "./components/FileTree";
import CodeEditor from "./components/Editor";
import SettingsModal from "./components/SettingsModal";
import NewProjectModal from "./components/NewProjectModal";
import AboutModal from "./components/AboutModal";
import * as api from "./lib/api";
import type { DeviceInfo, FileNode, PortInfo } from "./lib/api";
import { loadSettings, saveSettings, type Settings } from "./lib/settings";
import "./App.css";

interface OpenFile {
  path: string;
  content: string;
  readOnly: boolean;
  dirty: boolean;
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(loadSettings());
  const [ports, setPorts] = useState<PortInfo[]>([]);
  const [localTree, setLocalTree] = useState<FileNode[]>([]);
  const [deviceTree, setDeviceTree] = useState<FileNode[]>([]);
  const [file, setFile] = useState<OpenFile | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>("Welcome to ESPStudio.\n");
  const [showSettings, setShowSettings] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  const append = useCallback((msg: string) => {
    setLog((l) => l + msg + "\n");
  }, []);

  const persist = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
  }, []);

  // ---- local tree ----
  const refreshLocal = useCallback(
    async (dir: string) => {
      if (!dir) return;
      try {
        setLocalTree(await api.readDir(dir));
      } catch (e) {
        append(`Error reading folder: ${e}`);
      }
    },
    [append]
  );

  useEffect(() => {
    if (settings.projectDir) refreshLocal(settings.projectDir);
  }, [settings.projectDir, refreshLocal]);

  // ---- ports ----
  const refreshPorts = useCallback(async () => {
    try {
      const p = await api.listPorts(settings);
      setPorts(p);
      // Auto-select when the current choice is gone (or none yet): prefer an
      // ESP-likely board, else the first available port.
      const stillThere = p.some((pt) => pt.port === settings.port);
      if (!stillThere) {
        const pick = p.find((pt) => pt.likely_esp) ?? p[0];
        persist({ ...settings, port: pick?.port ?? "" });
      }
    } catch (e) {
      append(`error listing ports: ${e}`);
    }
  }, [settings, persist, append]);

  useEffect(() => {
    refreshPorts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Native macOS menu → "About ESPStudio" opens our modal.
  useEffect(() => {
    const un = listen("open-about", () => setShowAbout(true));
    return () => {
      un.then((f) => f());
    };
  }, []);

  // Live esptool output during flashing → stream into the console.
  useEffect(() => {
    const un = listen<string>("flash-output", (e) => append(e.payload));
    return () => {
      un.then((f) => f());
    };
  }, [append]);

  // ---- device detection (chip type + MicroPython presence) ----
  const detectNow = useCallback(async (s: Settings): Promise<DeviceInfo | null> => {
    if (!s.port) {
      setDeviceInfo(null);
      return null;
    }
    try {
      const info = await api.detectDevice(s);
      setDeviceInfo(info);
      const where = info.chip ?? "device";
      append(
        info.micropython
          ? `detected ${where} · MicroPython ${info.version ?? "?"}`
          : `detected ${where} · no MicroPython`
      );
      return info;
    } catch (e) {
      setDeviceInfo(null);
      append(`device detect failed: ${e}`);
      return null;
    }
  }, [append]);

  // Re-detect whenever the selected port changes; adopt the chip's flash offset.
  useEffect(() => {
    detectNow(settings).then((info) => {
      if (info?.suggested_offset && info.suggested_offset !== settings.offset) {
        persist({ ...settings, offset: info.suggested_offset });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.port, detectNow]);

  // ---- helpers ----
  const withBusy = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(true);
    append(`\n$ ${label}`);
    try {
      const out = await fn();
      if (out) append(out.trim());
      append(`${label}: done`);
    } catch (e) {
      append(`error: ${e}`);
    } finally {
      setBusy(false);
    }
  };

  // ---- file actions ----
  const openLocalFile = async (node: FileNode) => {
    if (node.is_dir) return;
    try {
      const content = await api.readFile(node.path);
      setFile({ path: node.path, content, readOnly: false, dirty: false });
    } catch (e) {
      append(`Error opening ${node.path}: ${e}`);
    }
  };

  const openDeviceFile = async (node: FileNode) => {
    if (node.is_dir) return;
    await withBusy(`read ${node.path} from device`, async () => {
      const content = await api.deviceRead(settings, node.path);
      setFile({ path: `device:${node.path}`, content, readOnly: true, dirty: false });
    });
  };

  const saveFile = async () => {
    if (!file || file.readOnly) return;
    await withBusy(`save ${file.path}`, async () => {
      await api.writeFile(file.path, file.content);
      setFile({ ...file, dirty: false });
    });
  };

  const openFolder = async () => {
    const dir = await open({ directory: true });
    if (typeof dir === "string") {
      persist({ ...settings, projectDir: dir });
      setFile(null);
    }
  };

  const refreshDevice = () =>
    withBusy("list device files", async () => {
      setDeviceTree(await api.deviceTree(settings));
    });

  const uploadCurrent = () => {
    if (!file || file.readOnly) return;
    return withBusy(`upload ${file.path.split("/").pop()}`, async () => {
      if (file.dirty) {
        await api.writeFile(file.path, file.content);
        setFile({ ...file, dirty: false });
      }
      const out = await api.uploadFile(settings, file.path);
      refreshDevice();
      return out;
    });
  };

  const runCurrent = () => {
    if (!file || file.readOnly) return;
    return withBusy(`run ${file.path.split("/").pop()}`, () =>
      api.runFile(settings, file.path)
    );
  };

  const handleCreate = async (args: {
    parent: string;
    name: string;
    template: string;
    git: boolean;
  }) => {
    setShowNew(false);
    await withBusy(`create project ${args.name}`, async () => {
      const path = await api.newProject(args);
      persist({ ...settings, projectDir: path });
      return `created at ${path}`;
    });
  };

  const handleFlash = () => {
    if (!settings.firmwarePath) {
      append("Set a firmware .bin in Settings first.");
      setShowSettings(true);
      return;
    }
    return withBusy(`flash ${settings.firmwarePath.split("/").pop()}`, () =>
      api.flashFirmware(settings, true)
    );
  };

  // Guided MicroPython install: pick a .bin, flash at the detected chip's
  // offset (erase first), then re-detect to refresh the banner.
  const flashMicroPython = async () => {
    const file = await open({
      multiple: false,
      filters: [{ name: "MicroPython firmware", extensions: ["bin"] }],
    });
    if (typeof file !== "string") return;
    const offset = deviceInfo?.suggested_offset || settings.offset;
    const next = { ...settings, firmwarePath: file, offset };
    persist(next);
    await withBusy(`flash MicroPython @ ${offset}`, () => api.flashFirmware(next, true));
    await detectNow(next);
  };

  const canSave = !!file && !file.readOnly && file.dirty;
  const canUpload = !!file && !file.readOnly && !!settings.port;

  return (
    <div className="app">
      <Toolbar
        ports={ports}
        port={settings.port}
        busy={busy}
        canSave={canSave}
        canUpload={canUpload}
        onPortChange={(port) => persist({ ...settings, port })}
        onRefreshPorts={refreshPorts}
        onNewProject={() => setShowNew(true)}
        onOpenFolder={openFolder}
        onSave={saveFile}
        onUpload={() => uploadCurrent()}
        onUploadProject={() =>
          withBusy("upload project", () => api.uploadProject(settings).then(refreshDevice))
        }
        onRun={() => runCurrent()}
        onReset={() => withBusy("reset device", () => api.resetDevice(settings))}
        onFlash={handleFlash}
        onSettings={() => setShowSettings(true)}
      />

      {settings.port && deviceInfo && (
        <div className={"device-status" + (deviceInfo.micropython ? "" : " warn")}>
          {deviceInfo.micropython ? (
            <span>
              {deviceInfo.chip ?? "Device"} · MicroPython {deviceInfo.version ?? ""}
            </span>
          ) : (
            <>
              <span>
                No MicroPython detected
                {deviceInfo.chip ? ` on ${deviceInfo.chip}` : ""}. Flash it to get started.
              </span>
              <button onClick={flashMicroPython} disabled={busy}>
                <Download size={13} /> Flash MicroPython…
              </button>
            </>
          )}
        </div>
      )}

      <div className="body">
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-header">
              <span>
                LOCAL
                {settings.projectDir ? `: ${settings.projectDir.split("/").pop()}` : ""}
              </span>
              <button className="mini" onClick={() => refreshLocal(settings.projectDir)}>
                <RefreshCw size={13} />
              </button>
            </div>
            {settings.projectDir ? (
              <FileTree nodes={localTree} onOpen={openLocalFile} activePath={file?.path} />
            ) : (
              <div className="tree-empty">Open or create a project</div>
            )}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-header">
              <span>DEVICE{settings.port ? `: ${settings.port.split("/").pop()}` : ""}</span>
              <button className="mini" onClick={refreshDevice} disabled={!settings.port}>
                <RefreshCw size={13} />
              </button>
            </div>
            <FileTree nodes={deviceTree} onOpen={openDeviceFile} activePath={file?.path} />
          </div>
        </aside>

        <main className="main">
          <CodeEditor
            path={file?.path}
            value={file?.content ?? ""}
            readOnly={file?.readOnly ?? true}
            dirty={file?.dirty ?? false}
            onChange={(v) => file && setFile({ ...file, content: v, dirty: true })}
          />
          <div className="console">
            <div className="console-header">
              <span>OUTPUT</span>
              <button className="mini" onClick={() => setLog("")}>
                clear
              </button>
            </div>
            <pre className="console-body">{log}</pre>
          </div>
        </main>
      </div>

      {showSettings && (
        <SettingsModal
          settings={settings}
          onSave={(s) => {
            persist(s);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
          onAbout={() => {
            setShowSettings(false);
            setShowAbout(true);
          }}
        />
      )}
      {showNew && (
        <NewProjectModal
          defaultParent={settings.projectDir || ""}
          onCreate={handleCreate}
          onClose={() => setShowNew(false)}
        />
      )}
      {showAbout && (
        <AboutModal settings={settings} onClose={() => setShowAbout(false)} />
      )}
    </div>
  );
}
