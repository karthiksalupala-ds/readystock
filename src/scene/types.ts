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
