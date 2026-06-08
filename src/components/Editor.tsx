import { useEffect, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";

type Ed = Parameters<OnMount>[0];
type Mon = Parameters<OnMount>[1];

function languageFor(path: string): string {
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".js") || path.endsWith(".ts")) return "javascript";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "yaml";
  return "plaintext";
}

interface Props {
  activePath: string | null;
  value: string; // content of the active tab (used only when its model is created)
  openPaths: string[]; // dispose models for files no longer open
  readOnly: boolean;
  onChange: (path: string, value: string) => void;
  onCursor?: (line: number, col: number) => void;
}

// Persistent multi-model editor: one Monaco model per open file, so switching
// tabs is instant and keeps each file's cursor/scroll/undo (no remount).
export default function CodeEditor({
  activePath,
  value,
  openPaths,
  readOnly,
  onChange,
  onCursor,
}: Props) {
  const edRef = useRef<Ed | null>(null);
  const monRef = useRef<Mon | null>(null);
  const models = useRef<Map<string, ReturnType<Mon["editor"]["createModel"]>>>(new Map());
  // keep callbacks fresh for the per-model listeners created once
  const cb = useRef({ onChange, onCursor });
  cb.current = { onChange, onCursor };

  const showActive = () => {
    const ed = edRef.current;
    const mon = monRef.current;
    if (!ed || !mon || !activePath) return;
    const p = activePath;
    let model = models.current.get(p);
    if (!model || model.isDisposed()) {
      const uri = mon.Uri.parse("inmemory://model/" + encodeURIComponent(p));
      // Reuse a surviving model with the same URI, else make a fresh one.
      model = mon.editor.getModel(uri) ?? mon.editor.createModel(value, languageFor(p), uri);
      const m = model;
      m.onDidChangeContent(() => cb.current.onChange(p, m.getValue()));
      models.current.set(p, m);
    }
    if (ed.getModel() !== model) ed.setModel(model);
    ed.updateOptions({ readOnly });
  };

  const handleMount: OnMount = (ed, mon) => {
    edRef.current = ed;
    monRef.current = mon;
    // The editor is disposed whenever this component's <Editor> unmounts (e.g.
    // when no file is open). Clear the refs so a later showActive() doesn't call
    // into a dead instance before the next editor finishes mounting.
    ed.onDidDispose(() => {
      if (edRef.current === ed) {
        edRef.current = null;
        monRef.current = null;
      }
    });
    ed.onDidChangeCursorPosition((e) =>
      cb.current.onCursor?.(e.position.lineNumber, e.position.column)
    );
    showActive();
  };

  // Switch model when the active tab (or its read-only state) changes.
  useEffect(showActive, [activePath, readOnly]);

  // Dispose models for tabs that were closed.
  useEffect(() => {
    for (const [p, m] of models.current) {
      if (!openPaths.includes(p)) {
        m.dispose();
        models.current.delete(p);
      }
    }
  }, [openPaths]);

  if (!activePath) {
    return (
      <div className="editor-placeholder">
        <p>Open a file from the sidebar to start editing.</p>
        <p className="muted">
          Local files are editable · Device files open read-only.
        </p>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      theme="vs-dark"
      loading={null}
      onMount={handleMount}
      options={{
        fontSize: 13,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 4,
      }}
    />
  );
}
