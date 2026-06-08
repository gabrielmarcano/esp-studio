// macOS smart-substitution (smart quotes, autocapitalize, autocorrect) fires
// inside the WKWebView and mangles what the user types — e.g. `print("x")` is
// sent as `Print(“x”)`, which MicroPython can't parse. There's no global HTML
// attribute for this, so we harden each text field the instant before it's typed
// into, via a single `focusin` listener. This covers every input/textarea —
// including ones mounted later (modals, the REPL) and Monaco's own editing
// textarea — without polling the DOM or fighting Monaco's per-frame churn.

const TEXT_TYPES = new Set(["text", "search", "url", "email", "tel", "password", ""]);

function harden(el: HTMLInputElement | HTMLTextAreaElement) {
  // Only text-entry fields; leave checkboxes/radios/numbers/etc. alone.
  if (el instanceof HTMLInputElement && !TEXT_TYPES.has(el.type)) return;
  el.setAttribute("autocorrect", "off");
  el.setAttribute("autocapitalize", "off");
  el.setAttribute("autocomplete", "off");
  el.spellcheck = false;
}

export function disableTextSubstitution() {
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      try {
        harden(el);
      } catch {
        /* never let this break the app */
      }
    }
  });
}
