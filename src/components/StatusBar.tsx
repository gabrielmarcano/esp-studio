import type { ReactNode } from "react";
import { Loader } from "lucide-react";

// The device connection state machine — single source of truth for all
// connection UI (status bar, device header, flash banner).
export type Conn =
  | { kind: "none" }
  | { kind: "connecting"; port: string }
  | { kind: "ready"; port: string; chip: string | null; version: string | null }
  | { kind: "no-mp"; port: string; chip: string | null }
  | { kind: "error"; port: string; msg: string };

const short = (p: string) => p.split("/").pop();

interface Props {
  conn: Conn;
  file: { name: string; dirty: boolean; readOnly: boolean } | null;
  cursor: { line: number; col: number } | null;
}

export default function StatusBar({ conn, file, cursor }: Props) {
  let dot = "idle";
  let text: ReactNode = "No device";

  if (conn.kind === "connecting") {
    dot = "busy";
    text = (
      <>
        <Loader size={12} className="spin" /> Connecting… {short(conn.port)}
      </>
    );
  } else if (conn.kind === "ready") {
    dot = "ok";
    text = `${conn.chip ?? "Device"} · MicroPython ${conn.version ?? ""} · ${short(conn.port)}`;
  } else if (conn.kind === "no-mp") {
    dot = "warn";
    text = `${conn.chip ?? "Device"} · no MicroPython · ${short(conn.port)}`;
  } else if (conn.kind === "error") {
    dot = "warn";
    text = `Connection error · ${short(conn.port)}`;
  }

  return (
    <div className="statusbar">
      <span className={"status-dot " + dot} />
      <span className="status-text">{text}</span>
      <span className="status-spacer" />
      {file && (
        <span className="status-file">
          {file.readOnly ? "read-only" : file.dirty ? "● unsaved" : "saved"}
        </span>
      )}
      {file && cursor && (
        <span className="status-pos">
          Ln {cursor.line}, Col {cursor.col}
        </span>
      )}
    </div>
  );
}
