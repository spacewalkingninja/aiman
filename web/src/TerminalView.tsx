import { lazy, Suspense } from "react";
import ErrorBoundary from "./ErrorBoundary";

const TerminalPane = lazy(() => import("./TerminalPane"));

/**
 * The generic terminal tab — a plain shell running through opencode's native
 * PTY (no external terminal server required).
 */
export default function TerminalView() {
  return (
    <ErrorBoundary label="Terminal error">
      <Suspense fallback={<div className="empty">loading terminal…</div>}>
        <TerminalPane />
      </Suspense>
    </ErrorBoundary>
  );
}
