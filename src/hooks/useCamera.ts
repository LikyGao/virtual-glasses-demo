import { useCallback, useEffect, useRef, useState } from 'react';
import { CAMERA_CONSTRAINTS } from '../constants';
import type { CameraStatus } from '../types';

/** 把浏览器抛出的异常翻译成用户能看懂的中文提示 */
function describeCameraError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return 'カメラへのアクセスが拒否されました。ブラウザのアドレスバーにある権限設定でカメラの使用を許可し、再度オンにしてください。';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return '使用できるカメラが見つかりません。カメラが接続されていることを確認し、もう一度お試しください。';
      case 'NotReadableError':
        return 'カメラは別のアプリで使用中です。ビデオ会議などのアプリを閉じてから、もう一度お試しください。';
      default:
        return `カメラの起動に失敗しました：${error.name}`;
    }
  }
  return 'カメラを起動できませんでした。ページを再読み込みしてお試しください。';
}

/** 当前环境是否支持摄像头（含非 HTTPS 场景） */
function isCameraSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

interface UseCameraResult {
  status: CameraStatus;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * 管理摄像头流：开启、关闭、错误提示、卸载清理。
 * 使用 token 机制防止「快速开关」或 StrictMode 重复调用时出现两条流。
 */
export function useCamera(
  videoRef: React.RefObject<HTMLVideoElement | null>,
): UseCameraResult {
  const [status, setStatus] = useState<CameraStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const tokenRef = useRef(0);

  /** 停止所有轨道并解绑 video */
  const stop = useCallback(() => {
    tokenRef.current += 1; // 让仍在进行中的 start 作废
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }
    setStatus('idle');
    setError(null);
  }, [videoRef]);

  const start = useCallback(async () => {
    if (streamRef.current) return; // 已经开着，不重复开
    if (!isCameraSupported()) {
      setStatus('error');
      setError(
        'このブラウザはカメラに対応していないか、安全な接続で開かれていません。https:// または localhost でこのページを開いてください。',
      );
      return;
    }

    const token = ++tokenRef.current;
    setStatus('starting');
    setError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);

      // 期间用户点了「关闭摄像头」或组件已卸载：丢弃这条流
      if (token !== tokenRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();

      if (token !== tokenRef.current) return;
      setStatus('running');
    } catch (caught) {
      if (token !== tokenRef.current) return;
      console.error('[Camera] 启动失败：', caught);
      setStatus('error');
      setError(describeCameraError(caught));
    }
  }, [videoRef]);

  // 组件卸载 / 页面关闭时确保摄像头轨道被停掉
  useEffect(() => {
    return () => {
      tokenRef.current += 1;
      const stream = streamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return { status, error, start, stop };
}
