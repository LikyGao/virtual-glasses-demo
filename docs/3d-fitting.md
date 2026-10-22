# Face fitting and occlusion

## References

- [Jeeliz FaceFilter, JeelizThreeHelper.js](https://github.com/jeeliz/jeelizFaceFilter/blob/master/helpers/JeelizThreeHelper.js):
  `create_threejsOccluder` uses a depth-writing, colorless mesh rendered before
  accessories. Its pose update also demonstrates why the pivot and rotation must
  be applied together. This implementation follows those techniques; it does not
  integrate the Jeeliz SDK.
- [WebAR.rocks Face, WebARRocksFaceThreeHelper.js](https://github.com/WebAR-rocks/WebAR.rocks.face/blob/master/helpers/WebARRocksFaceThreeHelper.js):
  `add_occluder` likewise uses a double-sided, depth-only mesh.
- [MediaPipe canonical face geometry](https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj):
  triangle topology in `src/data/faceMeshTriangles.ts` and canonical test vertices
  in `tests/fixtures/canonicalFace.json` are derived from this file. Apache-2.0
  license and notices are retained in `public/licenses/mediapipe.txt`.
- [MediaPipe face geometry](https://github.com/google-ai-edge/mediapipe/tree/master/mediapipe/modules/face_geometry):
  the canonical coordinate system and facial transformation matrix provide a
  rigid head orientation, rather than estimating pitch from a few moving points.

## Implementation

Camera, face depth and glasses use the same unmirrored, y-up coordinate system.
Only the final combined camera/model layer is mirrored for display and export.

The frame is anchored between the inner eye corners. Unlike iris centers, these
do not move when the user's gaze changes. Scale uses 3D outer-eye distance rather
than a projected 2D width with an independent yaw correction. MediaPipe's rigid
transformation matrix supplies rotation, with a landmark-basis fallback. Position,
rotation and scale share a time-based filter that resets after tracking loss or
a large position jump.

Each GLB's front frame supplies width; its lenses supply the pivot. Temples no
longer influence centering and scale. The per-model `fitOffset` sets the fitting
depth in front of the nose and adjusts vertical placement. Values remain visual
estimates, because upstream provides no millimeter measurements.

The 468-vertex face mesh writes only depth. An approximate ellipsoid closes the
scalp and back of the head. Both inherit the same smoothed parent pose as the
glasses; face vertices are transformed into that parent's local coordinates.
Opaque frames and transparent lenses both obey the depth buffer. Video and PNG
export use the resulting alpha layer, so the occluder itself remains invisible.

## Validation

Run `npm ci`, `npm run build` and `npm test`.
Tests use installed Chromium when available; otherwise install Playwright Chromium
with `npx playwright install chromium`.

The two browser tests cover known canonical-face rotations and 15 model/pose
combinations (three models, frontal, left/right yaw and two pitch/yaw poses).
They check pose/scale stability, gaze independence, invalid input and reacquisition,
actual WebGL removal of hidden geometry, and preservation of frontal frames.
These are synthetic geometry checks, not a claim of accurate fit on every real
person. Live model initialization still requires the external MediaPipe model URL.

The head volume approximates skull shape. Exact hair strands, ears, extreme
profiles, hands passing in front of the face, and calibrated physical sizing are
outside this fix. GLB reuse licensing remains as documented in
`public/models/SOURCE.md`.
