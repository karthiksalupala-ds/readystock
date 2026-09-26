import { describe, expect, it } from 'vitest'
import { DoubleSide, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial, PerspectiveCamera, PlaneGeometry, Raycaster, Vector3 } from 'three'
import { preserveInspectionCamera, worldSurfaceNormal } from './inspection'

describe('import room inspection', () => {
  it('recognizes a floor whose upward orientation comes from an instance transform', () => {
    const floor = new InstancedMesh(new PlaneGeometry(4, 4), new MeshBasicMaterial({ side: DoubleSide }), 1)
    floor.setMatrixAt(0, new Matrix4().makeRotationX(-Math.PI / 2))
    floor.updateMatrixWorld(true)
    const hit = new Raycaster(new Vector3(0, 2, 0), new Vector3(0, -1, 0)).intersectObject(floor)[0]
    expect(hit.instanceId).toBe(0)
    expect(worldSurfaceNormal(hit)?.y).toBeCloseTo(1)
    floor.geometry.dispose()
    floor.material.dispose()
  })

  it('does not mistake an instanced vertical wall for a floor', () => {
    const wall = new InstancedMesh(new PlaneGeometry(4, 4).rotateX(-Math.PI / 2), new MeshBasicMaterial({ side: DoubleSide }), 1)
    wall.setMatrixAt(0, new Matrix4().makeRotationX(Math.PI / 2))
    wall.updateMatrixWorld(true)
    const hit = new Raycaster(new Vector3(0, 0, 2), new Vector3(0, 0, -1)).intersectObject(wall)[0]
    expect(worldSurfaceNormal(hit)?.y).toBeCloseTo(0)
    wall.geometry.dispose()
    wall.material.dispose()
  })

  it('also transforms ordinary mesh faces through their complete world matrix', () => {
    const floor = new Mesh(new PlaneGeometry(4, 4), new MeshBasicMaterial({ side: DoubleSide }))
    floor.rotation.x = -Math.PI / 2
    floor.updateMatrixWorld(true)
    const hit = new Raycaster(new Vector3(0, 2, 0), new Vector3(0, -1, 0)).intersectObject(floor)[0]
    expect(worldSurfaceNormal(hit)?.y).toBeCloseTo(1)
    floor.geometry.dispose()
    floor.material.dispose()
  })

  it('restores the original pose and projection after import fitting, including a StrictMode replay', () => {
    const camera = new PerspectiveCamera(42, 16 / 9, 0.1, 2000)
    camera.position.set(6.4, 4.2, 6.8)
    camera.lookAt(0, 0.7, 0)
    camera.updateMatrixWorld()
    const position = camera.position.clone()
    const rotation = camera.quaternion.clone()
    const projected = new Vector3(0.5, 0.7, 0).project(camera)
    // React StrictMode: set up, clean up, then set up the same mount again.
    for (let replay = 0; replay < 2; replay++) {
      const restore = preserveInspectionCamera(camera)
      camera.position.set(1500, 400, 2200)
      camera.lookAt(1200, 10, 1600)
      camera.near = 2
      camera.far = 40000
      camera.updateProjectionMatrix()
      camera.updateMatrixWorld()
      restore()
      expect(camera.position.toArray()).toEqual(position.toArray())
      expect(camera.quaternion.toArray()).toEqual(rotation.toArray())
      expect(camera.near).toBe(0.1)
      expect(camera.far).toBe(2000)
      expect(new Vector3(0.5, 0.7, 0).project(camera).distanceTo(projected)).toBeLessThan(1e-10)
    }
  })
})
