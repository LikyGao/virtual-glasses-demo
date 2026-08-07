import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraControls } from './components/CameraControls';
import { GlassesSelector } from './components/GlassesSelector';
import { VirtualTryOn } from './components/VirtualTryOn';
import { DEFAULT_GLASSES_ID, GLASSES_CATALOG } from './data/glasses';
import { useCamera } from './hooks/useCamera';
import { useFaceLandmarker } from './hooks/useFaceLandmarker';
import { useGlassesImages } from './hooks/useGlassesImages';
import { downloadCanvasAsPng } from './utils/screenshot';

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [selectedId, setSelectedId] = useState(DEFAULT_GLASSES_ID);
  const [toast, setToast] = useState<string | null>(null);

  const camera = useCamera(videoRef);
  const { faceLandmarker, status: modelStatus, retry: retryModel } = useFaceLandmarker();
  const { imagesRef } = useGlassesImages(GLASSES_CATALOG);

  const selectedGlasses = useMemo(
    () => GLASSES_CATALOG.find((item) => item.id === selectedId) ?? GLASSES_CATALOG[0],
    [selectedId],
  );

  // 提示条自动消失
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const handleStart = useCallback(() => {
    void camera.start();
  }, [camera]);

  const handleCapture = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || camera.status !== 'running') return;
    // 第一帧还没画进来时 canvas 仍是默认尺寸，此时导出会得到空图
    if (canvas.width < 2 || canvas.height < 2) {
      setToast('画面还没准备好，请稍等一下再拍');
      return;
    }
    try {
      await downloadCanvasAsPng(canvas);
      setToast('照片已保存到下载目录');
    } catch (error) {
      console.error('[Screenshot] 导出失败：', error);
      setToast('照片保存失败，请重试');
    }
  }, [camera.status]);

  return (
    <div className="page">
      <header className="masthead">
        <p className="masthead__eyebrow">本地运行 · 无需上传</p>
        <h1 className="masthead__title">虚拟眼镜试戴</h1>
        <p className="masthead__lede">
          打开摄像头，镜框会跟着你的眼睛走。识别与合成全部在浏览器里完成。
        </p>
      </header>

      <main className="layout">
        <VirtualTryOn
          videoRef={videoRef}
          canvasRef={canvasRef}
          faceLandmarker={faceLandmarker}
          modelStatus={modelStatus}
          onRetryModel={retryModel}
          cameraStatus={camera.status}
          cameraError={camera.error}
          glasses={selectedGlasses}
          imagesRef={imagesRef}
        />

        <div className="panel">
          <GlassesSelector
            catalog={GLASSES_CATALOG}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          <CameraControls
            cameraStatus={camera.status}
            onStart={handleStart}
            onStop={camera.stop}
            onCapture={() => void handleCapture()}
          />

          <p className="privacy-note">
            摄像头画面只在本机内存中处理，不会发送到任何服务器，也不会被保存。
          </p>
        </div>
      </main>

      {toast && (
        <p className="toast" role="status">
          {toast}
        </p>
      )}
    </div>
  );
}
