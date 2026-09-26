import type { Intersection, OrthographicCamera, PerspectiveCamera } from 'three'
import { InstancedMesh, Matrix3, Matrix4, Vector3 } from 'three'

/** Raycaster face normals are local to the geometry, including instanced meshes. */
export function worldSurfaceNormal(hit: Intersection): Vector3 | null {
  if (!hit.face) return null
  const transform = hit.object.matrixWorld.clone()
  if (hit.object instanceof InstancedMesh && hit.instanceId !== undefined) {
    const instance = new Matrix4()
    hit.object.getMatrixAt(hit.instanceId, instance)
    transform.multiply(instance)
  }
  return hit.face.normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(transform)).normalize()
}

/** Call before fitting an imported room; cleanup restores the prior inspection view. */
export function preserveInspectionCamera(camera: PerspectiveCamera | OrthographicCamera): () => void {
  const position = camera.position.clone()
  const rotation = camera.quaternion.clone()
  const near = camera.near
  const far = camera.far
  return () => {
    camera.position.copy(position)
    camera.quaternion.copy(rotation)
    camera.near = near
    camera.far = far
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
  }
}
