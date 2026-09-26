import { OrbitControls } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { Box3, Color, Material, Mesh, Object3D, Plane, Vector3, type BufferGeometry, type Group } from 'three'
import type { LoadedRoom } from '../room/types'
import type { Vec3 } from '../scene/types'
import type { GraphicsSettings } from '../settings/graphics'
import { preserveInspectionCamera, worldSurfaceNormal } from './inspection'

type Props = {
  room: LoadedRoom; scale: number; position: Vec3; selecting: boolean; playing: boolean;
  marker: { point: Vec3; valid: boolean } | null; onPick: (point: Vec3) => void; settings: GraphicsSettings
}

export function ImportedRoomView({ room, scale, position, selecting, playing, marker, onPick, settings }: Props) {
  const { camera, scene, gl } = useThree()
  const dragStart = useRef<[number, number] | null>(null)
  const wrapper = useRef<Group>(null)
  const { model, displayGeometries } = useMemo(() => {
    const clone = room.root.clone(true)
    const geometries = new Map<BufferGeometry, BufferGeometry>()
    clone.traverse(node => {
      if (!(node instanceof Mesh)) return
      // GLTFLoader allows flat-shaded meshes without NORMAL. Three's shadow
      // normal bias is zero for those meshes, producing stripes on flat rooms.
      // Keep source geometry/material shading intact; own only these new buffers.
      if (!node.geometry.getAttribute('normal')) {
        const source: BufferGeometry = node.geometry
        let geometry = geometries.get(source)
        if (!geometry) {
          geometry = source.clone()
          geometry.computeVertexNormals()
          geometries.set(source, geometry)
        }
        node.geometry = geometry
      }
      node.material = Array.isArray(node.material) ? node.material.map(value => value.clone()) : node.material.clone()
    })
    return { model: clone, displayGeometries: [...geometries.values()] }
  }, [room])
  const worldBounds = useMemo(() => new Box3(new Vector3(...room.bounds.min), new Vector3(...room.bounds.max))
    .setFromPoints([new Vector3(...room.bounds.min).multiplyScalar(scale).add(new Vector3(...position)),
      new Vector3(...room.bounds.max).multiplyScalar(scale).add(new Vector3(...position))]), [room, scale, ...position])
  const center = worldBounds.getCenter(new Vector3())
  const lightTarget = useMemo(() => {
    const target = new Object3D()
    target.position.set(center.x, center.y, center.z)
    return target
  }, [center.x, center.y, center.z])
  const size = worldBounds.getSize(new Vector3())
  const cutoff = worldBounds.min.y + size.y * 0.62
  const clip = useMemo(() => new Plane(new Vector3(0, -1, 0), cutoff), [cutoff])
  const distance = Math.max(size.length(), 1)

  // Register before the fit effect: its cleanup also runs before a replacement
  // room is fitted, and StrictMode replays restore then capture the original view.
  useLayoutEffect(() => preserveInspectionCamera(camera), [camera, room.id])

  useLayoutEffect(() => {
    const target = worldBounds.getCenter(new Vector3())
    camera.position.copy(target).add(new Vector3(distance * 0.55, distance * 0.6, distance * 0.65))
    camera.near = Math.max(0.005, distance / 10000)
    camera.far = Math.max(100, distance * 10)
    if ('updateProjectionMatrix' in camera) camera.updateProjectionMatrix()
    camera.lookAt(target)
  }, [camera, room.id, scale, worldBounds, distance])

  useEffect(() => {
    scene.background = new Color('#0b1016')
    gl.localClippingEnabled = true
    model.traverse(node => {
      if (!(node instanceof Mesh)) return
      node.castShadow = settings.shadows
      node.receiveShadow = settings.shadows
      const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material]
      materials.forEach(material => {
        material.clippingPlanes = selecting ? [clip] : null
        material.clipShadows = selecting
        material.needsUpdate = true
      })
    })
  }, [model, selecting, clip, scene, gl, settings.shadows])

  useEffect(() => () => {
    model.traverse(node => {
      if (!(node instanceof Mesh)) return
      const materials: Material[] = Array.isArray(node.material) ? node.material : [node.material]
      materials.forEach(material => material.dispose())
    })
    displayGeometries.forEach(geometry => geometry.dispose())
  }, [model, displayGeometries])

  function pick(event: ThreeEvent<MouseEvent>) {
    if (!selecting || !wrapper.current) return
    const start = dragStart.current
    if (start && Math.hypot(event.clientX - start[0], event.clientY - start[1]) > 5) return
    // The raycaster still hits clipped ceilings, so pick the first visible floor
    // intersection rather than letting an invisible roof consume the click.
    const hit = event.intersections.find(item => {
      if (!item.face || item.point.y > cutoff + 0.001) return false
      return (worldSurfaceNormal(item)?.y ?? 0) > 0.85
    })
    if (!hit) return
    event.stopPropagation()
    const point = wrapper.current.worldToLocal(hit.point.clone())
    onPick(point.toArray() as Vec3)
  }

  return <>
    <hemisphereLight args={['#e3ecff', '#3d4146', 1.5]} />
    <directionalLight position={[center.x + 4, worldBounds.max.y + 5, center.z + 3]} target={lightTarget} intensity={2}
      castShadow={settings.shadows} shadow-mapSize-width={2048} shadow-mapSize-height={2048}
      shadow-bias={-0.0002} shadow-normalBias={0.04}
      shadow-camera-left={-distance} shadow-camera-right={distance}
      shadow-camera-top={distance} shadow-camera-bottom={-distance}
      shadow-camera-near={0.1} shadow-camera-far={Math.max(30, distance * 4)} />
    <directionalLight position={[center.x - 5, center.y + 2, center.z - 4]} target={lightTarget} intensity={0.8} />
    <OrbitControls makeDefault enabled={!playing} enableDamping={settings.motion} target={center.toArray()}
      minDistance={0.1} maxDistance={distance * 4} maxPolarAngle={Math.PI * 0.95} />
    <group ref={wrapper} scale={scale} position={position}
      onPointerDown={event => { dragStart.current = [event.clientX, event.clientY] }} onClick={pick}>
      <primitive object={model} dispose={null} />
    </group>
    <primitive object={lightTarget} />
    {selecting && marker && <group position={new Vector3(...marker.point).multiplyScalar(scale).add(new Vector3(...position)).toArray()}>
      <mesh position={[0, 0.91, 0]} raycast={() => null}>
        <capsuleGeometry args={[0.22, 1.36, 4, 12]} />
        <meshStandardMaterial color={marker.valid ? '#3ee0c2' : '#ffb454'} transparent opacity={0.55} depthWrite={false} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} raycast={() => null}>
        <ringGeometry args={[0.28, 0.34, 32]} /><meshBasicMaterial color={marker.valid ? '#3ee0c2' : '#ffb454'} />
      </mesh>
    </group>}
  </>
}
