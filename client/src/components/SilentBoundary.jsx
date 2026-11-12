import { Component } from "react";
import { reportError } from "../utils/errorReport";

// For optional extras (the assistant, the quick-add palette): if one fails, it simply does not appear. The app carries on.
export default class SilentBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(error) { reportError(error, { scope: "overlay", name: this.props.name || "" }); }
  render() { return this.state.failed ? null : this.props.children; }
}
