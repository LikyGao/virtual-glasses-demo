/**
 * Offline evaluation only: video/photos stay on the local machine.
 * Start npm run dev first. See docs/3d-fitting.md for usage and limitations.
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, resolve } from 'node:path';

const args = process.argv.slice(2);
const value = flag => { const at = args.indexOf(flag); return at < 0 ? undefined : args[at + 1]; };
const images = args.flatMap((arg, i) => arg === '--image' ? [resolve(args[i + 1])] : []);
const video = value('--video');
const model = value('--model');
if (!model || (!video && !images.length)) {
  throw Error('Usage: node scripts/validate-profile.mjs --model /path/face_landmarker.task [--video /path/video.mp4 | --image /path/photo.png ...] [--mirror] [--output /tmp/profile-report.json]');
}
const temporary = mkdtempSync(join(tmpdir(), 'eyewear-profile-'));
let browser;
try {
  if (video) {
    // Extract decoded frames instead of seeking a paused HTMLVideoElement:
    // a seek event alone does not guarantee the browser updated its texture.
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', resolve(video),
      '-vf', 'fps=2,scale=640:-2', join(temporary, '%05d.png')]);
    images.push(...readdirSync(temporary).filter(name => name.endsWith('.png')).sort().map(name => join(temporary, name)));
  }
  if (!images.length) throw Error('Input contains no frames');
  browser = await chromium.launch({
    ...(existsSync('/usr/bin/chromium') ? { executablePath: '/usr/bin/chromium' } : {}),
    args: ['--enable-unsafe-swiftshader'],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/src/main.tsx*', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.route('**/__validation/model.task', route => route.fulfill({ path: resolve(model), contentType: 'application/octet-stream' }));
  await page.route('**/__validation/frame-*', route => {
    const index = Number(new URL(route.request().url()).pathname.split('frame-')[1]);
    return route.fulfill({ path: images[index], contentType: extname(images[index]).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg' });
  });
  await page.goto(value('--url') ?? 'http://127.0.0.1:5173/');
  const results = await page.evaluate(async ({ count, mirror, isVideo }) => {
    const { FaceLandmarker, FilesetResolver } = await import('/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs');
    const { Glasses3D } = await import('/src/utils/glasses3D.ts');
    const { GLASSES_CATALOG } = await import('/src/data/glasses.ts');
    const { componentAreas } = await import('/tests/helpers/componentAreas.mjs');
    const detector = await FaceLandmarker.createFromOptions(
      await FilesetResolver.forVisionTasks('/node_modules/@mediapipe/tasks-vision/wasm'),
      { baseOptions: { modelAssetPath: '/__validation/model.task', delegate: 'CPU' },
        runningMode: isVideo ? 'VIDEO' : 'IMAGE', outputFacialTransformationMatrixes: true, numFaces: 1 });
    const engine = new Glasses3D();
    for (const config of GLASSES_CATALOG) await engine.load(config);
    const rows = [];
    let timestamp = 1000;
    for (let frame = 0; frame < count; frame++) {
      const image = new Image(); image.src = '/__validation/frame-' + frame; await image.decode();
      for (const mirrored of mirror ? [false, true] : [false]) {
        const input = document.createElement('canvas'); input.width = image.width; input.height = image.height;
        const ctx = input.getContext('2d');
        if (mirrored) { ctx.translate(image.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(image, 0, 0);
        const detected = isVideo ? detector.detectForVideo(input, timestamp) : detector.detect(input);
        timestamp += 500;
        const landmarks = detected.faceLandmarks[0];
        const matrix = detected.facialTransformationMatrixes[0]?.data;
        if (!landmarks || !matrix) { rows.push({ frame, mirrored, tracked: false }); continue; }
        const estimatedYaw = Math.atan2(matrix[8], matrix[10]) * 180 / Math.PI;
        for (const config of GLASSES_CATALOG) {
          engine.render(input.width, input.height, config, null, null);
          const layer = engine.render(input.width, input.height, config, { visible: true }, landmarks, matrix);
          const output = document.createElement('canvas'); output.width = input.width; output.height = input.height;
          const context = output.getContext('2d'); context.drawImage(layer, 0, 0);
          const areas = componentAreas(context.getImageData(0, 0, output.width, output.height).data, output.width, output.height);
          // A disconnected full lens is a separate fit issue; report all areas,
          // but identify small floating temple/ear-hook islands separately.
          const orphanAreas = areas.slice(1).filter(area => area < areas[0] * 0.2);
          rows.push({ frame, mirrored, tracked: true, model: config.id, estimatedYaw, areas, orphanAreas });
        }
      }
    }
    detector.close(); engine.dispose();
    return rows;
  }, { count: images.length, mirror: args.includes('--mirror'), isVideo: !!video });

  const tracked = results.filter(row => row.tracked);
  const report = {
    input: video ? basename(video) : images.map(path => basename(path)),
    sampleFrames: images.length,
    trackedInputs: new Set(tracked.map(row => row.frame + ':' + row.mirrored)).size,
    untrackedInputs: results.filter(row => !row.tracked).length,
    renderedCases: tracked.length,
    estimatedYawRange: [Math.min(...tracked.map(row => row.estimatedYaw)), Math.max(...tracked.map(row => row.estimatedYaw))],
    casesWithFloatingTemples: tracked.filter(row => row.orphanAreas.length).length,
    blankRenderCases: tracked.filter(row => !row.areas.length).length,
    errors,
    results,
  };
  const reportPath = resolve(value('--output') ?? join(tmpdir(), 'eyewear-profile-report.json'));
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  const { results: omitted, ...summary } = report;
  console.log(JSON.stringify({ ...summary, reportPath }, null, 2));
  if (!tracked.length || report.casesWithFloatingTemples || report.blankRenderCases || errors.length) process.exitCode = 1;
} finally {
  await browser?.close();
  rmSync(temporary, { recursive: true, force: true });
}
