import * as THREE from 'three';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface FacePose {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  width: number;
  /** Landmark positions in the same unmirrored, y-up screen space as the renderer. */
  points: THREE.Vector3[];
}

/** Use one coordinate system and one pose for fitting and depth occlusion. */
export function estimateFacePose(
  landmarks: NormalizedLandmark[], width: number, height: number,
  widthScale: number, matrix?: number[] | null,
): FacePose | null {
  if (landmarks.length < 468 || landmarks.slice(0, 468).some(p =>
    !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z))) return null;
  const points = landmarks.slice(0, 468).map(p =>
    new THREE.Vector3((p.x - 0.5) * width, (0.5 - p.y) * height, -p.z * width));
  const horizontal = points[263].clone().sub(points[33]);
  const eyeDistance = horizontal.length();
  if (eyeDistance < width * 0.02) return null;

  let rotation: THREE.Quaternion;
  if (matrix?.length === 16 && matrix.every(Number.isFinite)) {
    // MediaPipe's canonical-face transform is column-major and already y-up.
    const m = new THREE.Matrix4().fromArray(matrix);
    const scale = new THREE.Vector3();
    rotation = new THREE.Quaternion();
    m.decompose(new THREE.Vector3(), rotation, scale);
    if (!Number.isFinite(rotation.w) || scale.x <= 0 || scale.y <= 0 || scale.z <= 0) return null;
    rotation.normalize();
  } else {
    // Fallback for older MediaPipe builds without a transformation matrix.
    const x = horizontal.normalize();
    const up = points[10].clone().sub(points[152]).normalize();
    const z = new THREE.Vector3().crossVectors(x, up).normalize();
    if (z.lengthSq() < 0.5) return null;
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    rotation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  }
  // Inner eye corners are rigid anchors; iris centers move when the user looks sideways.
  const position = points[133].clone().add(points[362]).multiplyScalar(0.5);
  const referenceDepth = position.z;
  position.z = 0;
  for (const p of points) p.z -= referenceDepth;
  return { position, rotation, width: eyeDistance * widthScale, points };
}

export class FacePoseSmoother {
  private current: FacePose | null = null;
  private lastTime = 0;

  next(target: FacePose, now: number): FacePose {
    const delta = this.current ? now - this.lastTime : Infinity;
    const snap = !this.current || delta > 350 ||
      this.current.position.distanceTo(target.position) > target.width * 0.6;
    this.lastTime = now;
    if (snap) {
      this.current = { ...target, position: target.position.clone(), rotation: target.rotation.clone() };
    } else {
      const amount = 1 - Math.exp(-Math.max(0, delta) / 55);
      this.current!.position.lerp(target.position, amount);
      this.current!.rotation.slerp(target.rotation, amount);
      this.current!.width = THREE.MathUtils.lerp(this.current!.width, target.width, amount);
      this.current!.points = target.points;
    }
    return this.current!;
  }

  reset() { this.current = null; this.lastTime = 0; }
}
