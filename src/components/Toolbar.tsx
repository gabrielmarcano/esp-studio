import {
  CircuitBoard,
  FolderOpen,
  FolderUp,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Upload,
  Zap,
} from "lucide-react";
import type { PortInfo } from "../lib/api";

interface Props {
  ports: PortInfo[];
  port: string;
  busy: boolean;
  canSave: boolean;
  canUpload: boolean;
  onPortChange: (p: string) => void;
  onRefreshPorts: () => void;
  scanning: boolean;
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
    <div className="toolbar" data-tauri-drag-region>
      <span className="brand" data-tauri-drag-region>
        <CircuitBoard size={15} /> ESPStudio
      </span>

      <button onClick={p.onNewProject} disabled={p.busy}>
        <Plus size={14} /> New
      </button>
      <button onClick={p.onOpenFolder} disabled={p.busy}>
        <FolderOpen size={14} /> Open
      </button>

      <div className="divider" data-tauri-drag-region />

      <button onClick={p.onSave} disabled={!p.canSave || p.busy}>
        <Save size={14} /> Save
      </button>
      <button onClick={p.onUpload} disabled={!p.canUpload || p.busy}>
        <Upload size={14} /> Upload file
      </button>
      <button onClick={p.onUploadProject} disabled={!p.port || p.busy}>
        <FolderUp size={14} /> Upload project
      </button>
      <button onClick={p.onRun} disabled={!p.canUpload || p.busy}>
        <Play size={14} /> Run
      </button>
      <button onClick={p.onReset} disabled={!p.port || p.busy}>
        <RotateCcw size={14} /> Reset
      </button>

      <div className="divider" data-tauri-drag-region />

      <button onClick={p.onFlash} disabled={!p.port || p.busy}>
        <Zap size={14} /> Flash
      </button>

      <div className="spacer" data-tauri-drag-region />

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
        <RefreshCw size={14} className={p.scanning ? "spin" : ""} />
      </button>
      <button onClick={p.onSettings} title="Settings">
        <Settings size={14} />
      </button>
    </div>
  );
}
