/**
 * Load every InteliDar GLB using this repository's installed Three.js runtime.
 * No browser or WebGL context is required because the pack uses no textures.
 * Usage: node models/source/validate_three.mjs [models-root] [output-json]
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AnimationMixer, Box3, Vector3, REVISION } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(here, '..');

async function exportedFiles(root) {
  const result = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory() && !['source', 'previews'].includes(entry.name)) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) {
        result.push(fullPath);
      }
    }
  }
  await walk(root);
  return result.sort();
}

function finiteAttribute(attribute) {
  const accessors = ['getX', 'getY', 'getZ', 'getW'];
  for (let index = 0; index < attribute.count; index += 1) {
    for (let component = 0; component < attribute.itemSize; component += 1) {
      if (!Number.isFinite(attribute[accessors[component]](index))) return false;
    }
  }
  return true;
}

function bounds(scene) {
  scene.updateMatrixWorld(true);
  const box = new Box3().setFromObject(scene, true);
  if (box.isEmpty()) throw new Error('Loaded scene has empty bounds');
  const size = box.getSize(new Vector3());
  const numbers = [...box.min.toArray(), ...box.max.toArray(), ...size.toArray()];
  if (!numbers.every(Number.isFinite)) throw new Error('Loaded scene has nonfinite bounds');
  const rounded = vector => vector.toArray().map(value => Math.round(value * 1e6) / 1e6);
  return { min: rounded(box.min), max: rounded(box.max), dimensions_m: rounded(size) };
}

export async function validateThreeAsset(filename) {
  const result = {
    filename: path.basename(filename), path: path.resolve(filename), failures: [], warnings: [],
    triangles: 0, vertices: 0, mesh_count: 0, skinned_mesh_count: 0,
    materials: [], skeleton_bone_counts: [], animations: [],
  };
  const previousWarn = console.warn;
  const originalError = console.error;
  console.warn = (...values) => result.warnings.push(values.map(String).join(' '));
  console.error = (...values) => result.failures.push(values.map(String).join(' '));
  let gltf;
  try {
    const data = await readFile(filename);
    result.file_bytes = data.byteLength;
    const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
    gltf = await new GLTFLoader().parseAsync(buffer, '');
    const meshes = [];
    const materials = new Set();
    const skeletons = new Set();
    const animationRoot = gltf.scene;
    animationRoot.updateMatrixWorld(true);
    animationRoot.traverse(object => {
      if (!object.matrix.elements.every(Number.isFinite) || !object.matrixWorld.elements.every(Number.isFinite)) {
        result.failures.push(`${object.name}: invalid local/world transform`);
      }
      if (!object.isMesh) return;
      meshes.push(object);
      result.mesh_count += 1;
      const { geometry } = object;
      const position = geometry.getAttribute('position');
      if (!position || !position.count) {
        result.failures.push(`${object.name}: missing geometry`);
        return;
      }
      result.vertices += position.count;
      result.triangles += (geometry.index?.count ?? position.count) / 3;
      for (const name of ['position', 'normal', 'uv']) {
        const attribute = geometry.getAttribute(name);
        if (!attribute || attribute.count !== position.count || !finiteAttribute(attribute)) {
          result.failures.push(`${object.name}: missing, mismatched, or nonfinite ${name} attribute`);
        }
      }
      const normal = geometry.getAttribute('normal');
      if (normal) {
        for (let i = 0; i < normal.count; i += 1) {
          const lengthSquared = normal.getX(i) ** 2 + normal.getY(i) ** 2 + normal.getZ(i) ** 2;
          if (Math.abs(lengthSquared - 1) > 0.025) {
            result.failures.push(`${object.name}: nonunit normals`);
            break;
          }
        }
      }
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!material?.isMeshStandardMaterial) {
          result.failures.push(`${object.name}: material is not glTF-compatible MeshStandardMaterial`);
        }
        if (material) materials.add(material);
      }
      if (object.isSkinnedMesh) {
        result.skinned_mesh_count += 1;
        if (!object.skeleton || object.skeleton.bones.length === 0) {
          result.failures.push(`${object.name}: missing skeleton`);
        } else {
          skeletons.add(object.skeleton);
          object.skeleton.update();
          if (!object.skeleton.boneMatrices.every(Number.isFinite)) {
            result.failures.push(`${object.name}: invalid skeleton matrices`);
          }
        }
        for (const name of ['skinIndex', 'skinWeight']) {
          const attribute = geometry.getAttribute(name);
          if (!attribute || !finiteAttribute(attribute)) {
            result.failures.push(`${object.name}: missing or invalid ${name}`);
          }
        }
      }
    });
    if (!meshes.length || !result.triangles) result.failures.push('No mesh triangles loaded');
    if (!Number.isInteger(result.triangles)) result.failures.push('Triangle count is not integral');
    result.materials = [...materials].map(material => ({
      name: material.name, type: material.type, roughness: material.roughness,
      metalness: material.metalness, color_linear: material.color.toArray(),
      texture_count: Object.values(material).filter(value => value?.isTexture).length,
    })).sort((a, b) => a.name.localeCompare(b.name));
    result.material_count = materials.size;
    result.skeleton_bone_counts = [...skeletons].map(skeleton => skeleton.bones.length);
    result.bounds_y_up = bounds(animationRoot);

    for (const clip of gltf.animations) {
      const animation = {
        name: clip.name, duration_seconds: clip.duration, tracks: clip.tracks.length,
        samples: [],
      };
      if (!clip.validate() || !Number.isFinite(clip.duration) || clip.duration <= 0) {
        result.failures.push(`${clip.name}: invalid animation clip`);
      }
      const mixer = new AnimationMixer(animationRoot);
      const action = mixer.clipAction(clip);
      action.play();
      for (const fraction of [0, 0.25, 0.5, 0.75, 0.999]) {
        const time = clip.duration * fraction;
        mixer.setTime(time);
        animationRoot.updateMatrixWorld(true);
        for (const skeleton of skeletons) {
          skeleton.update();
          if (!skeleton.boneMatrices.every(Number.isFinite)) {
            result.failures.push(`${clip.name}: nonfinite skeleton at ${time}s`);
          }
        }
        animation.samples.push({ time_seconds: Math.round(time * 1e6) / 1e6, bounds_y_up: bounds(animationRoot) });
      }
      mixer.stopAllAction();
      mixer.uncacheRoot(animationRoot);
      result.animations.push(animation);
    }
    for (const warning of result.warnings) {
      if (/No target node|not found|could not|unsupported|couldn't/i.test(warning)) {
        result.failures.push(`Three.js warning: ${warning}`);
      }
    }
  } catch (error) {
    result.failures.push(`${error.name}: ${error.message}`);
  } finally {
    console.warn = previousWarn;
    console.error = originalError;
    if (gltf) {
      const disposedGeometry = new Set();
      const disposedMaterial = new Set();
      gltf.scene.traverse(object => {
        if (object.geometry && !disposedGeometry.has(object.geometry)) {
          object.geometry.dispose();
          disposedGeometry.add(object.geometry);
        }
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          if (material && !disposedMaterial.has(material)) {
            material.dispose();
            disposedMaterial.add(material);
          }
        }
      });
    }
  }
  result.ok = result.failures.length === 0;
  return result;
}

export async function validateThreePack(rootPath = defaultRoot) {
  const root = path.resolve(rootPath);
  const assets = [];
  // Sequential loading keeps captured loader diagnostics attributable per asset.
  for (const filename of await exportedFiles(root)) assets.push(await validateThreeAsset(filename));
  const failures = assets.filter(asset => !asset.ok).map(asset => ({ path: asset.path, failures: asset.failures }));
  if (!assets.length) failures.push({ path: root, failures: ['No exported GLB assets found'] });
  return {
    generated_at: new Date().toISOString(), three_revision: REVISION,
    root, ok: failures.length === 0, asset_count: assets.length,
    total_triangles: assets.reduce((sum, asset) => sum + asset.triangles, 0),
    total_file_bytes: assets.reduce((sum, asset) => sum + (asset.file_bytes ?? 0), 0),
    total_animation_clips: assets.reduce((sum, asset) => sum + asset.animations.length, 0),
    assets, failures,
    limitation: 'Loader and CPU animation validation; no WebGL renderer or shader compilation is exercised.',
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? defaultRoot);
  const output = path.resolve(process.argv[3] ?? path.join(root, 'validation_three.json'));
  const report = await validateThreePack(root);
  await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`${report.ok ? 'PASS' : 'FAIL'}: Three.js r${report.three_revision}, ${report.asset_count} assets, ${report.total_triangles.toLocaleString()} triangles, ${report.total_animation_clips} animation clips; ${output}`);
  for (const failure of report.failures) console.log(`${failure.path}: ${failure.failures.join('; ')}`);
  process.exitCode = report.ok ? 0 : 1;
}
