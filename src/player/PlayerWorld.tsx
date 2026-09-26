import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { Physics, useBeforePhysicsStep, useRapier } from '@react-three/rapier'
import { Component, Suspense, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react'
import { AnimationMixer, LoopOnce, Vector3, type AnimationAction, type Group, type Material, type Mesh, type SkinnedMesh } from 'three'
import { clone } from 'three/addons/utils/SkeletonUtils.js'
import { avatarCasualUrl } from '../assets/catalog'
import type { RoomEnvironment } from '../room/types'
import type { Vec3 } from '../scene/types'
import type { GraphicsSettings } from '../settings/graphics'
import { bindDesktopInput, type PlayerAnimation } from './controls'
import { createPlayerSession, PHYSICS_STEP } from './physics'
import { avatarCameraOpacity, CAMERA_DISTANCE, CAMERA_PITCH, CAMERA_TARGET_HEIGHT, cameraDirection, chooseInitialCameraYaw } from './camera'
import type { InteractionSnapshot } from '../interaction/session'
import { createSeatPose } from './seatPose'

export type PlayerTelemetry = { position: Vec3; animation: PlayerAnimation; grounded: boolean; yaw: number; interaction: InteractionSnapshot; toggles: Readonly<Record<string, boolean>> }
export type PlayerWorldProps = {
  environment: RoomEnvironment
  paused: boolean
  resetToken: number
  settings: GraphicsSettings
  onReady: () => void
  onError: (message: string) => void
  allowSpawnSearch?: boolean
  interactionRequest?: number
  toggles?: Readonly<Record<string, boolean>>
  onToggle?: (objectId: string) => void
  onInteractionChange?: (snapshot: InteractionSnapshot) => void
  /** Optional instrumentation; gameplay does not set React state per frame. */
  onTelemetry?: (telemetry: PlayerTelemetry) => void
}

class PlayerBoundary extends Component<{ children: ReactNode; onError: (message: string) => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error: Error) { this.props.onError(`Could not start the character: ${error.message}`) }
  render() { return this.state.failed ? null : this.props.children }
}

/** Mount only during Play. Environment and controller live in their own physics world. */
export function PlayerWorld(props: PlayerWorldProps) {
  const camera = useThree((state) => state.camera)
  useEffect(() => {
    const position = camera.position.clone()
    const rotation = camera.quaternion.clone()
    return () => {
      camera.position.copy(position)
      camera.quaternion.copy(rotation)
      camera.updateMatrixWorld()
    }
  }, [camera])
  return (
    <PlayerBoundary key={props.environment.id} onError={props.onError}>
      <Suspense fallback={null}>
        <Physics timeStep={PHYSICS_STEP} gravity={[0, -9.81, 0]} paused={props.paused} interpolate={false}>
          <PlayerController {...props} />
        </Physics>
      </Suspense>
    </PlayerBoundary>
  )
}

