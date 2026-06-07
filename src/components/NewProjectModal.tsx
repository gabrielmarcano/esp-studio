import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import Toggle from "./Toggle";

interface Props {
  defaultParent: string;
  onCreate: (args: {
    parent: string;
    name: string;
    template: string;
    git: boolean;
  }) => void;
  onClose: () => void;
}

export default function NewProjectModal({
  defaultParent,
  onCreate,
  onClose,
}: Props) {
  const [parent, setParent] = useState(defaultParent);
  const [name, setName] = useState("");
  const [template, setTemplate] = useState("wifi");
  const [git, setGit] = useState(true);

  const pickParent = async () => {
    const dir = await open({ directory: true });
    if (typeof dir === "string") setParent(dir);
  };

  const valid = parent.trim() !== "" && /^[\w.-]+$/.test(name);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>New project</h2>

        <label>
          Location
          <div className="path-row">
            <input value={parent} onChange={(e) => setParent(e.target.value)} />
            <button onClick={pickParent}>Browse…</button>
          </div>
        </label>

        <label>
          Project name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="esp-my-thing"
            autoFocus
          />
        </label>

        <label>
          Template
          <select value={template} onChange={(e) => setTemplate(e.target.value)}>
            <option value="wifi">WiFi + WebREPL (boot.py, main.py, env.template.py)</option>
            <option value="blink">Minimal blink (main.py only)</option>
          </select>
        </label>

        <Toggle
          checked={git}
          onChange={setGit}
          label="Initialize git repository"
        />

        <p className="muted">
          Creates the folder with <code>.gitignore</code> + <code>README.md</code>{" "}
          and your chosen template, then opens it.
        </p>

        <div className="modal-actions">
          <button onClick={onClose}>Cancel</button>
          <button
            className="primary"
            disabled={!valid}
            onClick={() => onCreate({ parent, name, template, git })}
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
