import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { GlassesConfig, GlassesTransform } from '../types';

export class Glasses3D {
  readonly renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  private anchor = new THREE.Group();
  private models = new Map<string, THREE.Group>();
  private loader = new GLTFLoader();
  private disposed = false;
  private environment: THREE.WebGLRenderTarget;
  private rotation = new THREE.Quaternion();
  private hasPose = false;

  constructor() {
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
    const box = new THREE.Box3().setFromObject(root);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    root.position.sub(new THREE.Vector3(center.x, center.y, box.max.z));
    const group = new THREE.Group();
    group.add(root);
    group.scale.setScalar(1 / size.x);
    if (this.disposed) {
      this.disposeObject(group);
      return;
    }
    this.models.set(config.id, group);
    this.anchor.add(group);
    group.visible = false;
  }

  render(width: number, height: number, config: GlassesConfig,
    transform: GlassesTransform | null, landmarks: NormalizedLandmark[] | null): HTMLCanvasElement {
    if (this.renderer.domElement.width !== width || this.renderer.domElement.height !== height) {
      this.renderer.setSize(width, height, false);
      Object.assign(this.camera, { left: -width / 2, right: width / 2, top: height / 2, bottom: -height / 2 });
      this.camera.updateProjectionMatrix();
    }
    for (const [id, model] of this.models) model.visible = id === config.id;
    this.anchor.visible = !!transform;
    if (transform) {
      this.anchor.position.set(transform.centerX - width / 2, height / 2 - transform.centerY, 0);
      let frameWidth = transform.width;
      if (landmarks?.[454]) {
        const point = (i: number) => new THREE.Vector3(
          landmarks[i].x * width, -landmarks[i].y * height, -landmarks[i].z * width);
        const x = point(263).sub(point(33)).normalize();
        const up = point(10).sub(point(152)).normalize();
        const z = new THREE.Vector3().crossVectors(x, up).normalize();
        const y = new THREE.Vector3().crossVectors(z, x).normalize();
        const target = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
        if (!this.hasPose) this.rotation.copy(target);
        else this.rotation.slerp(target, 0.25);
        this.hasPose = true;
        this.anchor.quaternion.copy(this.rotation);
        // Account for yaw foreshortening; cap correction near profile.
        frameWidth /= Math.max(0.55, Math.hypot(x.x, x.y));
      } else {
        this.anchor.rotation.set(0, 0, -transform.rotation);
      }
      this.anchor.scale.setScalar(frameWidth);
    } else this.hasPose = false;
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
