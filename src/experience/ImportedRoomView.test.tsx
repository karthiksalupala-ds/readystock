import { Children, isValidElement, type ReactNode } from 'react'
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, PerspectiveCamera, Scene } from 'three'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ImportedRoomView } from './ImportedRoomView'
import { PRESETS } from '../settings/graphics'

const hooks = vi.hoisted(() => ({ effects: [] as (() => void | (() => void))[] }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useMemo: (factory: () => unknown) => factory(),
  useRef: (value: unknown) => ({ current: value }),
  useEffect: (effect: () => void | (() => void)) => { hooks.effects.push(effect) },
  useLayoutEffect: () => {},
}))
vi.mock('@react-three/fiber', () => ({
  useThree: () => ({ camera: new PerspectiveCamera(), scene: new Scene(), gl: { localClippingEnabled: false } }),
}))
vi.mock('@react-three/drei', () => ({ OrbitControls: () => null }))

function elementProps(tree: ReactNode, type: string): Record<string, unknown>[] {
  return Children.toArray(tree).flatMap(child => {
    if (!isValidElement<{ children?: ReactNode }>(child)) return []
    return [...(child.type === type ? [child.props] : []), ...elementProps(child.props.children, type)]
  })
}

beforeEach(() => { hooks.effects = [] })

describe('imported room shadow geometry', () => {
  it('supplies missing normals for shadow bias while retaining the source and disposing only display clones', () => {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new BufferAttribute(new Float32Array([-1, 0, -1, -1, 0, 1, 1, 0, 1]), 3))
    const material = new MeshStandardMaterial({ flatShading: true })
    const root = new Group()
    root.add(new Mesh(geometry, material), new Mesh(geometry, material))
    const disposeOriginal = vi.spyOn(geometry, 'dispose')
    const tree = ImportedRoomView({
      room: { id: 'room', name: 'room', root, bounds: { min: [4, 2, 14], max: [16, 8, 26] }, triangleCount: 2, dispose: vi.fn() },
      scale: 1, position: [0, 0, 0], selecting: true, playing: false, marker: null, onPick: vi.fn(), settings: PRESETS.high,
    })
    const displayed = elementProps(tree, 'primitive')[0].object as Group
    const first = displayed.children[0] as Mesh
    const second = displayed.children[1] as Mesh
    expect(first.geometry.getAttribute('normal')).toBeDefined()
    expect(first.geometry.getAttribute('normal').getY(0)).toBe(1)
    expect(first.geometry).not.toBe(geometry)
    expect(second.geometry).toBe(first.geometry)
    expect(geometry.getAttribute('normal')).toBeUndefined()
    expect((first.material as MeshStandardMaterial).flatShading).toBe(true)
    const disposeClone = vi.spyOn(first.geometry, 'dispose')
    const cleanups = hooks.effects.map(effect => effect())
    expect(first.castShadow).toBe(true)
    expect(first.receiveShadow).toBe(true)
    cleanups.forEach(cleanup => cleanup?.())
    expect(disposeClone).toHaveBeenCalledTimes(1)
    expect(disposeOriginal).not.toHaveBeenCalled()
  })

  it('aims directional lighting at the transformed room center', () => {
    const root = new Group()
    const tree = ImportedRoomView({
      room: { id: 'room', name: 'room', root, bounds: { min: [4, 2, 14], max: [16, 8, 26] }, triangleCount: 0, dispose: vi.fn() },
      scale: 0.5, position: [-5, -1, -10], selecting: true, playing: false, marker: null, onPick: vi.fn(), settings: PRESETS.high,
    })
    const lights = elementProps(tree, 'directionalLight')
    const target = lights[0].target as Group | undefined
    expect(target?.position.toArray()).toEqual([0, 1.5, 0])
    expect(lights[1].target).toBe(target)
    expect(elementProps(tree, 'primitive').some(props => props.object === target)).toBe(true)
  })
})
