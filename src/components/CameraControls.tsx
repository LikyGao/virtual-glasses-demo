import type { CameraStatus } from '../types';

interface CameraControlsProps {
  cameraStatus: CameraStatus;
  onStart: () => void;
  onStop: () => void;
  onCapture: () => void;
}

/**
 * 操作区：开启 / 关闭摄像头、拍摄照片。
 * 摄像头未运行时，拍摄按钮不可用。
 */
export function CameraControls({
  cameraStatus,
  onStart,
  onStop,
  onCapture,
}: CameraControlsProps) {
  const isRunning = cameraStatus === 'running';
  const isStarting = cameraStatus === 'starting';

  return (
    <section className="controls" aria-label="操作パネル">
      {isRunning || isStarting ? (
        <button type="button" className="button button--secondary" onClick={onStop}>
          カメラをオフにする
        </button>
      ) : (
        <button type="button" className="button button--primary" onClick={onStart}>
          カメラをオンにする
        </button>
      )}

      <button
        type="button"
        className="button button--primary"
        onClick={onCapture}
        disabled={!isRunning}
      >
        写真を撮る
      </button>
    </section>
  );
}