function PlayerController(props: PlayerWorldProps) {
  const { world } = useRapier()
  const { camera, gl } = useThree()
  const gltf = useGLTF(avatarCasualUrl)
  const avatar = useMemo(() => {
    const model = clone(gltf.scene)
    const materials = new Map<Material, Material>()
    const ownMaterial = (original: Material) => {
      if (!materials.has(original)) materials.set(original, original.clone())
      return materials.get(original)!
    }
    model.traverse(object => {
      const mesh = object as Mesh
      if (mesh.isMesh) mesh.material = Array.isArray(mesh.material) ? mesh.material.map(ownMaterial) : ownMaterial(mesh.material)
    })
    return { model, materials: [...materials.values()] }
  }, [gltf.scene])
  const model = avatar.model
  const seatPose = useMemo(() => createSeatPose(model), [model])
  const mixer = useMemo(() => new AnimationMixer(model), [model])
  const group = useRef<Group>(null)
  const latest = useRef(props)
  latest.current = props
  const session = useRef<ReturnType<typeof createPlayerSession> | null>(null)
  const controls = useRef<ReturnType<typeof bindDesktopInput> | null>(null)
  const yaw = useRef(0)
  const pitch = useRef(CAMERA_PITCH)
  const cameraDistance = useRef(CAMERA_DISTANCE)
  const previousAnimation = useRef<PlayerAnimation | null>(null)
  const firstFrame = useRef(true)
  const lastInteractionRequest = useRef(props.interactionRequest)
  const cameraHeight = useRef(CAMERA_TARGET_HEIGHT)
  const actions = useRef<Partial<Record<PlayerAnimation, AnimationAction>>>({})
  const scratch = useMemo(() => ({ feet: new Vector3(), target: new Vector3(), direction: new Vector3() }), [])

  useLayoutEffect(() => {
    for (const clip of gltf.animations) {
      const name = clip.name.toLowerCase()
      if (name === 'idle' || name === 'walk' || name === 'run' || name === 'sit_down' || name === 'seated_idle' || name === 'stand_up') {
        const action = mixer.clipAction(clip)
        if (name === 'sit_down' || name === 'stand_up') { action.setLoop(LoopOnce, 1); action.clampWhenFinished = true }
        actions.current[name] = action
      }
    }
    if (Object.keys(actions.current).length !== 6) {
      latest.current.onError('The character is missing a movement or sitting animation. Reload to try again.')
      return
    }
    try {
      session.current = createPlayerSession(world, props.environment, props.allowSpawnSearch, {
        motion: () => latest.current.settings.motion,
        readToggle: id => latest.current.toggles?.[id] ?? false,
        onToggle: id => latest.current.onToggle?.(id),
        onChange: snapshot => latest.current.onInteractionChange?.(snapshot),
      })
      const player = session.current
      const feet = player.feet()
      const target: Vec3 = [feet[0], feet[1] + CAMERA_TARGET_HEIGHT, feet[2]]
      yaw.current = chooseInitialCameraYaw(angle => player.cameraDistance(target, cameraDirection(angle), CAMERA_DISTANCE))
      player.setHeading(yaw.current + Math.PI)
      if (group.current) group.current.rotation.y = player.heading()
      firstFrame.current = true
      previousAnimation.current = null
      latest.current.onReady()
    } catch (error) {
      latest.current.onError(error instanceof Error ? error.message : 'Could not prepare this room for play.')
    }
    return () => {
      session.current?.dispose()
      session.current = null
      mixer.stopAllAction()
      mixer.uncacheRoot(model)
      actions.current = {}
    }
  }, [world, props.environment, props.allowSpawnSearch, gltf.animations, mixer, model])

  useEffect(() => {
    controls.current = bindDesktopInput(gl.domElement, () => !latest.current.paused && session.current !== null, (dx, dy) => {
      yaw.current -= dx * 0.004
      pitch.current = Math.max(-0.15, Math.min(0.65, pitch.current + dy * 0.004))
    }, () => session.current?.interact())
    return () => { controls.current?.dispose(); controls.current = null }
  }, [gl])

  useEffect(() => { if (props.paused) controls.current?.clear() }, [props.paused])
  useEffect(() => {
    if (lastInteractionRequest.current !== props.interactionRequest && !props.paused) session.current?.interact()
    lastInteractionRequest.current = props.interactionRequest
  }, [props.interactionRequest, props.paused])
  useEffect(() => {
    session.current?.reset()
    session.current?.setHeading(yaw.current + Math.PI)
    controls.current?.clear()
    firstFrame.current = true
    cameraHeight.current = CAMERA_TARGET_HEIGHT
  }, [props.resetToken])
  useEffect(() => {
    model.traverse((object) => {
      if ((object as Mesh).isMesh) {
        object.castShadow = props.settings.shadows
        object.receiveShadow = props.settings.shadows
      }
    })
  }, [model, props.settings.shadows])
  useEffect(() => () => {
    // Geometry stays shared with the loader cache; skeletons and fade materials are ours.
    const skeletons = new Set<SkinnedMesh['skeleton']>()
    model.traverse((object) => { if ((object as SkinnedMesh).isSkinnedMesh) skeletons.add((object as SkinnedMesh).skeleton) })
    skeletons.forEach((skeleton) => skeleton.dispose())
    avatar.materials.forEach(material => material.dispose())
  }, [model, avatar])

  useBeforePhysicsStep(() => {
    if (latest.current.paused) return
    session.current?.beforeStep(controls.current?.read() ?? { x: 0, z: 0, run: false }, yaw.current)
  })

  useFrame((_, delta) => {
    const player = session.current
    const visual = group.current
    if (!player || !visual) return
    const dt = Math.min(delta, 0.1)
    const feet = player.feet()
    scratch.feet.fromArray(feet)
    if (firstFrame.current || !props.settings.motion || player.interaction().phase !== 'standing' || visual.position.distanceTo(scratch.feet) > 1) visual.position.copy(scratch.feet)
    else if (!props.paused) visual.position.lerp(scratch.feet, 1 - Math.exp(-24 * dt))
    const animation = player.animation()
    const heading = player.heading()
    const angle = Math.atan2(Math.sin(heading - visual.rotation.y), Math.cos(heading - visual.rotation.y))
    if (!props.paused) visual.rotation.y += angle * (props.settings.motion ? 1 - Math.exp(-16 * dt) : 1)
    if (previousAnimation.current !== animation) {
      const previous = previousAnimation.current ? actions.current[previousAnimation.current] : undefined
      const next = actions.current[animation]
      previous?.fadeOut(props.settings.motion ? 0.16 : 0)
      next?.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).fadeIn(props.settings.motion ? 0.16 : 0).play()
      previousAnimation.current = animation
    }
    if (!props.paused) {
      mixer.update(dt)
      if (animation === 'sit_down' || animation === 'stand_up') {
        const action = actions.current[animation]!
        action.time = Math.min(action.getClip().duration, player.transitionTime())
        mixer.update(0)
      }
      seatPose.apply(player.seatHeight(), player.seatWeight())
    }

    const desiredHeight = CAMERA_TARGET_HEIGHT - player.cameraLowering()
    if (!props.paused) cameraHeight.current += (desiredHeight - cameraHeight.current) * (props.settings.motion ? 1 - Math.exp(-12 * dt) : 1)
    scratch.target.copy(visual.position).y += cameraHeight.current
    scratch.direction.set(Math.sin(yaw.current) * Math.cos(pitch.current), Math.sin(pitch.current), Math.cos(yaw.current) * Math.cos(pitch.current))
    const available = player.cameraDistance(scratch.target.toArray() as Vec3, scratch.direction.toArray() as Vec3, CAMERA_DISTANCE)
    // Contract immediately around obstructions; ease only outward along the tested clear ray.
    cameraDistance.current = available < cameraDistance.current || !props.settings.motion || firstFrame.current
      ? available : Math.min(available, cameraDistance.current + dt * 3)
    camera.position.copy(scratch.target).addScaledVector(scratch.direction, cameraDistance.current)
    camera.lookAt(scratch.target)
    const opacity = avatarCameraOpacity(cameraDistance.current)
    visual.visible = opacity > 0
    for (const material of avatar.materials) {
      const fading = opacity < 1
      if (material.transparent !== fading) {
        material.transparent = fading
        material.depthWrite = !fading
        material.needsUpdate = true
      }
      material.opacity = opacity
    }
    firstFrame.current = false
    latest.current.onTelemetry?.({ position: feet, grounded: player.grounded(), animation, yaw: yaw.current,
      interaction: player.interaction(), toggles: props.toggles ?? {} })
  })
  return <group ref={group}><primitive object={model} dispose={null} /></group>
}
