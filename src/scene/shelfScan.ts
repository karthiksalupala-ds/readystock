import type { SceneGraph, ShelfDetection } from './types'

/** Applies vision inventory to the matching semantic objects without changing geometry. */
export function applyShelfDetections(graph: SceneGraph, detections: ShelfDetection[]): SceneGraph {
  if (detections.length === 0) return graph
  return {
    ...graph,
    objects: graph.objects.map((object) => {
      const detection = detections.find((item) =>
        (item.id && item.id === object.id) ||
        item.label.toLowerCase() === object.label.toLowerCase() ||
        item.label.toLowerCase().includes(object.label.toLowerCase()) ||
        object.label.toLowerCase().includes(item.label.toLowerCase()),
      )
      if (!detection) return object
      return {
        ...object,
        ...(detection.count == null ? {} : { count: detection.count }),
        ...(detection.color == null ? {} : { color: detection.color }),
      }
    }),
  }
}
