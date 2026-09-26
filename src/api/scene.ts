import type { AskResult, PlacementResult, ReconstructResult, SceneGraph, ShelfDetection } from '../scene/types'

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

export function advisePlacement(graph: SceneGraph, selectedObjectId?: string): Promise<PlacementResult> {
  const selected = graph.objects.find((object) => object.id === selectedObjectId)
  return postJson<PlacementResult>('/advisor/placement', {
    graph,
    ...(selected ? { item: selected.label, ...(selected.count == null ? {} : { quantity: selected.count }) } : {}),
  })
}

export async function analyzeShelf(image: File): Promise<{ detections: ShelfDetection[] }> {
  const response = await fetch('/vision/analyze-shelf', {
    method: 'POST',
    body: (() => {
      const data = new FormData()
      data.append('image', image)
      return data
    })(),
  })
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `${response.status} ${response.statusText}`)
  }
  const payload = await response.json() as { detections?: unknown[]; items?: unknown[] } | unknown[]
  const raw = Array.isArray(payload) ? payload : payload.detections ?? payload.items ?? []
  return {
    detections: raw.map((item) => {
      const value = item as Record<string, unknown>
      const rawBox = value.box ?? value.bbox
      const box: Record<string, unknown> | undefined = Array.isArray(rawBox)
        ? { x: rawBox[0], y: rawBox[1], right: rawBox[2], bottom: rawBox[3] }
        : rawBox as Record<string, unknown> | undefined
      const x1 = Number(box?.x ?? box?.left ?? 0)
      const y1 = Number(box?.y ?? box?.top ?? 0)
      const x2 = Number(box?.right ?? (box ? x1 + Number(box.width ?? 0) : 0))
      const y2 = Number(box?.bottom ?? (box ? y1 + Number(box.height ?? 0) : 0))
      return {
        id: typeof value.id === 'string' ? value.id : undefined,
        label: String(value.label ?? value.name ?? value.type ?? 'Detected item'),
        count: typeof (value.count ?? value.quantity ?? value.stockCount) === 'number'
          ? Number(value.count ?? value.quantity ?? value.stockCount) : null,
        color: typeof (value.color ?? value.dominantColor) === 'string'
          ? String(value.color ?? value.dominantColor) : null,
        ...(box ? { box: { x: x1, y: y1, width: x2 - x1, height: y2 - y1 } } : {}),
        ...(typeof value.confidence === 'number' ? { confidence: value.confidence } : {}),
      }
    }),
  }
}
