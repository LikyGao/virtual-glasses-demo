import type { FaceLandmarker } from '@mediapipe/tasks-vision';
import { useEffect, useRef, useState } from 'react';
import { FACE_LOST_GRACE_MS, MESSAGES } from '../constants';
import type { GlassesImageMap } from '../hooks/useGlassesImages';
import type {
  CameraStatus,
  GlassesConfig,
  GlassesTransform,
  ModelStatus,
} from '../types';
import { clearCanvas, renderFrame } from '../utils/canvasRender';
import { computeGlassesTransform } from '../utils/faceGeometry';
import { GlassesTransformSmoother } from '../utils/smoothing';

interface VirtualTryOnProps {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  faceLandmarker: FaceLandmarker | null;
  modelStatus: ModelStatus;
  onRetryModel: () => void;
  cameraStatus: CameraStatus;
  cameraError: string | null;
  glasses: GlassesConfig;
  imagesRef: React.RefObject<GlassesImageMap>;
}

/** 默认预览比例，拿到真实视频尺寸前先按 4:3 占位 */
const DEFAULT_ASPECT = { width: 4, height: 3 };

export function VirtualTryOn({
  videoRef,
  canvasRef,
  faceLandmarker,
  modelStatus,
  onRetryModel,
  cameraStatus,
  cameraError,
  glasses,
  imagesRef,
}: VirtualTryOnProps) {
  const [faceDetected, setFaceDetected] = useState(false);
  const [aspect, setAspect] = useState(DEFAULT_ASPECT);

  // 用 ref 持有当前眼镜配置：切换眼镜时渲染循环不需要重启
  const glassesRef = useRef(glasses);
  glassesRef.current = glasses;

  const smootherRef = useRef(new GlassesTransformSmoother());

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d') ?? null;

    if (!video || !canvas || !ctx) return;

    // 摄像头未运行：清空画布，不启动任何循环
    if (cameraStatus !== 'running') {
      clearCanvas(ctx);
      setFaceDetected(false);
      return;
    }

    const smoother = smootherRef.current;
    smoother.reset();

    let rafId = 0;
    let lastVideoTime = -1;
    let lastFaceAt = 0;
    let lastTransform: GlassesTransform | null = null;
    let faceStateCache = false;

    const updateFaceState = (next: boolean) => {
      if (next !== faceStateCache) {
        faceStateCache = next;
        setFaceDetected(next);
      }
    };

    const render = () => {
      // 单一循环入口：先约定下一帧，再做本帧工作
      rafId = requestAnimationFrame(render);

      // 标签页不可见时暂停识别与绘制，节省电量与算力
      if (document.hidden) return;
      if (video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;

      // 让 canvas 分辨率与视频原始分辨率一致，保证比例不失真
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        setAspect({ width: video.videoWidth, height: video.videoHeight });
      }

      const now = performance.now();

      // 模型还没就绪时只画视频，用户可以先看到自己的画面
      // 同一帧视频不重复推理
      if (faceLandmarker && video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;
        const result = faceLandmarker.detectForVideo(video, now);
        const raw = computeGlassesTransform(
          result.faceLandmarks[0],
          canvas.width,
          canvas.height,
          glassesRef.current,
        );

        if (raw.visible) {
          lastFaceAt = now;
          lastTransform = smoother.smooth(raw, canvas.width);
        }
      }

      // 短暂丢帧时保留上一帧结果，超过宽限时间才真正隐藏眼镜
      const hasFace = !!faceLandmarker && now - lastFaceAt < FACE_LOST_GRACE_MS;
      if (!hasFace && lastTransform) {
        lastTransform = null;
        smoother.reset();
      }
      updateFaceState(hasFace);

      const image = imagesRef.current.get(glassesRef.current.id) ?? null;
      renderFrame(
        ctx,
        video,
        lastTransform && image
          ? {
              image,
              transform: lastTransform,
              opacity: glassesRef.current.opacity,
            }
          : null,
      );
    };

    rafId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafId);
      smoother.reset();
    };
    // 依赖里刻意不含 glasses：切换眼镜不重启循环，也不重建摄像头和模型
  }, [cameraStatus, faceLandmarker, videoRef, canvasRef, imagesRef]);

  const isRunning = cameraStatus === 'running';

  return (
    <section className="stage" aria-label="カメラ試着エリア">
      <div
        className="stage__frame"
        style={{ aspectRatio: `${aspect.width} / ${aspect.height}` }}
      >
        {/* video 只作为解码源，画面统一由 canvas 输出 */}
        <video ref={videoRef} className="stage__video" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="stage__canvas" />

        {/* 取景框角标：让预览区看起来像一台取景设备 */}
        <div className="stage__ticks" aria-hidden="true">
          <span /><span /><span /><span />
        </div>

        <div className="stage__overlays">
          {cameraStatus === 'error' && (
            <div className="notice notice--error" role="alert">
              <p className="notice__title">カメラを起動できません</p>
              <p className="notice__body">{cameraError}</p>
            </div>
          )}

          {cameraStatus === 'idle' && (
            <div className="notice">
              <p className="notice__title">{MESSAGES.cameraIdle}</p>
              <p className="notice__body">
                下の「カメラをオンにする」を押して試着を始めましょう。映像はすべてデバイス内で処理され、アップロードされません。
              </p>
            </div>
          )}

          {cameraStatus === 'starting' && (
            <div className="notice">
              <p className="notice__title">{MESSAGES.cameraStarting}</p>
              <p className="notice__body">ブラウザにアクセス許可の確認が表示されたら、「許可」を選んでください。</p>
            </div>
          )}

          {modelStatus === 'error' && cameraStatus !== 'error' && (
            <div className="notice notice--error" role="alert">
              <p className="notice__title">{MESSAGES.modelError}</p>
              <button type="button" className="button button--ghost" onClick={onRetryModel}>
                モデルを再読み込み
              </button>
            </div>
          )}

          {modelStatus === 'loading' && cameraStatus !== 'error' && (
            <div className="notice">
              <p className="notice__title">
                <span className="spinner" aria-hidden="true" />
                {MESSAGES.modelLoading}
              </p>
              <p className="notice__body">初回は約4MBのモデルファイルをダウンロードします。</p>
            </div>
          )}
        </div>

        {/* 人脸未识别提示：只在摄像头正常运行时出现 */}
        {isRunning && modelStatus === 'ready' && !faceDetected && (
          <p className="stage__hint" role="status">
            {MESSAGES.faceNotFound}
          </p>
        )}

        {isRunning && (
          <p className="stage__readout" aria-hidden="true">
            {faceDetected ? '顔を検出しました' : '顔を検出中'} · {glasses.name}
          </p>
        )}
      </div>
    </section>
  );
}
