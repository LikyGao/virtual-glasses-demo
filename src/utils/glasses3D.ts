import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { GlassesConfig, GlassesTransform } from '../types';
import { FACE_MESH_TRIANGLES } from '../data/faceMeshTriangles';
import { estimateFacePose, FacePoseSmoother } from './facePose';
import { HeadOcclusionGeometry } from './headOcclusion';

export class Glasses3D {
  readonly renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  private anchor = new THREE.Group();
  private models = new Map<string, THREE.Group>();
  private loader = new GLTFLoader();
  private disposed = false;
  private environment: THREE.WebGLRenderTarget;
  private smoother = new FacePoseSmoother();
  private faceGeometry = new THREE.BufferGeometry();
  private facePositions = new THREE.BufferAttribute(new Float32Array(468 * 3), 3);
  private depthMaterial = new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: true, depthTest: true, side: THREE.DoubleSide,
  });
  private faceOccluder = new THREE.Mesh(this.faceGeometry, this.depthMaterial);
  private headGeometry = new HeadOcclusionGeometry();
  private headOccluder = new THREE.Mesh(this.headGeometry, this.depthMaterial);
  private templeSpread = { value: 0 };
  private templeFadeEnabled = { value: 1 };
  private nearTempleSide = { value: 0 };
  private nearTempleVisible = { value: 0 };
  private templePass = { value: 0 };

  constructor() {
    this.faceGeometry.setAttribute('position', this.facePositions);
    this.facePositions.setUsage(THREE.DynamicDrawUsage);
    this.faceGeometry.setIndex(FACE_MESH_TRIANGLES);
    this.faceOccluder.frustumCulled = this.headOccluder.frustumCulled = false;
    // Depth-only meshes render before both opaque frames and transparent lenses.
    this.faceOccluder.renderOrder = -2;
    this.headOccluder.renderOrder = -3;
    this.faceOccluder.visible = this.headOccluder.visible = false;
    this.anchor.add(this.faceOccluder, this.headOccluder);
    this.renderer.setPixelRatio(1);
    this.renderer.setClearColor(0, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const room = new RoomEnvironment();
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    room.dispose();
    pmrem.dispose();
    this.camera.position.z = 2000;
    this.scene.add(this.anchor, new THREE.HemisphereLight(0xffffff, 0x777788, 2));
    const key = new THREE.DirectionalLight(0xffffff, 3);
    key.position.set(-200, 400, 500);
    this.scene.add(key);
  }

  async load(config: GlassesConfig): Promise<void> {
    const gltf = await this.loader.loadAsync(new URL(config.modelUrl, document.baseURI).href);
    const root = gltf.scene;
    // Asset-specific correction, then normalize all models to one unit of frame width.
    root.rotation.set(...config.modelRotation);
    root.updateMatrixWorld(true);
    const front = root.getObjectByName(config.frontMesh);
    const lenses = root.getObjectByName(config.lensMesh);
    if (!front || !lenses) {
      this.disposeObject(root);
      throw new Error('Missing calibrated frame or lens mesh: ' + config.id);
    }
    // Temples and ear hooks must not influence width, vertical center or pivot.
    const frontBox = new THREE.Box3().setFromObject(front);
    const lensBox = new THREE.Box3().setFromObject(lenses);
    const frameWidth = frontBox.max.x - frontBox.min.x;
    const center = lensBox.getCenter(new THREE.Vector3());
    const normalized = new THREE.Group();
    const materials: THREE.Material[] = [];
    // Bake static GLB transforms so temple deformation uses consistent frame-width
    // units rather than the unrelated coordinate systems of individual assets.
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      geometry.translate(-center.x, -center.y, -center.z);
      geometry.scale(1 / frameWidth, 1 / frameWidth, 1 / frameWidth);
      const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
      const clones = sourceMaterials.map(material => material.clone());
      const mesh = new THREE.Mesh(geometry, Array.isArray(object.material) ? clones : clones[0]);
      mesh.name = object.name;
      if (mesh.name !== config.frontMesh && mesh.name !== config.lensMesh) {
        this.measureTempleCenterline(geometry);
        materials.push(...clones);
        mesh.userData.isTemple = true;
      }
      normalized.add(mesh);
      object.geometry.dispose();
    });
    const box = new THREE.Box3().setFromObject(normalized);
    const rear = box.min.z + config.fitOffset[2];
    // Rear sections fade away; hinges and the main temples stay opaque.
    const fade = new THREE.Vector2(rear + 0.22, rear + 0.02);
    for (const material of materials) this.fitTempleMaterial(material, config.fitOffset[2], fade);
    const group = new THREE.Group();
    group.add(normalized);
    group.position.set(...config.fitOffset);
    if (this.disposed) {
      this.disposeObject(group);
      return;
    }
    this.models.set(config.id, group);
    this.anchor.add(group);
    group.visible = false;
  }

  render(width: number, height: number, config: GlassesConfig,
    transform: GlassesTransform | null, landmarks: NormalizedLandmark[] | null,
    matrix: number[] | null = null, now = performance.now()): HTMLCanvasElement {
    if (this.renderer.domElement.width !== width || this.renderer.domElement.height !== height) {
      this.renderer.setSize(width, height, false);
      Object.assign(this.camera, { left: -width / 2, right: width / 2, top: height / 2, bottom: -height / 2 });
      this.camera.updateProjectionMatrix();
    }
    for (const [id, model] of this.models) model.visible = id === config.id;
    const rawPose = landmarks && transform
      ? estimateFacePose(landmarks, width, height, config.widthScale, matrix) : null;
    this.anchor.visible = !!transform;
    this.faceOccluder.visible = this.headOccluder.visible = !!rawPose;
    if (rawPose) {
      const pose = this.smoother.next(rawPose, now);
      this.anchor.position.copy(pose.position);
      this.anchor.quaternion.copy(pose.rotation);
      const sideDepth = new THREE.Vector3(1, 0, 0).applyQuaternion(pose.rotation).z;
      // At a frontal pose neither arm is farther away: show both completely.
      this.nearTempleSide.value = Math.abs(sideDepth) < 0.08 ? 0 : Math.sign(sideDepth);
      this.anchor.scale.setScalar(pose.width);

      // Normalize live face depth into the SAME local frame as the glasses.
      // Applying a single smoothed parent pose prevents lag at the occlusion boundary.
      const inverse = rawPose.rotation.clone().invert();
      const localPoints = rawPose.points.map(point =>
        point.clone().sub(rawPose.position).applyQuaternion(inverse).divideScalar(rawPose.width));
      for (let i = 0; i < 468; i++) {
        const p = localPoints[i];
        this.facePositions.setXYZ(i, p.x, p.y, p.z);
      }
      this.facePositions.needsUpdate = true;

      this.headGeometry.update(localPoints);
      // Splay the temples gently to the measured side-of-head width. The hinge
      // stays fixed; this avoids the arm entering the temple and exiting again.
      const halfHeadWidth = Math.abs(localPoints[127].x - localPoints[356].x) * 0.5;
      this.templeSpread.value = THREE.MathUtils.clamp(halfHeadWidth + 0.015 - 0.5, 0, 0.10);
    } else if (transform && !landmarks) {
      // Static asset previews have no face and intentionally no occlusion.
      this.smoother.reset();
      this.templeSpread.value = 0;
      this.anchor.position.set(transform.centerX - width / 2, height / 2 - transform.centerY, 0);
      this.anchor.rotation.set(0, 0, -transform.rotation);
      this.anchor.scale.setScalar(transform.width);
    } else {
      this.anchor.visible = false;
      this.smoother.reset();
    }
    this.nearTempleVisible.value = rawPose ? 1 : 0;
    this.templePass.value = 0;
    this.renderer.render(this.scene, this.camera);
    if (rawPose) this.renderNearTemple();
    return this.renderer.domElement;
  }

  /**
   * Draw the near arm against glasses depth only, without face/head depth.
   * Keeping depth testing on preserves the arm's own shape and its connection
   * behind the front frame, instead of drawing every triangle over everything.
   */
  private renderNearTemple() {
    const faceVisible = this.faceOccluder.visible;
    const headVisible = this.headOccluder.visible;
    this.faceOccluder.visible = this.headOccluder.visible = false;
    const states: Array<{ material: THREE.Material; colorWrite: boolean; depthWrite: boolean }> = [];
    for (const model of this.models.values()) {
      if (!model.visible) continue;
      model.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
          states.push({ material, colorWrite: material.colorWrite, depthWrite: material.depthWrite });
          if (!object.userData.isTemple) material.colorWrite = false;
          else material.depthWrite = true;
        }
      });
    }
    const autoClear = this.renderer.autoClear;
    this.renderer.autoClear = false;
    this.templePass.value = 1;
    try {
      this.renderer.clearDepth();
      this.renderer.render(this.scene, this.camera);
    } finally {
      this.renderer.autoClear = autoClear;
      this.templePass.value = 0;
      this.faceOccluder.visible = faceVisible;
      this.headOccluder.visible = headVisible;
      for (const state of states) {
        state.material.colorWrite = state.colorWrite;
        state.material.depthWrite = state.depthWrite;
      }
    }
  }

  private measureTempleCenterline(geometry: THREE.BufferGeometry) {
    const positions = geometry.getAttribute('position');
    const bins = new Map<number, [number, number]>();
    for (let i = 0; i < positions.count; i++) {
      const x = Math.abs(positions.getX(i));
      if (x < 0.3) continue; // exclude decorative bridge pieces
      const bin = Math.round(positions.getZ(i) / 0.04);
      const range = bins.get(bin) ?? [Infinity, -Infinity];
      range[0] = Math.min(range[0], x);
      range[1] = Math.max(range[1], x);
      bins.set(bin, range);
    }
    const centers = new Float32Array(positions.count);
    for (let i = 0; i < positions.count; i++) {
      const range = bins.get(Math.round(positions.getZ(i) / 0.04));
      centers[i] = range ? (range[0] + range[1]) * 0.5 : Math.abs(positions.getX(i));
    }
    geometry.setAttribute('templeCenterX', new THREE.BufferAttribute(centers, 1));
  }

  /**
   * Inspired by WebAR.rocks Mirror's branch bending/fading technique (MIT).
   * See public/licenses/webar-rocks.txt and docs/3d-fitting.md.
   */
  private fitTempleMaterial(material: THREE.Material, offsetZ: number, fade: THREE.Vector2) {
    material.transparent = true;
    material.depthWrite = false;
    material.onBeforeCompile = shader => {
      shader.uniforms.templeSpread = this.templeSpread;
      shader.uniforms.nearTempleSide = this.nearTempleSide;
      shader.uniforms.nearTempleVisible = this.nearTempleVisible;
      shader.uniforms.templePass = this.templePass;
      shader.uniforms.templeFadeEnabled = this.templeFadeEnabled;
      shader.uniforms.templeFade = { value: fade };
      shader.uniforms.templeOffsetZ = { value: offsetZ };
      shader.vertexShader = 'attribute float templeCenterX; uniform float templeSpread, templeOffsetZ; varying float templeDepth; varying float templeSide;\n' + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
        #include <begin_vertex>
        templeSide = sign(transformed.x);
        float longitudinalDepth = transformed.z + templeOffsetZ;
        // A downturned ear hook can curl forward again in z. Include its drop
        // in the fade coordinate so the tip cannot become opaque a second time.
        templeDepth = longitudinalDepth - 1.25 * max(0.0, 0.10 - transformed.y);
        float behindHinge = max(0.0, -longitudinalDepth);
        float outward = max(0.0, 0.5 + templeSpread - templeCenterX);
        transformed.x += sign(transformed.x) * outward * smoothstep(0.02, 0.32, behindHinge);
      `);
      shader.fragmentShader = 'uniform vec2 templeFade; uniform float templeFadeEnabled, nearTempleSide, nearTempleVisible, templePass; varying float templeDepth, templeSide;\n' + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <alphatest_fragment>', `
        float isNear = nearTempleVisible * ((abs(nearTempleSide) < 0.5) ? 1.0 : step(0.0, templeSide * nearTempleSide));
        if (templePass < 0.5 && isNear > 0.5) discard;
        if (templePass > 0.5 && isNear < 0.5) discard;
        // The near arm keeps its original opacity from hinge to ear hook.
        if (templePass < 0.5)
          diffuseColor.a *= mix(1.0, smoothstep(templeFade.y, templeFade.x, templeDepth), templeFadeEnabled);
        if (diffuseColor.a < 0.01) discard;
        #include <alphatest_fragment>
      `);
    };
    material.customProgramCacheKey = () => 'near-temple-full-v2';
  }

  private disposeObject(object: THREE.Object3D) {
    object.traverse(child => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
          for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      }
    });
  }

  dispose() {
    this.disposed = true;
    this.disposeObject(this.anchor);
    this.environment.dispose();
    this.renderer.dispose();
  }
}
