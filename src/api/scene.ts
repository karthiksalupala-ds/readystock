import type { AskResult, ReconstructResult, SceneGraph } from '../scene/types'

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `${response.status} ${response.statusText}`)
  }
  return (await response.json()) as T
}

export function ingestScene(body: Record<string, unknown> = {}): Promise<SceneGraph> {
  return postJson<SceneGraph>('/scene/ingest', body)
}

export function reconstructScene(graph: SceneGraph): Promise<ReconstructResult> {
  return postJson<ReconstructResult>('/scene/reconstruct', { graph })
}

export function askScene(graph: SceneGraph, question: string): Promise<AskResult> {
  return postJson<AskResult>('/scene/ask', { graph, question })
}
