import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Google MediaPipe canonical vertices; Apache-2.0, see public/licenses/mediapipe.txt.
const vertices = JSON.parse(readFileSync(new URL('./fixtures/canonicalFace.json', import.meta.url)));

// Geometry tests use deterministic face input and do not depend on the CDN model.
test.beforeEach(async ({ page }) => {
  await page.route('**/src/hooks/useFaceLandmarker.ts*', route => route.fulfill({
    contentType: 'application/javascript',
    body: 'export function useFaceLandmarker() { return { status: "ready", faceLandmarker: null, retry() {} }; }',
  }));
});

test('pose stays anchored and equally sized through yaw, pitch, roll and gaze changes', async ({ page }) => {
  await page.goto('/');
  const results = await page.evaluate(async vertices => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { estimateFacePose, FacePoseSmoother } = await import('/src/utils/facePose.ts');
    const make = (pitch, yaw, roll) => {
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, roll, 'YXZ'));
      const matrix = new THREE.Matrix4().makeRotationFromQuaternion(q).toArray();
      const landmarks = vertices.map(v => {
        const p = new THREE.Vector3(...v).applyQuaternion(q).multiplyScalar(18);
        return { x: .5 + p.x / 960, y: .5 - p.y / 720, z: -p.z / 960 };
      });
      return { landmarks, matrix, q };
    };
    const output = [];
    const baseline = estimateFacePose(make(0, 0, 0).landmarks, 960, 720, 1.52);
    for (const [pitch, yaw, roll] of [[0, 0, 0], [0, .65, 0], [0, -.65, 0], [.4, .3, .2], [-.4, -.3, -.2]]) {
      const { landmarks, matrix, q } = make(pitch, yaw, roll);
      const pose = estimateFacePose(landmarks, 960, 720, 1.52, matrix);
      const fallback = estimateFacePose(landmarks, 960, 720, 1.52);
      output.push({
        widthRatio: pose.width / baseline.width,
        angleError: pose.rotation.angleTo(q),
        fallbackError: fallback.rotation.angleTo(q),
        anchorError: pose.position.x - ((landmarks[133].x + landmarks[362].x) / 2 - .5) * 960,
      });
      const changedGaze = [...landmarks, ...Array.from({ length: 10 }, () => ({ x: .9, y: .1, z: 0 }))];
      const gazePose = estimateFacePose(changedGaze, 960, 720, 1.52, matrix);
      if (pose.position.distanceTo(gazePose.position) > 1e-8) throw Error('Gaze moved the frame');
    }
    const { landmarks } = make(0, 0, 0);
    landmarks[33].z = NaN;
    if (estimateFacePose(landmarks, 960, 720, 1.52) !== null) throw Error('Accepted invalid landmarks');

    const smoother = new FacePoseSmoother();
    const first = smoother.next(baseline, 0);
    const originalX = first.position.x;
    const moved = { ...baseline, position: baseline.position.clone().add(new THREE.Vector3(10, 0, 0)) };
    const next = smoother.next(moved, 16);
    if (!(next.position.x > originalX && next.position.x < moved.position.x)) throw Error('No position smoothing');
    const missingThenReacquired = smoother.next(moved, 1000);
    if (missingThenReacquired.position.distanceTo(moved.position) > 1e-8) throw Error('Stale pose on reacquisition');
    return output;
  }, vertices);
  for (const result of results) {
    expect(result.widthRatio).toBeCloseTo(1, 5);
    expect(result.angleError).toBeLessThan(1e-6);
    expect(result.fallbackError).toBeLessThan(.02);
    expect(Math.abs(result.anchorError)).toBeLessThan(1e-5);
  }
});

