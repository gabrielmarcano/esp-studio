import { useCallback, useEffect, useRef, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { Download, Loader, Lock, RefreshCw, X } from "lucide-react";
import Toolbar from "./components/Toolbar";
import FileTree from "./components/FileTree";
import CodeEditor from "./components/Editor";
import SettingsModal from "./components/SettingsModal";
import NewProjectModal from "./components/NewProjectModal";
import AboutModal from "./components/AboutModal";
import StatusBar, { type Conn } from "./components/StatusBar";
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
  const [tabs, setTabs] = useState<OpenFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [conn, setConn] = useState<Conn>({ kind: "none" });
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string>("Welcome to ESPStudio.\n");
  const [showSettings, setShowSettings] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [refreshingLocal, setRefreshingLocal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [openingFile, setOpeningFile] = useState(false);
  const [cursor, setCursor] = useState<{ line: number; col: number } | null>(null);

  const active = tabs.find((t) => t.path === activePath) ?? null;

  const openTab = (f: OpenFile) => {
    setTabs((prev) => (prev.some((t) => t.path === f.path) ? prev : [...prev, f]));
    setActivePath(f.path);
  };
  const closeTab = (path: string) => {
    const idx = tabs.findIndex((t) => t.path === path);
    const remaining = tabs.filter((t) => t.path !== path);
    setTabs(remaining);
    if (activePath === path) {
      const neighbor = remaining[idx] ?? remaining[idx - 1] ?? null;
      setActivePath(neighbor ? neighbor.path : null);
    }
  };

  // Console auto-scroll: stick to the bottom unless the user scrolled up.
  const consoleRef = useRef<HTMLPreElement>(null);
  const stick = useRef(true);
  const onConsoleScroll = () => {
    const el = consoleRef.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };
  useEffect(() => {
    const el = consoleRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [log]);

  const append = useCallback((msg: string) => {
    setLog((l) => l + msg + "\n");
  }, []);

  const copyLog = useCallback(async () => {
    try {
      await writeText(log);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      append(`copy failed: ${e}`);
    }
  }, [log, append]);

  const persist = useCallback((s: Settings) => {
    setSettings(s);
    saveSettings(s);
  }, []);

  // ---- local tree ----
  const refreshLocal = useCallback(
    async (dir: string) => {
      if (!dir) return;
      setRefreshingLocal(true);
      try {
        setLocalTree(await api.readDir(dir));
      } catch (e) {
        append(`Error reading folder: ${e}`);
      } finally {
        setRefreshingLocal(false);
      }
    },
    [append]
  );

  useEffect(() => {
    if (settings.projectDir) refreshLocal(settings.projectDir);
  }, [settings.projectDir, refreshLocal]);

  // ---- ports ---- (manual dropdown refresh; reconcile owns selection/attach)
  const refreshPorts = useCallback(async () => {
    setScanning(true);
    try {
      setPorts(await api.listPorts(settings));
    } catch (e) {
      append(`error listing ports: ${e}`);
    } finally {
      setScanning(false);
    }
  }, [settings, append]);

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

  // ---- device connection lifecycle ----
  const treeCache = useRef<Record<string, FileNode[]>>({});
  const attachedPort = useRef<string>("");
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Connect: ONE connect_device call (detection + filesystem snapshot). Shows a
  // cached tree instantly on reconnect, then refreshes. Drives the conn state.
  const attach = useCallback(
    async (s: Settings) => {
      const port = s.port;
      if (!port) {
        setConn({ kind: "none" });
        setDeviceTree([]);
        return;
      }
      setConn({ kind: "connecting", port }); // immediate feedback
      const cached = treeCache.current[port];
      if (cached) setDeviceTree(cached); // instant reconnect view
      try {
        const st = await api.connectDevice(s);
        if (st.suggested_offset && st.suggested_offset !== settingsRef.current.offset) {
          persist({ ...settingsRef.current, offset: st.suggested_offset });
        }
        if (st.micropython) {
          const tree = api.parseTree(st.tree);
          treeCache.current[port] = tree;
          setDeviceTree(tree);
          setConn({ kind: "ready", port, chip: st.chip, version: st.version });
        } else {
          setDeviceTree([]);
          setConn({ kind: "no-mp", port, chip: st.chip });
        }
      } catch (e) {
        setConn({ kind: "error", port, msg: String(e) });
        append(`connect failed: ${e}`);
      }
    },
    [persist, append]
  );

  // Presence-driven reconcile: attach to the selected board when it's present,
  // detach when it's gone, auto-pick a present board when none is selected.
  const reconcile = useCallback(
    async (paths: string[]) => {
      const s = settingsRef.current;
      const cur = s.port;
      if (cur && paths.includes(cur)) {
        if (attachedPort.current !== cur) {
          attachedPort.current = cur;
          await attach(s);
        }
        return;
      }
      if (attachedPort.current) {
        attachedPort.current = "";
        setConn({ kind: "none" });
        setDeviceTree([]);
      }
      if (paths.length) {
        const p = await api.listPorts(s).catch(() => [] as PortInfo[]);
        const pick = p.find((pt) => pt.likely_esp) ?? p[0];
        if (pick) {
          attachedPort.current = pick.port;
          persist({ ...s, port: pick.port });
          await attach({ ...s, port: pick.port });
        }
      }
    },
    [attach, persist]
  );

  // Hotplug: poll /dev cheaply (no mpremote). On a device-set change refresh the
  // port dropdown; every tick reconcile attaches/detaches as devices come/go.
  useEffect(() => {
    let lastKey = "";
    const tick = async () => {
      const paths = await api.listSerialPaths().catch(() => null);
      if (!paths) return;
      const key = paths.join(",");
      if (key !== lastKey) {
        lastKey = key;
        api.listPorts(settingsRef.current).then(setPorts).catch(() => {});
      }
      await reconcile(paths);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [reconcile]);

  // Panel toggles: the macOS View menu emits these (⌘B/⌘J); off macOS we bind
  // the same keys directly since there's no native menu bar.
  useEffect(() => {
    const toggleSidebar = () =>
      persist({ ...settingsRef.current, sidebarOpen: !settingsRef.current.sidebarOpen });
    const toggleOutput = () =>
      persist({ ...settingsRef.current, consoleOpen: !settingsRef.current.consoleOpen });
    const uns = [listen("toggle-sidebar", toggleSidebar), listen("toggle-output", toggleOutput)];

    const isMac = navigator.userAgent.includes("Mac");
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        toggleSidebar();
      } else if (k === "j") {
        e.preventDefault();
        toggleOutput();
      }
    };
    if (!isMac) window.addEventListener("keydown", onKey);

    return () => {
      uns.forEach((u) => u.then((f) => f()));
      if (!isMac) window.removeEventListener("keydown", onKey);
    };
  }, [persist]);

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
    if (tabs.some((t) => t.path === node.path)) {
      setActivePath(node.path); // already open → just focus its tab
      return;
    }
    try {
      const content = await api.readFile(node.path);
      openTab({ path: node.path, content, readOnly: false, dirty: false });
    } catch (e) {
      append(`Error opening ${node.path}: ${e}`);
    }
  };

  const openDeviceFile = async (node: FileNode) => {
    if (node.is_dir) return;
    if (node.readable === false) {
      append(`${node.path} — binary file, not viewable (download coming soon).`);
      return;
    }
    const path = `device:${node.path}`;
    if (tabs.some((t) => t.path === path)) {
      setActivePath(path);
      return;
    }
    // Prefetched by the snapshot → open instantly, read-only.
    if (node.content !== undefined) {
      openTab({ path, content: node.content, readOnly: true, dirty: false });
      return;
    }
    // Readable but not prefetched (over size cap) → lazy serial read.
    setOpeningFile(true);
    await withBusy(`read ${node.path} from device`, async () => {
      const content = await api.deviceRead(settings, node.path);
      openTab({ path, content, readOnly: true, dirty: false });
    });
    setOpeningFile(false);
  };

  const saveFile = async () => {
    if (!active || active.readOnly) return;
    const path = active.path;
    await withBusy(`save ${path}`, async () => {
      await api.writeFile(path, active.content);
      setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, dirty: false } : t)));
    });
  };

  const openFolder = async () => {
    const dir = await open({ directory: true });
    if (typeof dir === "string") {
      persist({ ...settings, projectDir: dir });
      // close local tabs from the previous project; keep device tabs
      setTabs((prev) => prev.filter((t) => t.path.startsWith("device:")));
      setActivePath((cur) => (cur && !cur.startsWith("device:") ? null : cur));
    }
  };

  const refreshDevice = () => attach(settings);

  const uploadCurrent = () => {
    if (!active || active.readOnly) return;
    const path = active.path;
    return withBusy(`upload ${path.split("/").pop()}`, async () => {
      if (active.dirty) {
        await api.writeFile(path, active.content);
        setTabs((prev) => prev.map((t) => (t.path === path ? { ...t, dirty: false } : t)));
      }
      const out = await api.uploadFile(settings, path);
      refreshDevice();
      return out;
    });
  };

  const runCurrent = () => {
    if (!active || active.readOnly) return;
    return withBusy(`run ${active.path.split("/").pop()}`, () =>
      api.runFile(settings, active.path)
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

  // Guided flash (toolbar Flash + the "no MicroPython" banner): pick a .bin,
  // flash at the detected chip's offset (erase first), then re-attach.
  const flashMicroPython = async () => {
    const picked = await open({
      multiple: false,
      filters: [{ name: "MicroPython firmware", extensions: ["bin"] }],
    });
    if (typeof picked !== "string") return;
    const name = picked.split("/").pop();
    await withBusy(`flash MicroPython (${name})`, () =>
      api.flashFirmware(settings, picked, true)
    );
    await attach(settings);
  };

  const canSave = !!active && !active.readOnly && active.dirty;
  const canUpload = !!active && !active.readOnly && !!settings.port;

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
        scanning={scanning}
        onNewProject={() => setShowNew(true)}
        onOpenFolder={openFolder}
        onSave={saveFile}
        onUpload={() => uploadCurrent()}
        onUploadProject={() =>
          withBusy("upload project", () => api.uploadProject(settings).then(refreshDevice))
        }
        onRun={() => runCurrent()}
        onReset={() => withBusy("reset device", () => api.resetDevice(settings))}
        onFlash={() => flashMicroPython()}
        onSettings={() => setShowSettings(true)}
      />

      {conn.kind === "no-mp" && (
        <div className="device-status warn">
          <span>
            No MicroPython on {conn.chip ?? "this device"}. Flash it to get started.
          </span>
          <button onClick={flashMicroPython} disabled={busy}>
            <Download size={13} /> Flash MicroPython…
          </button>
        </div>
      )}

      <div className="body">
        {settings.sidebarOpen && (
        <aside className="sidebar">
          <div className="sidebar-section">
            <div className="sidebar-header">
              <span>
                LOCAL
                {settings.projectDir ? `: ${settings.projectDir.split("/").pop()}` : ""}
              </span>
              <button className="mini" onClick={() => refreshLocal(settings.projectDir)}>
                <RefreshCw size={13} className={refreshingLocal ? "spin" : ""} />
              </button>
            </div>
            {settings.projectDir ? (
              <FileTree
                nodes={localTree}
                onOpen={openLocalFile}
                activePath={
                  activePath && !activePath.startsWith("device:") ? activePath : undefined
                }
              />
            ) : (
              <div className="tree-empty">Open or create a project</div>
            )}
          </div>

          <div className="sidebar-section">
            <div className="sidebar-header">
              <span>
                DEVICE
                {conn.kind === "connecting"
                  ? " — connecting…"
                  : settings.port
                  ? `: ${settings.port.split("/").pop()}`
                  : ""}
              </span>
              <button className="mini" onClick={refreshDevice} disabled={!settings.port}>
                <RefreshCw size={13} className={conn.kind === "connecting" ? "spin" : ""} />
              </button>
            </div>
            <FileTree
              nodes={deviceTree}
              onOpen={openDeviceFile}
              activePath={
                activePath?.startsWith("device:") ? activePath.slice("device:".length) : undefined
              }
            />
          </div>
        </aside>
        )}

        <main className="main">
          {tabs.length > 0 && (
            <div className="tabs">
              {tabs.map((t) => (
                <div
                  key={t.path}
                  className={"tab" + (t.path === activePath ? " active" : "")}
                  title={t.path}
                  onClick={() => setActivePath(t.path)}
                  onMouseDown={(e) => {
                    if (e.button === 1) {
                      e.preventDefault();
                      closeTab(t.path);
                    }
                  }}
                >
                  {t.readOnly && <Lock size={11} className="tab-icon" />}
                  <span className="tab-name">
                    {t.path.replace(/^device:/, "").split("/").pop()}
                  </span>
                  {t.dirty && !t.readOnly && <span className="tab-dot" />}
                  <span
                    className="tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(t.path);
                    }}
                  >
                    <X size={12} />
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="editor-host">
            <CodeEditor
              activePath={activePath}
              value={active?.content ?? ""}
              openPaths={tabs.map((t) => t.path)}
              readOnly={active?.readOnly ?? true}
              onChange={(path, v) =>
                setTabs((prev) =>
                  prev.map((t) =>
                    t.path === path && !t.readOnly ? { ...t, content: v, dirty: true } : t
                  )
                )
              }
              onCursor={(line, col) => setCursor({ line, col })}
            />
            {openingFile && (
              <div className="editor-loading">
                <Loader size={16} className="spin" /> Reading from device…
              </div>
            )}
          </div>
          {settings.consoleOpen && (
          <div className="console">
            <div className="console-header">
              <span>OUTPUT</span>
              <div className="console-actions">
                <button className="mini" onClick={copyLog}>
                  {copied ? "copied" : "copy"}
                </button>
                <button className="mini" onClick={() => setLog("")}>
                  clear
                </button>
              </div>
            </div>
            <pre className="console-body" ref={consoleRef} onScroll={onConsoleScroll}>
              {log}
            </pre>
          </div>
          )}
        </main>
      </div>

      <StatusBar
        conn={conn}
        file={
          active
            ? {
                name: active.path.split("/").pop() ?? "",
                dirty: active.dirty,
                readOnly: active.readOnly,
              }
            : null
        }
        cursor={cursor}
      />

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
