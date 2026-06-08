import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

// Catches render-time exceptions so a single bad component shows a readable
// error panel instead of unmounting the whole app to a blank white window.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ info });
    console.error("Render error:", error, info.componentStack);
  }

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="crash">
        <h2>Something broke</h2>
        <p className="crash-msg">{error.message}</p>
        <pre className="crash-stack">
          {error.stack}
          {info?.componentStack}
        </pre>
        <div className="crash-actions">
          <button onClick={() => this.setState({ error: null, info: null })}>
            Try again
          </button>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    );
  }
}
