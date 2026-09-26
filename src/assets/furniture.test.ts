import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Vector3 } from 'three'
import { describe, expect, it, vi } from 'vitest'
import { cloneFurniture, fitFurniture, updateFurnitureMaterials } from './furniture'
import { furnitureAssetFor } from './catalog'

describe('furniture placement and instances', () => {
  it('maps known semantic types and leaves unknown objects as fallback boxes', () => {
    expect(furnitureAssetFor('chair')).toContain('chair_standard')
    expect(furnitureAssetFor('table')).toContain('table_dining')
    expect(furnitureAssetFor('shelf')).toContain('shelf_open')
    expect(furnitureAssetFor('monitor')).toContain('monitor_desktop')
    expect(furnitureAssetFor('door')).toBeUndefined()
  })

  it('fits a floor-pivot source to a graph box with its bottom at the support height', () => {
    const bounds = new Box3(new Vector3(-0.7, 0, -0.4), new Vector3(0.7, 0.75, 0.4))
    const fitted = fitFurniture(bounds, [2.4, 0.76, 1.2])
    expect(fitted.scale[0]).toBeCloseTo(2.4 / 1.4)
    expect(fitted.scale[1]).toBeCloseTo(0.76 / 0.75)
    expect(fitted.scale[2]).toBeCloseTo(1.5)
    expect(fitted.position[1]).toBeCloseTo(-0.38)
    expect(0.38 + fitted.position[1]).toBeCloseTo(0)
  })

  it('centers asymmetric source bounds and places a monitor base exactly on the tabletop', () => {
    const bounds = new Box3(new Vector3(-0.29, 0, -0.08), new Vector3(0.29, 0.478, 0.12))
    const fitted = fitFurniture(bounds, [0.58, 0.478, 0.2])
    expect(0.999 + fitted.position[1]).toBeCloseTo(0.76)
    expect(fitted.position[2]).toBeCloseTo(-0.02)
  })

  it('shares geometry, isolates highlight materials, and disposes only owned resources', () => {
    const source = new Group()
    const geometry = new BoxGeometry()
    const material = new MeshStandardMaterial({ color: '#998877', emissive: '#112233', emissiveIntensity: 0.15 })
    source.add(new Mesh(geometry, material))
    const first = cloneFurniture(source)
    const second = cloneFurniture(source)
    const firstMesh = first.scene.children[0] as Mesh
    const secondMesh = second.scene.children[0] as Mesh
    expect(firstMesh.geometry).toBe(geometry)
    expect(firstMesh.material).not.toBe(secondMesh.material)
    expect(firstMesh.material).not.toBe(material)
    updateFurnitureMaterials(first.materials, 1, 0.6)
    expect((firstMesh.material as MeshStandardMaterial).emissiveIntensity).toBeGreaterThan(0.15)
    expect((secondMesh.material as MeshStandardMaterial).emissiveIntensity).toBe(0.15)
    updateFurnitureMaterials(first.materials, 1, 0)
    expect((firstMesh.material as MeshStandardMaterial).emissive.getHex()).toBe(material.emissive.getHex())
    const disposeGeometry = vi.spyOn(geometry, 'dispose')
    const disposeOriginal = vi.spyOn(material, 'dispose')
    const disposeClone = vi.spyOn(firstMesh.material as MeshStandardMaterial, 'dispose')
    first.dispose()
    expect(disposeClone).toHaveBeenCalledOnce()
    expect(disposeOriginal).not.toHaveBeenCalled()
    expect(disposeGeometry).not.toHaveBeenCalled()
    second.dispose()
  })
})
