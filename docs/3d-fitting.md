# Face fitting and occlusion

## Current display policy: v0.3.1

At the user's request, the camera-facing temple is fully visible, with no face,
head or ear-hook fading. The side is selected from the smoothed head rotation's
local x-axis depth, before the final selfie mirror. A narrow frontal zone shows
both arms fully. The opposite arm retains depth occlusion and rear fading.

Rendering uses two passes. The first draws the normal face-occluded scene and
only the far temple. The second clears depth, hides face/head occluders and
writes glasses-front depth without changing its color, then draws the full near
temple. This preserves the arm's self-depth and its connection behind the front
frame while bypassing all head/ear masks. It also applies to exported photos.

The visible footer reads `v0.3.1 · 手前のテンプルを全表示`, so the loaded
display policy can be checked on the actual page. This deliberately favors a
continuous near arm over realistic hair/ear occlusion.

A new pixel-coverage test compares the near arm with a fully unmasked reference
at left, frontal and right poses for all three models, and separately checks that
the far arm remains depth-occluded. Earlier side-profile benchmark results below
describe the preceding display policy and are retained as historical evidence,
not measurements of this new near-arm rendering policy.

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

The 468-vertex face mesh writes only depth. A side/back shell extends the actual
face-oval boundary backward, replacing the ellipsoid that bulged into the temples
and tapered away too early at the ear hooks. Both inherit the same smoothed parent pose as the
glasses; face vertices are transformed into that parent's local coordinates.
Opaque frames and transparent lenses both obey the depth buffer. Video and PNG
export use the resulting alpha layer, so the occluder itself remains invisible.

## Validation

Run `npm ci`, `npm run build` and `npm test`.
Tests use installed Chromium when available; otherwise install Playwright Chromium
with `npx playwright install chromium`.

The browser tests cover known canonical-face rotations and 15 model/pose
combinations (three models, frontal, left/right yaw and two pitch/yaw poses).
An additional 87 rendered frames exercise continuous turns from about -60 to +60
degrees across all three models and assert that no detached visible fragments remain.
They check pose/scale stability, gaze independence, invalid input and reacquisition,
actual WebGL removal of hidden geometry, and preservation of frontal frames.
These are synthetic geometry checks, not a claim of accurate fit on every real
person. Live model initialization still requires the external MediaPipe model URL.

The head volume still approximates skull shape. Exact hair strands, ears, extreme
profiles, hands passing in front of the face, and calibrated physical sizing are
outside this fix. GLB reuse licensing remains as documented in
`public/models/SOURCE.md`.

## Side-profile continuity correction

The [WebAR.rocks Mirror eyewear example](https://github.com/WebAR-rocks/WebAR.rocks.face/blob/master/demos/VTOGlasses/main.js)
and [WebARRocksMirror.js](https://github.com/WebAR-rocks/WebAR.rocks.face/blob/master/helpers/WebARRocksMirror.js)
combine depth occlusion with temple bending and ear-hook fading. This version
adapts those techniques, with the MIT notice in `public/licenses/webar-rocks.txt`.

Static GLB transforms are baked into frame-width units at load time. The measured
cross-section centerline of each temple is shifted outward to the tracked side of
the head, preserving its cross-section and its fixed hinge. A rear-depth/drop
fade hides ear hooks progressively, including hooks that curl forward again.
The face boundary extends backward without the old ellipsoid's excessive bulge
at the temples or premature narrowing behind the ears. Fronts and lenses do not
receive the temple shader.

### Real-image and video evaluation

`docs/side-profile-validation.json` records source hashes and results.
A local copy of 3DDFA_V2's 214.avi was decoded at 2 FPS and scaled to 640x360:
100 frames tracked, 300 model/frame renders, no blank renders, page errors or
detached small temple islands. This clip is mainly frontal (estimated yaw -17.8
to +4.2 degrees); it is not evidence of a continuous 90-degree profile test.

Three panels cropped from 3DDFA_V2's emma.jpg, plus their horizontal mirrors,
provided six real views (estimated yaw -44.8 to +43.7 degrees), tested on all three
models. The black frame and sunglasses previously produced 13 isolated fragments
across these 12 cases; the revised renderer produced none. All 18 model/view cases
passed the floating-temple check. Angles are estimates, not labeled ground truth;
neither these checks nor the synthetic tests certify precise anatomical fit.

Run additional local evaluations without uploading the input:
```bash
npm run dev
# In another terminal, with a downloaded official MediaPipe face_landmarker.task:
node scripts/validate-profile.mjs --model /path/face_landmarker.task --video /path/turning-head.mp4 --output /tmp/profile-report.json
node scripts/validate-profile.mjs --model /path/face_landmarker.task --image /path/profile-left.png --image /path/profile-right.png --mirror --output /tmp/profile-stills.json
```

Video evaluation needs ffmpeg; Playwright needs Chromium. The runner extracts
decoded images rather than trusting a paused video's seek event, which can leave
the browser's texture on the preceding frame. Source media stays outside the
checkout and is not included in production. The reports include all visible
component areas; small islands under 16 pixels and seams up to two pixels are
ignored. A disconnected full lens is reported in those areas but is a distinct
fitting issue, not classified as an orphan temple.