test('front frames remain intact across three models and head poses', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const results = await page.evaluate(async vertices => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { Glasses3D } = await import('/src/utils/glasses3D.ts');
    const { GLASSES_CATALOG } = await import('/src/data/glasses.ts');
    const output = [];
    const transform = { centerX: 480, centerY: 300, width: 250, height: 90, rotation: 0, visible: true };
    const capture = canvas => {
      const copy = document.createElement('canvas'); copy.width = 960; copy.height = 720;
      const ctx = copy.getContext('2d'); ctx.drawImage(canvas, 0, 0);
      return ctx.getImageData(0, 0, 960, 720).data;
    };
    const engine = new Glasses3D();
    for (const config of GLASSES_CATALOG) await engine.load(config);
    for (const config of GLASSES_CATALOG) {
      for (const [pitch, yaw] of [[0, 0], [0, .65], [0, -.65], [.4, .3], [-.4, -.3]]) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ'));
        const matrix = new THREE.Matrix4().makeRotationFromQuaternion(q).toArray();
        const landmarks = vertices.map(v => {
          const p = new THREE.Vector3(...v).applyQuaternion(q).multiplyScalar(18);
          return { x: .5 + p.x / 960, y: .5 - p.y / 720, z: -p.z / 960 };
        });
        // Reset the temporal filter between independent test poses.
        engine.render(960, 720, config, null, null);
        const canvas = engine.render(960, 720, config, transform, landmarks, matrix);
        const withDepth = capture(canvas);
        engine.faceOccluder.visible = false;
        engine.headOccluder.visible = false;
        engine.templeFadeEnabled.value = 0;
        engine.nearTempleVisible.value = 0;
        engine.renderer.render(engine.scene, engine.camera);
        const withoutDepth = capture(canvas);
        engine.templeFadeEnabled.value = 1;
        engine.nearTempleVisible.value = 1;
        let visible = 0, original = 0, removed = 0;
        for (let i = 3; i < withDepth.length; i += 4) {
          if (withDepth[i] > 32) visible++;
          if (withoutDepth[i] > 32) original++;
          if (withoutDepth[i] > 32 && withDepth[i] <= 32) removed++;
        }
        let frontRetention = null;
        if (pitch === 0 && yaw === 0) {
          const hidden = [];
          engine.models.get(config.id).traverse(object => {
            if (object.isMesh && object.name !== config.frontMesh && object.name !== config.lensMesh) {
              hidden.push([object, object.visible]); object.visible = false;
            }
          });
          engine.faceOccluder.visible = engine.headOccluder.visible = true;
          engine.renderer.render(engine.scene, engine.camera);
          const frontWithDepth = capture(canvas);
          engine.faceOccluder.visible = engine.headOccluder.visible = false;
          engine.renderer.render(engine.scene, engine.camera);
          const frontWithoutDepth = capture(canvas);
          let frontVisible = 0, frontOriginal = 0;
          for (let i = 3; i < frontWithDepth.length; i += 4) {
            if (frontWithDepth[i] > 32) frontVisible++;
            if (frontWithoutDepth[i] > 32) frontOriginal++;
          }
          frontRetention = frontVisible / frontOriginal;
          for (const [object, wasVisible] of hidden) object.visible = wasVisible;
        }
        output.push({ id: config.id, pitch, yaw, visible, original, removed, frontRetention });
      }
    }
    engine.dispose();
    return output;
  }, vertices);
  console.log(JSON.stringify(results));
  for (const result of results) {
    expect(result.original).toBeGreaterThan(1000);
    expect(result.visible / result.original).toBeGreaterThan(.75);
    // Near-arm completeness and far-arm depth are checked in the isolated-arm
    // test below; their projections can overlap the front in this full render.
    // A depth mask that also cuts away the bridge/front is not a passing fix.
    if (result.frontRetention !== null) expect(result.frontRetention).toBeGreaterThan(.995);
  }
});

test('side views do not leave detached ear hooks during a continuous head turn', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  const results = await page.evaluate(async vertices => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { Glasses3D } = await import('/src/utils/glasses3D.ts');
    const { GLASSES_CATALOG } = await import('/src/data/glasses.ts');
    // Join pixels within two pixels to tolerate antialiasing and material seams,
    // but keep actual gaps (as in the reported screenshot) as separate components.
    const { componentAreas: components } = await import('/tests/helpers/componentAreas.mjs');
    const engine = new Glasses3D();
    for (const config of GLASSES_CATALOG) await engine.load(config);
    const copy = document.createElement('canvas'); copy.width = 640; copy.height = 480;
    const ctx = copy.getContext('2d');
    const output = [];
    for (const config of GLASSES_CATALOG) {
      engine.render(640, 480, config, null, null);
      // Keep the smoother active through each turn; do not reset between poses.
      for (let frame = 0; frame <= 28; frame++) {
        const yaw = -1.05 + frame * .075;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(.1, yaw, 0, 'YXZ'));
        const matrix = new THREE.Matrix4().makeRotationFromQuaternion(q).toArray();
        const landmarks = vertices.map(v => {
          const p = new THREE.Vector3(...v).applyQuaternion(q).multiplyScalar(18);
          return { x: .5 + p.x / 640, y: .5 - p.y / 480, z: -p.z / 640 };
        });
        const canvas = engine.render(640, 480, config, { visible: true }, landmarks, matrix, 1000 + frame * 1000 / 30);
        ctx.clearRect(0, 0, 640, 480); ctx.drawImage(canvas, 0, 0);
        const areas = components(ctx.getImageData(0, 0, 640, 480).data, 640, 480);
        output.push({ id: config.id, frame, yaw, areas });
      }
    }
    engine.dispose();
    return output;
  }, vertices);
  for (const result of results) {
    expect(result.areas[0], JSON.stringify(result)).toBeGreaterThan(1000);
    expect(result.areas, JSON.stringify(result)).toHaveLength(1);
  }
});

