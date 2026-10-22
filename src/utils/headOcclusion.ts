import * as THREE from 'three';

// MediaPipe face-oval landmarks, clockwise from forehead to chin and back.
const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

/**
 * Close the live face boundary toward the back of the skull.
 * Unlike an ellipsoid, the sides do not bulge across the temples or taper away
 * prematurely at the ear hooks, exposing an isolated end of the glasses.
 */
export class HeadOcclusionGeometry extends THREE.BufferGeometry {
  private vertices = new THREE.BufferAttribute(new Float32Array((FACE_OVAL.length * 2 + 1) * 3), 3);

  constructor() {
    super();
    const n = FACE_OVAL.length;
    const indices: number[] = [];
    for (let i = 0; i < n; i++) {
      const next = (i + 1) % n;
      indices.push(i, next, n + i, next, n + next, n + i);
      indices.push(n + i, n + next, n * 2);
    }
    this.vertices.setUsage(THREE.DynamicDrawUsage);
    this.setAttribute('position', this.vertices);
    this.setIndex(indices);
  }

  update(points: THREE.Vector3[]) {
    const n = FACE_OVAL.length;
    const rearDepth = Math.min(-1.25, points[127].z - 0.7, points[356].z - 0.7);
    const rearCenter = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const p = points[FACE_OVAL[i]];
      this.vertices.setXYZ(i, p.x, p.y, p.z);
      const rear = new THREE.Vector3(
        p.x * 0.98,
        p.y + 0.12 * THREE.MathUtils.smoothstep(p.y, 0, 0.35),
        rearDepth,
      );
      this.vertices.setXYZ(n + i, rear.x, rear.y, rear.z);
      rearCenter.add(rear);
    }
    rearCenter.divideScalar(n);
    this.vertices.setXYZ(n * 2, rearCenter.x, rearCenter.y, rearCenter.z);
    this.vertices.needsUpdate = true;
  }
}
