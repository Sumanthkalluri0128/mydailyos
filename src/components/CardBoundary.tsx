import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { reportError } from '../utils/sentry';

/**
 * Keeps one broken Home card from taking the whole screen down. A crash shows a small quiet box with "Try again" and is
 * reported to Sentry with the card's name, so it is easy to find. (Tabs have their own: see ScreenError.tsx.)
 */
export class CardBoundary extends React.Component<{ name: string; children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) { reportError(error, { boundary: 'home-card', area: this.props.name, componentStack: info?.componentStack }); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View accessibilityRole="alert" style={{ padding: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', borderColor: '#9aa0b8', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text style={{ color: '#6b7090', flex: 1 }}>This card could not load.</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Try ${this.props.name} again`} onPress={() => this.setState({ error: null })} style={{ minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: 8 }}>
          <Text style={{ fontWeight: '800', color: '#5b5bd6' }}>Try again</Text>
        </TouchableOpacity>
      </View>
    );
  }
}
