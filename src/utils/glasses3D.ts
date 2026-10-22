import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { GlassesConfig, GlassesTransform } from '../types';
import { FACE_MESH_TRIANGLES } from '../data/faceMeshTriangles';
import { estimateFacePose, FacePoseSmoother } from './facePose';

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
  private headOccluder = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 24), this.depthMaterial);

  constructor() {
    this.faceGeometry.setAttribute('position', this.facePositions);
    this.facePositions.setUsage(THREE.DynamicDrawUsage);
    this.faceGeometry.setIndex(FACE_MESH_TRIANGLES);
    this.faceOccluder.frustumCulled = false;
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
    root.position.sub(center);
    const normalized = new THREE.Group();
    normalized.add(root);
    normalized.scale.setScalar(1 / frameWidth);
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

      // Face landmarks do not cover the scalp or back of the head. A conservative
      // ellipsoid closes that volume, keeping far temples behind the head.
      const halfHeadWidth = THREE.MathUtils.clamp(
        Math.abs(localPoints[454].x - localPoints[234].x) * 0.5, 0.43, 0.62);
      const chin = localPoints[152].y;
      const forehead = localPoints[10].y;
      this.headOccluder.position.set(0, (chin + forehead) * 0.5 + 0.07, -0.50);
      this.headOccluder.scale.set(halfHeadWidth, (forehead - chin) * 0.5 + 0.14, 0.40);
    } else if (transform && !landmarks) {
      // Static asset previews have no face and intentionally no occlusion.
      this.smoother.reset();
      this.anchor.position.set(transform.centerX - width / 2, height / 2 - transform.centerY, 0);
      this.anchor.rotation.set(0, 0, -transform.rotation);
      this.anchor.scale.setScalar(transform.width);
    } else {
      this.anchor.visible = false;
      this.smoother.reset();
    }
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement;
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
