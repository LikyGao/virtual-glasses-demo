import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FACE_LANDMARKER_DELEGATE,
  FACE_LANDMARKER_MODEL_URL,
  MAX_FACES,
  MEDIAPIPE_WASM_URL,
} from '../constants';
import type { ModelStatus } from '../types';

/**
 * 模块级缓存：整个页面生命周期内只加载一次 WASM 与模型。
 * React StrictMode 下 effect 会执行两次，这里靠共享 Promise 保证不会重复下载、
 * 也不会创建两个 FaceLandmarker 实例。
 */
let landmarkerPromise: Promise<FaceLandmarker> | null = null;

async function createLandmarker(): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL);

  const baseOptions = {
    modelAssetPath: FACE_LANDMARKER_MODEL_URL,
  };

  try {
    return await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { ...baseOptions, delegate: FACE_LANDMARKER_DELEGATE },
      runningMode: 'VIDEO',
      numFaces: MAX_FACES,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  } catch (gpuError) {
    // 部分设备（老旧安卓、禁用 WebGL 的浏览器）无法使用 GPU，回退到 CPU
    console.warn('[FaceLandmarker] GPU 初始化失败，回退到 CPU：', gpuError);
    return FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { ...baseOptions, delegate: 'CPU' },
      runningMode: 'VIDEO',
      numFaces: MAX_FACES,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    });
  }
}

function loadFaceLandmarker(): Promise<FaceLandmarker> {
  if (!landmarkerPromise) {
    const pending = createLandmarker();
    // 失败时清空缓存，允许用户点击重试
    pending.catch(() => {
      if (landmarkerPromise === pending) {
        landmarkerPromise = null;
      }
    });
    landmarkerPromise = pending;
  }
  return landmarkerPromise;
}

interface UseFaceLandmarkerResult {
  faceLandmarker: FaceLandmarker | null;
  status: ModelStatus;
  retry: () => void;
}

/**
 * 加载并持有 FaceLandmarker 实例。
 *
 * 注意：实例是模块级共享的，组件卸载时**不**调用 close()，
 * 否则 StrictMode 的「挂载 → 卸载 → 再挂载」会把刚建好的实例关掉。
 * 整页刷新/关闭时浏览器会自然回收 WASM 资源。
 */
export function useFaceLandmarker(): UseFaceLandmarkerResult {
  const [faceLandmarker, setFaceLandmarker] = useState<FaceLandmarker | null>(
    null,
  );
  const [status, setStatus] = useState<ModelStatus>('loading');
  const [attempt, setAttempt] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    loadFaceLandmarker()
      .then((instance) => {
        if (cancelled || !mountedRef.current) return;
        setFaceLandmarker(instance);
        setStatus('ready');
      })
      .catch((error: unknown) => {
        console.error('[FaceLandmarker] 加载失败：', error);
        if (cancelled || !mountedRef.current) return;
        setFaceLandmarker(null);
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setAttempt((value) => value + 1);
  }, []);

  return { faceLandmarker, status, retry };
}
