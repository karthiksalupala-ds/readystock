import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { AnimationMixer, LoopOnce, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const avatarUrl = new URL('../models/avatars/avatar_casual.glb', import.meta.url);

async function loadAvatar() {
  const data = await readFile(avatarUrl);
  return new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
}

test('casual avatar exports six usable clips with stable floor-origin seating', async () => {
  const gltf = await loadAvatar();
  const durations = { idle: 3, walk: 1.2, run: 0.8, sit_down: 2 / 3, seated_idle: 3, stand_up: 2 / 3 };
  assert.deepEqual(gltf.animations.map(clip => clip.name).sort(), Object.keys(durations).sort());
  const hips = gltf.scene.getObjectByName('hips');
  assert.ok(hips?.isBone, 'hips root bone is available to runtime placement');
  for (const clip of gltf.animations) {
    assert.ok(clip.validate(), `${clip.name} validates`);
    assert.ok(Math.abs(clip.duration - durations[clip.name]) < 0.001, `${clip.name} duration`);
    const mixer = new AnimationMixer(gltf.scene);
    const action = mixer.clipAction(clip).setLoop(LoopOnce, 1);
    action.clampWhenFinished = true;
    action.play();
    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      mixer.setTime(clip.duration * fraction);
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(object => {
        assert.ok(object.matrixWorld.elements.every(Number.isFinite), `${clip.name}: ${object.name} finite transform`);
        if (object.isSkinnedMesh) {
          object.skeleton.update();
          assert.ok(object.skeleton.boneMatrices.every(Number.isFinite), `${clip.name}: finite skin matrices`);
        }
      });
      if (['sit_down', 'seated_idle', 'stand_up'].includes(clip.name)) {
        const position = hips.getWorldPosition(new Vector3());
        assert.ok(Math.abs(position.x) < 0.0001 && Math.abs(position.z) < 0.0001, `${clip.name}: no horizontal root motion`);
        for (const suffix of ['L', 'R']) {
          const ankle = gltf.scene.getObjectByName(`foot${suffix}`) ?? gltf.scene.getObjectByName(`foot.${suffix}`);
          assert.ok(ankle, 'foot joint is available for seat profile calibration');
          assert.ok(Math.abs(ankle.getWorldPosition(new Vector3()).y - 0.1287) < 0.003, `${clip.name}: ${suffix} sole stays grounded throughout transition`);
        }
        const seated = clip.name === 'seated_idle' || (clip.name === 'sit_down' && fraction === 1) || (clip.name === 'stand_up' && fraction === 0);
        if (seated) {
          assert.ok(Math.abs(position.y - 0.55405) < 0.001, `${clip.name}: calibrated seated hips height`);
          for (const suffix of ['L', 'R']) {
            const ankle = gltf.scene.getObjectByName(`foot${suffix}`) ?? gltf.scene.getObjectByName(`foot.${suffix}`);
            assert.ok(ankle, 'foot joint is available for seat profile calibration');
            const foot = ankle.getWorldPosition(new Vector3());
            assert.ok(Math.abs(foot.y - 0.1287) < 0.002, `${clip.name}: grounded ${suffix} foot`);
            assert.ok(foot.z > 0.4 && foot.z < 0.45, `${clip.name}: knees and feet face forward`);
          }
        }
      }
    }
    mixer.stopAllAction();
    mixer.uncacheRoot(gltf.scene);
  }
});
