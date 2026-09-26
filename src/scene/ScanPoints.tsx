import { useFrame } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  ShaderMaterial,
} from 'three'
import type { ScanCloud } from './scanCloud'
import type { ScanAnim } from './scanAnim'

const VERTEX = /* glsl */ `
  uniform float uProgress;
  uniform float uTime;
  uniform float uSize;
  uniform float uAtten;
  uniform float uFade;

  attribute vec2 aWindow;
  attribute float aSeed;

  varying float vAge;
  varying float vSeed;

  void main() {
    float span = max(aWindow.y - aWindow.x, 1e-4);
    float age = clamp((uProgress - aWindow.x) / span, 0.0, 1.0);
    vAge = age;
    vSeed = aSeed;

    // A return drifts in from a slightly wrong place and settles onto the surface,
    // the way a real point cloud tightens as more sweeps agree with each other.
    float settle = 1.0 - pow(1.0 - age, 3.0);
    vec3 drift = vec3(aSeed - 0.5, fract(aSeed * 13.7) - 0.5, fract(aSeed * 7.3) - 0.5);
    vec3 pos = position + drift * (1.0 - settle) * 0.42;
    pos.y += sin(uTime * 1.6 + aSeed * 48.0) * 0.005 * settle;

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;

    float pop = 1.0 + (1.0 - settle) * 2.4;
    float alive = step(0.0001, age) * step(0.004, uFade);
    gl_PointSize = alive * uSize * pop * uAtten / max(-mv.z, 0.05);
  }
`

const FRAGMENT = /* glsl */ `
  uniform vec3 uHot;
  uniform vec3 uCool;
  uniform float uFade;
  uniform float uThink;

  varying float vAge;
  varying float vSeed;

  void main() {
    vec2 offset = gl_PointCoord - 0.5;
    float radius = dot(offset, offset);
    if (radius > 0.25) discard;

    float disc = smoothstep(0.25, 0.015, radius);
    float flash = pow(1.0 - vAge, 2.0);
    vec3 tint = mix(uCool, uHot, clamp(flash + 0.1 + uThink * 0.5, 0.0, 1.0));
    float variance = 0.7 + 0.3 * fract(vSeed * 91.7);

    gl_FragColor = vec4(tint, disc * uFade * variance * mix(0.34, 1.0, flash));
    #include <colorspace_fragment>
  }
`

type ScanPointsProps = {
  cloud: ScanCloud
  anim: ScanAnim
  hot?: string
  cool?: string
  size?: number
}

/**
 * The accumulating LiDAR return cloud.
 *
 * Every return carries the sweep window it belongs to, so the whole cloud is a
 * single draw call that resolves in step with the beam instead of appearing at
 * once.
 */
export function ScanPoints({
  cloud,
  anim,
  hot = '#7ff3dd',
  cool = '#2f7f8c',
  size = 0.05,
}: ScanPointsProps) {
  const geometry = useMemo(() => {
    const next = new BufferGeometry()
    next.setAttribute('position', new BufferAttribute(cloud.positions, 3))
    next.setAttribute('aWindow', new BufferAttribute(cloud.windows, 2))
    next.setAttribute('aSeed', new BufferAttribute(cloud.seeds, 1))
    next.computeBoundingSphere()
    return next
  }, [cloud])

  const material = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uProgress: { value: 0 },
          uTime: { value: 0 },
          uSize: { value: size },
          uAtten: { value: 420 },
          uFade: { value: 1 },
          uThink: { value: 0 },
          uHot: { value: new Color(hot) },
          uCool: { value: new Color(cool) },
        },
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [hot, cool, size],
  )

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  useFrame((state) => {
    const uniforms = material.uniforms
    uniforms.uProgress.value = anim.scan
    uniforms.uTime.value = anim.time
    uniforms.uFade.value = anim.cloud
    uniforms.uThink.value = anim.think
    uniforms.uAtten.value = state.size.height * state.viewport.dpr * 0.5
    material.visible = anim.cloud > 0.004
  })

  return <points geometry={geometry} material={material} frustumCulled={false} />
}
