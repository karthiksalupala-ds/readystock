import { Component, lazy, Suspense, type ReactNode } from 'react'
import type { PlayerWorldProps } from '../player/PlayerWorld'

// Physics and animation load when Play is requested, not during the scan demo.
const PlayerWorld = lazy(() => import('../player/PlayerWorld').then(module => ({ default: module.PlayerWorld })))

class LoadingBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch() { this.props.onError('Could not load Play mode. Check your connection and reload to try again.') }
  render() { return this.state.failed ? null : this.props.children }
}

export function PlayerMount(props: PlayerWorldProps) {
  return <LoadingBoundary onError={props.onError}><Suspense fallback={null}><PlayerWorld {...props} /></Suspense></LoadingBoundary>
}
