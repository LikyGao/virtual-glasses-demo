/**
 * 集中管理所有「魔法数字」和外部地址：
 * MediaPipe 的 WASM / 模型地址、平滑参数、摄像头参数、界面文案。
 * 组件里不再出现散落的 URL 或阈值。
 */

/** MediaPipe tasks-vision 版本，需与 package.json 中的依赖版本保持一致 */
export const MEDIAPIPE_VERSION = '1.0.1';

/** WASM 运行时目录（官方 jsDelivr CDN） */
export const MEDIAPIPE_WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;

/** Face Landmarker 模型文件（Google 官方托管） */
export const FACE_LANDMARKER_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

/** 推理后端：优先 GPU，失败时代码会自动回退到 CPU */
export const FACE_LANDMARKER_DELEGATE = 'GPU' as const;

/** 只识别一张人脸，Demo 场景下足够且更省性能 */
export const MAX_FACES = 1;

/**
 * 指数平滑系数：越大越稳，但跟随越慢。
 * 建议区间 0.70 ~ 0.85。
 */
export const SMOOTHING_FACTOR = 0.78;

/** 旋转角度单独用稍大的系数，抖动在角度上最明显 */
export const ROTATION_SMOOTHING_FACTOR = 0.82;

/**
 * 相邻两帧位置突变超过画面宽度的这个比例时，判定为「换了一张脸 / 重新入画」，
 * 直接跳到新位置而不是缓慢插值，避免眼镜从画面一端慢慢飘过来。
 */
export const SMOOTHING_SNAP_RATIO = 0.25;

/** 丢失人脸后仍保留眼镜的宽限时间（毫秒），避免瞬时丢帧导致闪烁 */
export const FACE_LOST_GRACE_MS = 350;

/** 摄像头请求参数：优先前置摄像头 + 4:3 自拍比例 */
export const CAMERA_CONSTRAINTS: MediaStreamConstraints = {
  video: {
    facingMode: 'user',
    width: { ideal: 960 },
    height: { ideal: 720 },
    aspectRatio: { ideal: 4 / 3 },
  },
  audio: false,
};

/** 截图文件名前缀，最终形如 virtual-glasses-20250406-153012.png */
export const SCREENSHOT_FILENAME_PREFIX = 'virtual-glasses';

/** 界面文案集中管理 */
export const MESSAGES = {
  modelLoading: '顔認識モデルを読み込み中…',
  modelError: '顔認識モデルを読み込めませんでした。ページを再読み込みしてお試しください。',
  faceNotFound: '顔が画面に入るようにしてください',
  cameraIdle: 'カメラはオフです',
  cameraStarting: 'カメラを起動中…',
} as const;
