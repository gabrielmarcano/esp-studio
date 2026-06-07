import { useState } from "react";
import { Info } from "lucide-react";

interface Props {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help?: string;
}

// A switch-style toggle (label left, switch right — see .toggle in App.css).
// An optional `help` adds an (i) that expands an explanation below the row.
export default function Toggle({ checked, onChange, label, help }: Props) {
  const [showHelp, setShowHelp] = useState(false);

  return (
    <div className="toggle-wrap">
      <label className="toggle">
        <span className="toggle-label">
          {label}
          {help && (
            <span
              className="info-btn"
              role="button"
              tabIndex={0}
              title="More info"
              onClick={(e) => {
                e.preventDefault();
                setShowHelp((v) => !v);
              }}
            >
              <Info size={13} />
            </span>
          )}
        </span>
        {/* input must sit immediately before the track for the :checked sibling style */}
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="toggle-track">
          <span className="toggle-thumb" />
        </span>
      </label>
      {help && showHelp && <p className="muted toggle-help">{help}</p>}
    </div>
  );
}
