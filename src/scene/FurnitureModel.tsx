import { useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Color } from 'three'
import { buildFurnitureModel } from './buildFurnitureModel'
import { revealAmount, type RevealWindow } from './scanReveal'
import type { ScanAnim } from './scanAnim'
import type { SceneObject } from './types'
import { CatalogFurniture } from './CatalogFurniture'
import { applyObjectPower } from './furnitureEffects'

const ACCENT = new Color('#3ee0c2')

export type FurnitureModelProps = {
  object: SceneObject
  anim: ScanAnim
  materialise: RevealWindow
  highlighted: boolean
  draggable: boolean
  powered?: boolean
  onReady?: (ready: boolean) => void
  /** Carries per-object overlays; a crowded scene suppresses them. */
  labelled: boolean
}

export function FurnitureModel(props: FurnitureModelProps) {
  return props.object.assetId ? <CatalogFurniture {...props} /> : <ProceduralFurniture {...props} />
}

function ProceduralFurniture({ object, anim, materialise, highlighted, draggable, powered = false }: FurnitureModelProps) {
  const [width, height, depth] = object.size
  const model = useMemo(() => buildFurnitureModel({
    ...object, size: [width, height, depth],
    // Position does not affect local geometry; dragging must not rebuild textures.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [object.id, object.type, object.color, object.material, object.shape, Boolean(object.rotation), width, height, depth])
  useEffect(() => () => model.dispose(), [model])
  useFrame(() => {
    const solid = revealAmount(anim.twin, materialise)
    model.root.visible = solid > 0.004
    model.root.position.y = (1 - solid) * 0.06
    const glow = highlighted ? 0.28 + Math.sin(anim.time * 4.2) * 0.08 : draggable ? 0.035 : 0
    for (const material of model.materials) {
      const translucent = material.userData.baseOpacity < 1
      material.opacity = solid * material.userData.baseOpacity
      material.transparent = translucent || solid < 1
      material.depthWrite = !translucent && solid > 0.5
      // Preserve the chosen finish and tint while indicating selection.
      material.color.copy(material.userData.baseColor)
      if (highlighted || draggable) {
        material.emissive.copy(ACCENT)
        material.emissiveIntensity = glow * solid
      } else {
        material.emissive.set(material.userData.emission ? '#214454' : '#000000')
        material.emissiveIntensity = (material.userData.emission ?? 0) * solid
      }
    }
    applyObjectPower(model.materials, object, powered, solid)
  })
  return <primitive object={model.root} dispose={null} />
}
