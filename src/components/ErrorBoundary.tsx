import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode; fallback: ReactNode };
type State = { failed: boolean };

/**
 * Swaps a page that threw for a fallback. Imports nothing but React, because the
 * root app and the directory both stand on it and neither may lean on the other.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('The page could not be drawn', error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
