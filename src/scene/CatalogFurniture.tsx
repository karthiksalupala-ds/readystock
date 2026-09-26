import { Html, OrbitControls } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { Color, type Group } from 'three'
import { instantiateCatalogModel, loadCatalogModel } from './catalogModel'
import { furnitureAsset, type FurnitureAsset } from './furnitureCatalog'
import type { FurnitureModelProps } from './FurnitureModel'
import { revealAmount } from './scanReveal'
import { applyObjectPower } from './furnitureEffects'

function useCatalogSource(assetId: string) {
  const [result, setResult] = useState<{ id: string; scene?: Group; error?: boolean } | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    setResult(null)
    loadCatalogModel(assetId).then((scene) => {
      if (active) setResult({ id: assetId, scene })
    }).catch(() => { if (active) setResult({ id: assetId, error: true }) })
    return () => { active = false }
  }, [assetId, attempt])
  return { result: result?.id === assetId ? result : null, retry: () => setAttempt((value) => value + 1) }
}

export function CatalogFurniture(props: FurnitureModelProps) {
  const assetId = props.object.assetId!
  const { result, retry } = useCatalogSource(assetId)
  const onReady = props.onReady
  useEffect(() => { onReady?.(Boolean(result?.scene)) }, [onReady, result])
  if (result?.scene) return <PlacedModel {...props} source={result.scene} />
  // A failure is always worth saying, since it costs the user an object and offers a
  // retry. A pending load is not: on a crowded floor that is a hundred chips of noise
  // over a room that is filling in anyway.
  if (!result?.error && !props.labelled) return null
  return (
    <Html center zIndexRange={[5, 0]} position={[0, props.object.size[1] / 2 + 0.1, 0]}>
      <div className="asset-status" data-loading-model={assetId} role="status">
        {result?.error ? <>Model unavailable. <button type="button" onPointerDown={(event) => event.stopPropagation()} onClick={retry}>Retry</button></> : 'Loading furniture…'}
      </div>
    </Html>
  )
}

function PlacedModel({ source, object, anim, materialise, highlighted, draggable, powered = false }: FurnitureModelProps & { source: Group }) {
  const [w, h, d] = object.size
  const model = useMemo(() => instantiateCatalogModel(source, [w, h, d]), [source, w, h, d])
  useEffect(() => () => model.dispose(), [model])
  useEffect(() => {
    for (const material of model.materials) {
      if (object.color) material.color.set(object.color)
      else material.color.copy(material.userData.baseColor)
      material.roughness = object.material === 'metal' ? 0.32 : object.material === 'fabric' ? 0.9 : object.material ? 0.55 : material.userData.roughness
      material.metalness = object.material === 'metal' ? 0.7 : object.material ? 0 : material.userData.metalness
    }
  }, [model, object.color, object.material])
  useFrame(() => {
    const solid = revealAmount(anim.twin, materialise)
    model.root.visible = solid > 0.004
    for (const material of model.materials) {
      material.opacity = material.userData.baseOpacity * solid
      material.transparent = material.opacity < 1
      if (highlighted || draggable) {
        material.emissive.set('#3ee0c2')
        material.emissiveIntensity = highlighted ? 0.16 : 0.02
      } else {
        material.emissive.copy(material.userData.baseEmissive)
        material.emissiveIntensity = material.userData.emission
      }
    }
    applyObjectPower(model.materials, object, powered, solid)
  })
  return <primitive object={model.root} dispose={null} />
}

function PreviewModel({ asset }: { asset: FurnitureAsset }) {
  const { result, retry } = useCatalogSource(asset.id)
  if (!result?.scene) return <Html center><div className="asset-status">{result?.error ? <button onClick={retry}>Retry preview</button> : 'Loading preview…'}</div></Html>
  return <PreviewGeometry key={asset.id} source={result.scene} asset={asset} />
}

function PreviewGeometry({ source, asset }: { source: Group; asset: FurnitureAsset }) {
  const model = useMemo(() => instantiateCatalogModel(source, asset.size), [source, asset])
  useEffect(() => () => model.dispose(), [model])
  return <group scale={1.65 / Math.max(...asset.size)}><primitive object={model.root} dispose={null} /></group>
}

export function FurniturePreview({ assetId }: { assetId: string }) {
  const asset = furnitureAsset(assetId)
  if (!asset) return null
  return <div className="furniture-preview" aria-label={`${asset.name} 3D preview`}>
    <Canvas frameloop="demand" dpr={1} camera={{ position: [2.3, 1.5, 2.6], fov: 36 }}>
      <color attach="background" args={['#192631']} />
      <hemisphereLight args={[new Color('#ffffff'), new Color('#728084'), 2]} />
      <directionalLight position={[3, 5, 2]} intensity={2} />
      <PreviewModel asset={asset} />
      <OrbitControls enableZoom={false} enablePan={false} />
    </Canvas>
    <span>Drag preview to rotate</span>
  </div>
}
