import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CameraControls } from './components/CameraControls';
import { GlassesSelector } from './components/GlassesSelector';
import { VirtualTryOn } from './components/VirtualTryOn';
import { DEFAULT_GLASSES_ID, GLASSES_CATALOG } from './data/glasses';
import { useCamera } from './hooks/useCamera';
import { useFaceLandmarker } from './hooks/useFaceLandmarker';
import { downloadCanvasAsPng } from './utils/screenshot';

export default function App() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [selectedId, setSelectedId] = useState(DEFAULT_GLASSES_ID);
  const [toast, setToast] = useState<string | null>(null);

  const camera = useCamera(videoRef);
  const { faceLandmarker, status: modelStatus, retry: retryModel } = useFaceLandmarker();

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
      setToast('映像の準備中です。少し待ってから撮影してください。');
      return;
    }
    try {
      await downloadCanvasAsPng(canvas);
      setToast('写真をダウンロードフォルダーに保存しました。');
    } catch (error) {
      console.error('[Screenshot] 导出失败：', error);
      setToast('写真を保存できませんでした。もう一度お試しください。');
    }
  }, [camera.status]);

  return (
    <div className="page">
      <header className="masthead">
        <p className="masthead__eyebrow">デバイス内で処理 · アップロード不要</p>
        <h1 className="masthead__title">バーチャルメガネ試着</h1>
        <p className="masthead__lede">
          カメラをオンにすると、メガネが目の動きに合わせてフィットします。顔の認識と映像の合成は、すべてブラウザ内で行われます。
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
            カメラ映像はデバイスのメモリ内でのみ処理され、サーバーへの送信や保存は行われません。
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
