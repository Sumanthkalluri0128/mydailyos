import { Component } from "react";
import { reportError } from "../utils/errorReport";

/**
 * Keeps one broken piece from blanking the whole app.
 *   scope="tab"        a whole page: shows a friendly message with a Try again button.
 *   scope="home-card"  one Home card: shows a small quiet placeholder, the rest of Home keeps working.
 * Every crash is reported (with the scope and name) to Sentry when it is set up. `resetKey` clears the error when it changes (for example, when you switch tabs).
 */
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { reportError(error, { scope: this.props.scope || "app", name: this.props.name || "", componentStack: info && info.componentStack }); }
  componentDidUpdate(prev) { if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null }); }
  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.scope === "home-card") {
      return <div className="eb-card" role="status">This card could not load. <button type="button" onClick={() => this.setState({ error: null })}>Try again</button></div>;
    }
    return (
      <div className="eb-tab" role="alert">
        <h2>Something went wrong here</h2>
        <p>The rest of the app is fine. Your data is safe.</p>
        <button type="button" onClick={() => this.setState({ error: null })}>Try again</button>
      </div>
    );
  }
}
