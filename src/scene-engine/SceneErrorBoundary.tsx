import { Component, type ReactNode } from 'react'

interface Props {
  fallback: ReactNode
  children: ReactNode
}

/** 3D 场景渲染崩溃时的兜底边界：自动切换到静态降级内容（US-006 / FR-22） */
export class SceneErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(err: unknown) {
    console.warn('[3d-card] 场景渲染异常，已降级:', err)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
