import type { PortInfo } from "../lib/api";

interface Props {
  ports: PortInfo[];
  port: string;
  busy: boolean;
  canSave: boolean;
  canUpload: boolean;
  onPortChange: (p: string) => void;
  onRefreshPorts: () => void;
  onNewProject: () => void;
  onOpenFolder: () => void;
  onSave: () => void;
  onUpload: () => void;
  onUploadProject: () => void;
  onRun: () => void;
  onReset: () => void;
  onFlash: () => void;
  onSettings: () => void;
}

export default function Toolbar(p: Props) {
  return (
    <div className="toolbar">
      <span className="brand">⚡ esp-studio</span>

      <button onClick={p.onNewProject} disabled={p.busy}>＋ New</button>
      <button onClick={p.onOpenFolder} disabled={p.busy}>📂 Open</button>

      <div className="divider" />

      <button onClick={p.onSave} disabled={!p.canSave || p.busy}>💾 Save</button>
      <button onClick={p.onUpload} disabled={!p.canUpload || p.busy}>
        ⬆ Upload file
      </button>
      <button onClick={p.onUploadProject} disabled={!p.port || p.busy}>
        ⬆⬆ Upload project
      </button>
      <button onClick={p.onRun} disabled={!p.canUpload || p.busy}>▶ Run</button>
      <button onClick={p.onReset} disabled={!p.port || p.busy}>↻ Reset</button>

      <div className="divider" />

      <button onClick={p.onFlash} disabled={!p.port || p.busy}>⚡ Flash</button>

      <div className="spacer" />

      <select
        value={p.port}
        onChange={(e) => p.onPortChange(e.target.value)}
        title="Serial port"
      >
        <option value="">— no device —</option>
        {p.ports.map((pt) => (
          <option key={pt.port} value={pt.port}>
            {pt.port} {pt.description ? `(${pt.description})` : ""}
          </option>
        ))}
      </select>
      <button onClick={p.onRefreshPorts} disabled={p.busy} title="Rescan ports">
        ⟳
      </button>
      <button onClick={p.onSettings} title="Settings">⚙</button>
    </div>
  );
}
