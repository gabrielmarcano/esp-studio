import Editor from "@monaco-editor/react";

interface Props {
  path?: string;
  value: string;
  readOnly: boolean;
  dirty: boolean;
  onChange: (v: string) => void;
}

function languageFor(path?: string): string {
  if (!path) return "plaintext";
  if (path.endsWith(".py")) return "python";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".md")) return "markdown";
  if (path.endsWith(".js") || path.endsWith(".ts")) return "javascript";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".yaml") || path.endsWith(".yml")) return "yaml";
  return "plaintext";
}

export default function CodeEditor({
  path,
  value,
  readOnly,
  dirty,
  onChange,
}: Props) {
  if (!path) {
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
    <div className="editor-wrap">
      <div className="editor-tab">
        <span>{path.split("/").pop()}</span>
        {readOnly && <span className="badge">device · read-only</span>}
        {dirty && !readOnly && <span className="badge dirty">unsaved</span>}
      </div>
      <Editor
        height="100%"
        theme="vs-dark"
        language={languageFor(path)}
        path={path}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        options={{
          readOnly,
          fontSize: 13,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 4,
        }}
      />
    </div>
  );
}
