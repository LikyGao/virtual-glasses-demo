import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { GLASSES_ASSET_ASPECT_RATIO } from '../data/glasses';
import type { GlassesConfig, GlassesTransform } from '../types';

/**
 * MediaPipe Face Landmarker 关键点编号统一定义在这里，
 * 其它文件一律通过这个常量引用，不再出现裸数字。
 *
 * 说明：编号是「图像坐标系」下的左右，即 LEFT_* 出现在画面左侧
 * （对应被拍摄者的右半边脸）。因为最终整体做了镜像，用户看起来是对的。
 * Face Landmarker 默认输出 478 个点，其中 468~477 是虹膜点。
 */
export const FACE_LANDMARKS = {
  /** 左眼外眼角（画面左侧），用于测量眼镜总宽度 */
  LEFT_EYE_OUTER: 33,
  /** 左眼内眼角 */
  LEFT_EYE_INNER: 133,
  /** 右眼外眼角（画面右侧） */
  RIGHT_EYE_OUTER: 263,
  /** 右眼内眼角 */
  RIGHT_EYE_INNER: 362,
  /** 左眼虹膜中心，用于确定镜片中心（比眼角更稳定） */
  LEFT_IRIS_CENTER: 468,
  /** 右眼虹膜中心 */
  RIGHT_IRIS_CENTER: 473,
  /** 鼻梁最上方（眉心下方），用于校验人脸有效性 */
  NOSE_BRIDGE_TOP: 168,
} as const;

/** 不可见时的空变换 */
const HIDDEN_TRANSFORM: GlassesTransform = {
  centerX: 0,
  centerY: 0,
  width: 0,
  height: 0,
  rotation: 0,
  visible: false,
};

interface Point2D {
  x: number;
  y: number;
}

/** 把归一化关键点换算成 canvas 像素坐标 */
function toPixel(
  landmark: NormalizedLandmark,
  width: number,
  height: number,
): Point2D {
  return { x: landmark.x * width, y: landmark.y * height };
}

function midpoint(a: Point2D, b: Point2D): Point2D {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * 取眼睛中心：优先使用虹膜中心；若模型未输出虹膜点，
 * 退化为内外眼角的中点，保证逻辑不会崩。
 */
function resolveEyeCenter(
  landmarks: NormalizedLandmark[],
  irisIndex: number,
  outerIndex: number,
  innerIndex: number,
  width: number,
  height: number,
): Point2D {
  const iris = landmarks[irisIndex];
  if (iris) {
    return toPixel(iris, width, height);
  }
  return midpoint(
    toPixel(landmarks[outerIndex], width, height),
    toPixel(landmarks[innerIndex], width, height),
  );
}

/**
 * 根据人脸关键点计算眼镜的绘制参数。
 *
 * - centerX / centerY：双眼中心的中点，再沿「头部向下方向」加垂直偏移
 * - width：双眼外眼角距离 × widthScale
 * - height：由素材宽高比推导，保证不变形
 * - rotation：左右眼连线的 atan2 角度（歪头时眼镜跟随）
 * - visible：关键点齐全且双眼距离有效时为 true
 *
 * 注意：这里返回的是「未镜像」的视频坐标系数值。
 * 画面整体镜像由 canvas 的一次全局变换完成，眼镜与视频共用同一坐标系。
 */
export function computeGlassesTransform(
  landmarks: NormalizedLandmark[] | undefined,
  canvasWidth: number,
  canvasHeight: number,
  config: GlassesConfig,
): GlassesTransform {
  if (!landmarks || landmarks.length < FACE_LANDMARKS.RIGHT_EYE_INNER + 1) {
    return HIDDEN_TRANSFORM;
  }

  const outerLeft = landmarks[FACE_LANDMARKS.LEFT_EYE_OUTER];
  const outerRight = landmarks[FACE_LANDMARKS.RIGHT_EYE_OUTER];
  const noseBridge = landmarks[FACE_LANDMARKS.NOSE_BRIDGE_TOP];
  if (!outerLeft || !outerRight || !noseBridge) {
    return HIDDEN_TRANSFORM;
  }

  const left = toPixel(outerLeft, canvasWidth, canvasHeight);
  const right = toPixel(outerRight, canvasWidth, canvasHeight);

  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const outerEyeDistance = Math.hypot(dx, dy);

  // 距离过小说明人脸太远或识别异常，直接判定为无效
  if (outerEyeDistance < canvasWidth * 0.02) {
    return HIDDEN_TRANSFORM;
  }

  const eyeCenterLeft = resolveEyeCenter(
    landmarks,
    FACE_LANDMARKS.LEFT_IRIS_CENTER,
    FACE_LANDMARKS.LEFT_EYE_OUTER,
    FACE_LANDMARKS.LEFT_EYE_INNER,
    canvasWidth,
    canvasHeight,
  );
  const eyeCenterRight = resolveEyeCenter(
    landmarks,
    FACE_LANDMARKS.RIGHT_IRIS_CENTER,
    FACE_LANDMARKS.RIGHT_EYE_OUTER,
    FACE_LANDMARKS.RIGHT_EYE_INNER,
    canvasWidth,
    canvasHeight,
  );

  const eyesCenter = midpoint(eyeCenterLeft, eyeCenterRight);

  const rotation =
    Math.atan2(dy, dx) + (config.rotationOffset * Math.PI) / 180;

  const width = outerEyeDistance * config.widthScale;
  const height = width / GLASSES_ASSET_ASPECT_RATIO;

  // 垂直偏移沿「头部本地向下方向」施加，这样歪头时偏移方向也跟着转
  const offset = height * config.verticalOffset;
  const localDownX = -Math.sin(rotation);
  const localDownY = Math.cos(rotation);

  return {
    centerX: eyesCenter.x + localDownX * offset,
    centerY: eyesCenter.y + localDownY * offset,
    width,
    height,
    rotation,
    visible: true,
  };
}
