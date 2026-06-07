import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import Toolbar from "./components/Toolbar";
import FileTree from "./components/FileTree";
import CodeEditor from "./components/Editor";
import SettingsModal from "./components/SettingsModal";
import NewProjectModal from "./components/NewProjectModal";
import * as api from "./lib/api";
import type { FileNode, PortInfo } from "./lib/api";
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
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>("Welcome to esp-studio.\n");
  const [showSettings, setShowSettings] = useState(false);
  const [showNew, setShowNew] = useState(false);

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
      if (!settings.port && p.length === 1) persist({ ...settings, port: p[0].port });
    } catch (e) {
      append(`Error listing ports: ${e}`);
    }
  }, [settings, persist, append]);

  useEffect(() => {
    refreshPorts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- helpers ----
  const withBusy = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(true);
    append(`\n$ ${label}`);
    try {
      const out = await fn();
      if (out) append(out.trim());
      append(`✓ ${label} done`);
    } catch (e) {
      append(`✗ ${e}`);
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

      <div className="body">
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-header">
              <span>
                LOCAL
                {settings.projectDir ? `: ${settings.projectDir.split("/").pop()}` : ""}
              </span>
              <button className="mini" onClick={() => refreshLocal(settings.projectDir)}>
                ⟳
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
                ⟳
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
        />
      )}
      {showNew && (
        <NewProjectModal
          defaultParent={settings.projectDir || ""}
          onCreate={handleCreate}
          onClose={() => setShowNew(false)}
        />
      )}
    </div>
  );
}
