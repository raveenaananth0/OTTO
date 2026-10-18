import { Component, type ReactNode } from "react";
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <section style={{ padding: 32 }} role="alert">
        <h1>Let's get Otto back on track.</h1>
        <p>This page could not load. Your bank data has not been changed.</p>
        <button onClick={() => window.location.reload()}>Reload</button>{" "}
        <button
          onClick={() => {
            if (
              window.confirm(
                "Reset saved timelines and habits in this browser? Chats and bank records are retained.",
              )
            ) {
              try {
                localStorage.removeItem("otto-preview-workspace");
                for (const source of ["demo", "nessie"])
                  localStorage.removeItem("otto-habit-draft:" + source);
              } catch {}
              window.location.href = "/";
            }
          }}
        >
          Reset local timelines
        </button>
      </section>
    ) : (
      this.props.children
    );
  }
}
