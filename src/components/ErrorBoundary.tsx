import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("[ErrorBoundary] Caught:", error.message);
    if (info.componentStack) {
      console.error("[ErrorBoundary] Stack:", info.componentStack);
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex min-h-[40vh] items-center justify-center rounded-3xl border border-error-500/20 bg-error-500/5 p-10">
          <div className="text-center">
            <p className="text-lg font-semibold text-error-400">
              Something went wrong
            </p>
            <p className="mt-2 text-sm text-slate-400">
              {this.state.error?.message ?? "An unexpected error occurred."}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 rounded-lg bg-error-500/20 px-4 py-2 text-sm text-error-300 hover:bg-error-500/30"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
