import { useCallback, useEffect, useRef, useState } from 'react';
import { CAMERA_CONSTRAINTS } from '../constants';
import type { CameraStatus } from '../types';

/** 把浏览器抛出的异常翻译成用户能看懂的中文提示 */
function describeCameraError(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return '摄像头权限被拒绝。请在浏览器地址栏的权限设置里允许使用摄像头，然后重新开启。';
      case 'NotFoundError':
      case 'OverconstrainedError':
        return '没有找到可用的摄像头设备。请确认设备已连接后重试。';
      case 'NotReadableError':
        return '摄像头已被其它程序占用。请关闭视频会议等应用后重试。';
      default:
        return `摄像头启动失败：${error.name}`;
    }
  }
  return '摄像头启动失败，请刷新页面后重试。';
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
        '当前浏览器不支持摄像头，或页面不在安全环境下。请使用 https:// 或 localhost 打开本页面。',
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
