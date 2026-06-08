import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { disableTextSubstitution } from "./lib/no-autocorrect";

// Stop macOS smart quotes / autocapitalize from mangling typed input (REPL,
// tool paths, project names) before React renders anything.
disableTextSubstitution();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
