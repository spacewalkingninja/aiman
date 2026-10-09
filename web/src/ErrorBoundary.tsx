import { Component, type ReactNode } from "react";

export default class ErrorBoundary extends Component<
  { children: ReactNode; label?: string },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("ErrorBoundary:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="empty">
          <div>{this.props.label ?? "Something went wrong."}</div>
          <div className="small muted">{String(this.state.error)}</div>
          <button className="btn sm" onClick={() => this.setState({ error: null })}>
            retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
