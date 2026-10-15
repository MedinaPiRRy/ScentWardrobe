import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Keeps one broken screen from blanking the whole app. */
export default class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Screen crashed:', error, info.componentStack)
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    // Moving to another screen clears the error.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <h1 className="font-display text-2xl text-brass-400">Something went wrong on this screen</h1>
        <p className="mt-2 max-w-md text-sm text-cream/60">Your data is safe. Try again, or go to another screen from the sidebar.</p>
        <pre className="mt-3 max-w-xl overflow-auto rounded bg-ink-900 p-3 text-left text-xs text-red-300">{this.state.error.message}</pre>
        <button className="mt-4 rounded-md bg-brass-500 px-4 py-2 text-sm font-medium text-[#17110b]" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    )
  }
}