test('near temples match a fully unmasked reference while far temples remain occluded', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(page.getByTestId('display-version')).toContainText('v0.3.1');
  const results = await page.evaluate(async vertices => {
    const THREE = await import('/node_modules/three/build/three.module.js');
    const { Glasses3D } = await import('/src/utils/glasses3D.ts');
    const { GLASSES_CATALOG } = await import('/src/data/glasses.ts');
    const engine = new Glasses3D();
    for (const config of GLASSES_CATALOG) await engine.load(config);
    const copy = document.createElement('canvas'); copy.width = 640; copy.height = 480;
    const ctx = copy.getContext('2d');
    const capture = () => {
      ctx.clearRect(0, 0, 640, 480); ctx.drawImage(engine.renderer.domElement, 0, 0);
      return ctx.getImageData(0, 0, 640, 480).data;
    };
    const rows = [];
    for (const config of GLASSES_CATALOG) {
      const model = engine.models.get(config.id);
      // Isolate the arms to measure head masking, independent of front-frame overlap.
      model.traverse(mesh => { if (mesh.isMesh && !mesh.userData.isTemple) mesh.visible = false; });
      for (const yaw of [-.7, 0, .7]) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(.15, yaw, 0, 'YXZ'));
        const matrix = new THREE.Matrix4().makeRotationFromQuaternion(q).toArray();
        const landmarks = vertices.map(v => {
          const p = new THREE.Vector3(...v).applyQuaternion(q).multiplyScalar(18);
          return { x: .5 + p.x / 640, y: .5 - p.y / 480, z: -p.z / 640 };
        });
        engine.render(640, 480, config, null, null);
        engine.render(640, 480, config, { visible: true }, landmarks, matrix);
        const actual = capture();
        // Render only the near arm, with no head depth and no rear fade.
        engine.faceOccluder.visible = engine.headOccluder.visible = false;
        engine.templePass.value = 1;
        model.traverse(mesh => {
          if (mesh.isMesh && mesh.userData.isTemple)
            for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mat.depthWrite = true;
        });
        engine.renderer.render(engine.scene, engine.camera);
        const reference = capture();
        let nearPixels = 0, missingNearPixels = 0;
        for (let i = 3; i < reference.length; i += 4) {
          if (reference[i] > 48) {
            nearPixels++;
            if (actual[i] + 4 < reference[i]) missingNearPixels++;
          }
        }
        model.traverse(mesh => {
          if (mesh.isMesh && mesh.userData.isTemple)
            for (const mat of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) mat.depthWrite = false;
        });
        let farVisible = 0, farOriginal = 0;
        if (yaw !== 0) {
          engine.templePass.value = 0;
          engine.faceOccluder.visible = engine.headOccluder.visible = true;
          engine.renderer.render(engine.scene, engine.camera);
          const masked = capture();
          engine.faceOccluder.visible = engine.headOccluder.visible = false;
          engine.templeFadeEnabled.value = 0;
          engine.renderer.render(engine.scene, engine.camera);
          const unmasked = capture();
          engine.templeFadeEnabled.value = 1;
          for (let i = 3; i < masked.length; i += 4) {
            if (masked[i] > 48) farVisible++;
            if (unmasked[i] > 48) farOriginal++;
          }
        }
        rows.push({ id: config.id, yaw, nearPixels, missingNearPixels, farVisible, farOriginal });
      }
    }
    engine.dispose();
    return rows;
  }, vertices);
  for (const result of results) {
    expect(result.nearPixels, JSON.stringify(result)).toBeGreaterThan(50);
    expect(result.missingNearPixels / result.nearPixels, JSON.stringify(result)).toBeLessThan(.005);
    if (result.yaw !== 0) {
      expect(result.farOriginal, JSON.stringify(result)).toBeGreaterThan(50);
      expect(result.farVisible / result.farOriginal, JSON.stringify(result)).toBeLessThan(.7);
    }
  }
});
