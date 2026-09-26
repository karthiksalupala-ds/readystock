export type SceneMode = 'raw' | 'analysing' | 'twin'

export type Vec3 = [number, number, number]

export type SceneRoom = {
  id: string
  name: string
  width: number
  depth: number
  height: number
  units: 'm'
}

export type SceneObject = {
  id: string
  type: string
  label: string
  category: 'structure' | 'furniture' | 'opening' | 'equipment' | string
  position: Vec3
  size: Vec3
  rotation?: Vec3 | null
  material?: string | null
  confidence?: number | null
  color?: string | null
  shape?: string | null
  /** Inventory quantity reported by a shelf scan, when applicable. */
  count?: number | null
  /** Catalog model id from models/manifest.json; absent on captured/procedural objects. */
  assetId?: string | null
}

export type SceneGraph = {
  source?: 'demo' | 'roomplan' | 'simulated'
  room: SceneRoom
  objects: SceneObject[]
}

export type AnalysisStep = {
  from: string
  to: string
}

export type ReconstructResult = {
  graph: SceneGraph
  analysisSteps: AnalysisStep[]
}

export type AskResult = {
  reply: string
  highlightIds: string[]
}

export type PlacementRecommendation = {
  id?: string
  title?: string
  location?: string
  reason?: string
  objectId?: string
  position?: Vec3
}

export type PlacementResult = {
  recommendations: PlacementRecommendation[]
}

export type ShelfDetection = {
  id?: string
  label: string
  count?: number | null
  color?: string | null
  box?: { x: number; y: number; width: number; height: number }
  confidence?: number
}
