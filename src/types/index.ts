/**
 * 全局共享类型定义。
 */

/** 一副眼镜的配置。所有可调参数集中在这里，方便微调贴合度。 */
export interface GlassesConfig {
  /** 唯一 ID */
  id: string;
  /** 展示名称 */
  name: string;
  /** 一句话说明，显示在选择卡片上 */
  caption: string;
  /** 素材地址（项目内的 SVG，位于 public/glasses/） */
  assetUrl: string;
  modelUrl: string;
  modelRotation: [number, number, number];
  /** 眼镜宽度 = 双眼外眼角距离 × widthScale */
  widthScale: number;
  /** 垂直偏移，单位是「眼镜高度的倍数」，正数向下（沿头部倾斜方向） */
  verticalOffset: number;
  /** 额外旋转角度（单位：度），用于修正素材本身的倾斜 */
  rotationOffset: number;
  /** 绘制不透明度 0~1 */
  opacity: number;
}

/** 每一帧计算出的眼镜绘制参数（像素坐标，基于 canvas 尺寸）。 */
export interface GlassesTransform {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  /** 弧度，顺时针为正（canvas 坐标系） */
  rotation: number;
  /** 是否检测到有效人脸 */
  visible: boolean;
}

/** 人脸识别模型加载状态 */
export type ModelStatus = 'loading' | 'ready' | 'error';

/** 摄像头状态 */
export type CameraStatus = 'idle' | 'starting' | 'running' | 'error';
