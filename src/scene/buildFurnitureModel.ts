import { BoxGeometry, CylinderGeometry, Group, Mesh, SphereGeometry, type BufferGeometry, type MeshStandardMaterial } from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { shapeFor } from './appearance'
import { makeSurface, surfaceTexture } from './modelMaterials'
import type { SceneObject, Vec3 } from './types'
import { PROCEDURAL_CHAIR_SEAT, STANDARD_CHAIR_SEAT, PROCEDURAL_SOFA, proceduralSofaSeats } from '../interaction/profiles'
import { usesDemoFurniture } from '../assets/catalog'

/** Models use a unit bounding volume, so every style retains the measured footprint. */
export function buildFurnitureModel(object: SceneObject) {
  const root = new Group()
  const body = new Group()
  root.add(body)
  const maps = new Map<string, ReturnType<typeof surfaceTexture>>()
  const materials: MeshStandardMaterial[] = []
  const geometries: BufferGeometry[] = []
  function surface(color: string, finish: string) {
    if (!maps.has(finish)) maps.set(finish, surfaceTexture(finish))
    const material = makeSurface(color, finish, maps.get(finish))
    materials.push(material)
    return material
  }
  const primary = surface(object.color ?? '#a58a68', object.material ?? 'wood')
  const frame = surface('#333a40', 'metal')
  const chrome = surface('#aeb8bc', 'metal')
  const dark = surface('#161d25', 'plastic')
  const timber = surface('#b58a58', 'wood')
  const shape = shapeFor(object)

  function part(geometry: BufferGeometry, position: Vec3, material = primary, scale?: Vec3, rotation?: Vec3) {
    geometries.push(geometry)
    const mesh = new Mesh(geometry, material)
    mesh.position.set(...position)
    if (scale) mesh.scale.set(...scale)
    if (rotation) mesh.rotation.set(...rotation)
    mesh.castShadow = mesh.receiveShadow = true
    body.add(mesh)
    return mesh
  }
  function box(size: Vec3, position: Vec3, material = primary, radius = 0.012) {
    const geometry = radius > 0
      ? new RoundedBoxGeometry(...size, 2, Math.min(radius, ...size.map((v) => v / 3)))
      : new BoxGeometry(...size)
    return part(geometry, position, material)
  }
  function cylinder(radius: number, height: number, position: Vec3, material = frame, scale?: Vec3) {
    return part(new CylinderGeometry(radius, radius, height, 24), position, material, scale)
  }

  if (object.type === 'table') {
    if (shape === 'oval') cylinder(0.5, 0.075, [0, 0.4625, 0], primary)
    else box([1, 0.075, 1], [0, 0.4625, 0], primary, shape === 'rounded' ? 0.035 : 0.006)
    box([0.72, 0.08, 0.62], [0, 0.385, 0], frame)
    if (shape === 'oval') {
      for (const x of [-0.24, 0.24]) {
        cylinder(0.035, 0.79, [x, -0.045, 0], chrome)
        box([0.23, 0.06, 0.6], [x, -0.47, 0], frame)
      }
    } else {
      for (const x of [-0.39, 0.39]) for (const z of [-0.36, 0.36]) {
        box([0.035, 0.85, 0.055], [x, -0.075, z], frame)
        box([0.045, 0.02, 0.065], [x, -0.49, z], dark)
      }
    }
    // Inset cable hatch and the split in its lid.
    box([0.15, 0.004, 0.07], [0, 0.496, -0.18], frame, 0.003)
    box([0.12, 0.003, 0.004], [0, 0.499, -0.18], dark, 0)
  } else if (object.type === 'chair') {
    const contact = usesDemoFurniture(object) ? STANDARD_CHAIR_SEAT : PROCEDURAL_CHAIR_SEAT
    box([0.89, 0.09, 0.8], [0, -0.05, 0.035], frame, 0.025)
    box([0.92, 0.12, 0.83], [0, contact[1] - 0.06, contact[2]], primary, 0.04)
    box([0.86, 0.46, 0.14], [0, 0.27, -0.40], primary, shape === 'visitor' ? 0.018 : 0.045)
    // Upholstery seams and lumbar pad, kept in the same color family.
    const seam = surface(primary.color.clone().multiplyScalar(0.7).getStyle(), object.material ?? 'fabric')
    box([0.79, 0.012, 0.012], [0, 0.43, -0.323], seam, 0.003)
    box([0.7, 0.10, 0.035], [0, 0.18, -0.32], primary)
    for (const x of [-0.31, 0.31]) box([0.035, 0.30, 0.045], [x, 0.01, -0.40], frame)
    if (shape !== 'visitor') for (const x of [-0.46, 0.46]) {
      box([0.045, 0.2, 0.05], [x, 0.05, 0.03], chrome)
      box([0.08, 0.05, 0.53], [x, 0.165, 0.025], shape === 'armchair' ? primary : dark)
    }
    if (shape === 'task') {
      cylinder(0.045, 0.28, [0, -0.23, 0], chrome)
      for (let i = 0; i < 5; i++) {
        const angle = i * Math.PI * 2 / 5
        const spoke = box([0.06, 0.045, 0.39], [Math.sin(angle) * 0.19, -0.405, Math.cos(angle) * 0.19], frame)
        spoke.rotation.y = angle
        part(new SphereGeometry(0.055, 12, 8), [Math.sin(angle) * 0.38, -0.45, Math.cos(angle) * 0.38], dark, [1, 0.9, 1])
      }
    } else for (const x of [-0.35, 0.35]) for (const z of [-0.3, 0.34]) {
      box([0.055, 0.41, 0.055], [x, -0.295, z], shape === 'armchair' ? timber : chrome)
    }
  } else if (object.type === 'sofa') {
    const cushions = proceduralSofaSeats(object.size[0])
    const profile = PROCEDURAL_SOFA
    box([0.94, 0.20, 0.9], [0, -0.235, 0], primary, 0.035)
    box([0.90, 0.62, 0.16], [0, 0.19, -0.42], primary, 0.045)
    for (const x of [-0.45, 0.45]) box([0.1, 0.46, 1], [x, -0.005, 0], primary, 0.035)
    for (const x of [-0.40, 0.40]) for (const z of [-0.37, 0.37]) box([0.055, 0.165, 0.07], [x, -0.4175, z], timber)
    const cushion = surface(object.color ?? '#839b95', object.material ?? 'fabric')
    for (const [x] of cushions) {
      box([profile.innerWidth / cushions.length - 0.008, profile.cushionHeight, profile.cushionDepth],
        [x, profile.seatTop - profile.cushionHeight / 2, profile.seatCenterZ], cushion, 0.035)
      box([profile.innerWidth / cushions.length - 0.008, 0.40, 0.16], [x, 0.245, -0.26], cushion, 0.035)
    }
  } else if (object.type === 'lamp') {
    cylinder(0.40, 0.025, [0, -0.4875, 0], dark)
    cylinder(0.031, 0.89, [0, -0.03, 0], chrome)
    const shade = surface(object.color ?? '#e7dcc6', object.material ?? 'fabric')
    shade.userData.powerSurface = 'lamp'
    const bulb = surface('#fff0d4', 'plastic')
    bulb.userData.powerSurface = 'lamp'
    bulb.userData.bulb = true
    part(new CylinderGeometry(0.31, 0.5, 0.194, 24, 1, true), [0, 0.403, 0], shade)
    part(new SphereGeometry(0.071, 16, 12), [0, 0.375, 0], bulb, [1, 0.55, 1])
  } else if (object.type === 'shelf') {
    for (const x of [-0.48, 0.48]) box([0.04, 1, 1], [x, 0, 0])
    box([0.92, 0.95, 0.035], [0, 0, -0.4825])
    for (const y of [-0.46, -0.22, 0.02, 0.26, 0.48]) box([0.92, 0.04, 1], [0, y, 0], timber)
    if (shape === 'partitioned') box([0.025, 0.92, 0.94], [0, 0, 0.015])
    const bookColors = ['#648378', '#ae674d', '#dfc9a1', '#4e6786', '#b89860']
    const books = bookColors.map((color) => surface(color, 'fabric'))
    for (let row = 0; row < 4; row++) {
      if (shape === 'cabinet' && row < 2) continue
      for (let i = 0; i < 5; i++) {
        const height = 0.13 + (i % 3) * 0.018
        const x = -0.38 + i * 0.065
        const y = -0.44 + row * 0.24 + height / 2
        box([0.05, height, 0.61], [x, y, 0.11], books[(i + row) % books.length], 0.003)
        box([0.032, 0.004, 0.004], [x, y + height * 0.25, 0.417], timber, 0)
      }
      box([0.23, 0.12, 0.65], [0.27, -0.38 + row * 0.24, 0.10], books[(row + 2) % books.length])
      box([0.07, 0.018, 0.01], [0.27, -0.36 + row * 0.24, 0.43], chrome)
    }
    if (shape === 'cabinet') for (const x of [-0.23, 0.23]) {
      box([0.445, 0.45, 0.045], [x, -0.225, 0.47])
      box([0.02, 0.07, 0.018], [x * 0.2, -0.19, 0.493], chrome)
    }
  } else if (object.type === 'monitor') {
    const h = shape === 'wide' ? 0.61 : 0.77
    box([1, h, 0.50], [0, 0.5 - h / 2, -0.12], primary, 0.024)
    const screen = surface('#183342', 'plastic')
    screen.userData.powerSurface = 'screen'
    box([0.94, h - 0.075, 0.02], [0, 0.5 - h / 2 + 0.006, 0.14], screen, 0.005)
    // A subtle dashboard gives the screen depth without external assets.
    const pixel = surface('#67afa9', 'plastic')
    pixel.userData.powerSurface = 'screen'
    for (let i = 0; i < 7; i++) box([0.035, 0.06 + i % 3 * 0.035, 0.008], [-0.32 + i * 0.075, 0.10, 0.156], pixel, 0.002)
    box([0.11, 0.36, 0.32], [0, -0.3, -0.08], chrome)
    box([0.44, 0.055, 1], [0, -0.4725, 0], frame)
    box([0.016, 0.008, 0.012], [0.44, 0.5 - h + 0.017, 0.14], pixel)
  } else if (object.type === 'door' || object.type === 'window') {
    for (const x of [-0.47, 0.47]) box([0.06, 1, 1], [x, 0, 0], object.type === 'window' ? chrome : primary)
    for (const y of [-0.48, 0.48]) box([0.88, 0.04, 1], [0, y, 0], object.type === 'window' ? chrome : primary)
    if (object.type === 'door') {
      box([0.87, 0.94, 0.48], [0, 0, 0])
      if (shape === 'panelled') for (const y of [-0.24, 0.24]) for (const z of [-0.27, 0.27]) {
        box([0.68, 0.35, 0.06], [0, y, z], primary, 0.008)
      }
      for (const z of [-0.37, 0.37]) {
        box([0.045, 0.09, 0.08], [0.31, -0.02, z], chrome)
        box([0.13, 0.018, 0.12], [0.27, 0.0, z], chrome)
      }
    } else {
      const glass = surface(object.color ?? '#8fbcc8', 'plastic')
      glass.roughness = 0.08
      glass.userData.baseOpacity = 0.3
      glass.transparent = true
      glass.depthWrite = false
      box([0.88, 0.92, 0.12], [0, 0, 0], glass, 0.001)
      if (shape === 'divided') {
        box([0.025, 0.94, 0.6], [0, 0, 0], chrome)
        box([0.88, 0.02, 0.6], [0, 0.02, 0], chrome)
      }
    }
  } else box([1, 1, 1], [0, 0, 0], primary, shape === 'rectangular' ? 0 : 0.04)

  // Thin objects may face along X instead of Z (the demo shelf and window do).
  if (!object.rotation && ['shelf', 'window', 'door', 'monitor'].includes(object.type) && object.size[0] < object.size[2]) {
    body.rotation.y = Math.PI / 2
    body.scale.set(object.size[2], object.size[1], object.size[0])
  } else body.scale.set(...object.size)
  root.name = `model:${object.id}:${shape}`
  return {
    root, materials,
    dispose() {
      geometries.forEach((geometry) => geometry.dispose())
      materials.forEach((material) => material.dispose())
      maps.forEach((map) => map.dispose())
    },
  }
}
