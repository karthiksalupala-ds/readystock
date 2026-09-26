import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import {
  AdditiveBlending,
  Color,
  DoubleSide,
  MeshBasicMaterial,
  ShaderMaterial,
  type Group,
  type Mesh,
  type PointLight,
} from 'three'
import type { ScanAnim } from './scanAnim'
import { SWEEP_SPAN, beamRotationY, sensorOrigin } from './scanReveal'
import type { SceneRoom } from './types'

const FAN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FAN_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;

  varying vec2 vUv;

  void main() {
    // Bright at the head, thinning to almost nothing at the walls, so the blade
    // reads as light in the air rather than a pane of glass.
    float reach = mix(0.12, 1.0, pow(1.0 - vUv.x, 2.4));
    float column = smoothstep(0.0, 0.12, vUv.y) * smoothstep(1.0, 0.88, vUv.y);
    gl_FragColor = vec4(uColor, reach * column * uOpacity);
    #include <colorspace_fragment>
  }
`

/** Angular offset and strength of each trailing copy of the beam. */
const TRAIL = [
  { offset: 0, opacity: 0.17 },
  { offset: 0.13, opacity: 0.1 },
  { offset: 0.3, opacity: 0.055 },
  { offset: 0.52, opacity: 0.025 },
]

type SensorBeaconProps = {
  room: SceneRoom
  anim: ScanAnim
  /** Draw the glow: the fan, its trail and the floor pulse. The head stays either way. */
  beam: boolean
}

/**
 * The scanner itself: a puck on a tripod at eye height whose beam sweeps the
 * room once, then idles. It is the visible cause of everything the cloud does.
 */
export function SensorBeacon({ room, anim, beam: showBeam }: SensorBeaconProps) {
  const origin = useMemo(() => sensorOrigin(room), [room])
  const reach = useMemo(() => Math.hypot(room.width, room.depth) / 2 + 0.4, [room])

  const beam = useRef<Group>(null)
  const halo = useRef<Mesh>(null)
  const ring = useRef<Mesh>(null)
  const lamp = useRef<PointLight>(null)

  const fans = useMemo(
    () =>
      TRAIL.map(
        (trail) =>
          new ShaderMaterial({
            uniforms: {
              uColor: { value: new Color('#5ff0d4') },
              uOpacity: { value: trail.opacity },
            },
            vertexShader: FAN_VERTEX,
            fragmentShader: FAN_FRAGMENT,
            transparent: true,
            depthWrite: false,
            side: DoubleSide,
            blending: AdditiveBlending,
          }),
      ),
    [],
  )

  const traceMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color('#b7ffef'),
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    [],
  )

  const floorMaterial = useMemo(
    () =>
      new MeshBasicMaterial({
        color: new Color('#3ee0c2'),
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    [],
  )

  useEffect(
    () => () => {
      fans.forEach((material) => material.dispose())
      floorMaterial.dispose()
      traceMaterial.dispose()
    },
    [fans, floorMaterial, traceMaterial],
  )

  useFrame(() => {
    const sweeping = anim.scan < 1
    // Past the end of the sweep the head keeps turning slowly, so the sensor
    // reads as live equipment rather than a prop that switched off.
    const idle = SWEEP_SPAN + anim.time * 0.045
    const rotation = beamRotationY(sweeping ? anim.scan : idle)
    const strength = (1 - anim.twin) * (sweeping ? 1 : 0.22)

    if (beam.current) {
      beam.current.rotation.y = rotation
      beam.current.visible = showBeam && strength > 0.01
    }
    fans.forEach((material, index) => {
      material.uniforms.uOpacity.value = TRAIL[index].opacity * strength
    })
    traceMaterial.opacity = 0.7 * strength

    const pulse = 0.55 + Math.sin(anim.time * 3.4) * 0.18
    if (halo.current) {
      halo.current.scale.setScalar(1 + Math.sin(anim.time * 2.1) * 0.06)
      const material = halo.current.material as MeshBasicMaterial
      material.opacity = pulse * (1 - anim.twin)
    }
    if (ring.current) {
      ring.current.visible = showBeam
      // A ground ring that expands once per turn and fades at the walls.
      const phase = (anim.time * 0.55) % 1
      ring.current.scale.setScalar(0.25 + phase * reach)
      floorMaterial.opacity = (1 - phase) * 0.28 * (1 - anim.twin) * (sweeping ? 1 : 0.4)
    }
    if (lamp.current) {
      lamp.current.intensity = (0.8 + Math.sin(anim.time * 3.4) * 0.25) * (1 - anim.twin) * 2
    }
  })

  return (
    <group position={origin}>
      <group ref={beam}>
        {fans.map((material, index) => (
          <mesh
            key={index}
            material={material}
            position={[reach / 2, 0, 0]}
            rotation={[0, -TRAIL[index].offset, 0]}
          >
            <planeGeometry args={[reach, room.height * 0.92]} />
          </mesh>
        ))}
        <mesh
          material={traceMaterial}
          rotation={[-Math.PI / 2, 0, 0]}
          position={[reach / 2, -origin[1] + 0.016, 0]}
        >
          <planeGeometry args={[reach, 0.035]} />
        </mesh>
      </group>

      {/* Scanner head */}
      <mesh position={[0, -0.02, 0]} castShadow>
        <cylinderGeometry args={[0.085, 0.085, 0.13, 24]} />
        <meshStandardMaterial color="#141a22" roughness={0.35} metalness={0.6} />
      </mesh>
      <mesh ref={halo} position={[0, 0.045, 0]}>
        <torusGeometry args={[0.092, 0.012, 12, 32]} />
        <meshBasicMaterial color="#5ff0d4" transparent opacity={0.6} blending={AdditiveBlending} />
      </mesh>
      <mesh position={[0, -origin[1] / 2 - 0.07, 0]}>
        <cylinderGeometry args={[0.012, 0.02, origin[1] - 0.09, 10]} />
        <meshStandardMaterial color="#1b222c" roughness={0.5} metalness={0.4} />
      </mesh>
      <pointLight ref={lamp} position={[0, 0.1, 0]} color="#5ff0d4" distance={5} intensity={1} />

      {/* Expanding ground pulse */}
      <mesh
        ref={ring}
        material={floorMaterial}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -origin[1] + 0.012, 0]}
      >
        <ringGeometry args={[0.92, 1, 96]} />
      </mesh>
    </group>
  )
}
