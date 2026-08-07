import {
  ROTATION_SMOOTHING_FACTOR,
  SMOOTHING_FACTOR,
  SMOOTHING_SNAP_RATIO,
} from '../constants';
import type { GlassesTransform } from '../types';

/**
 * 一阶指数平滑：
 *   smoothed = previous * factor + current * (1 - factor)
 * factor 越大越稳定、越迟钝。
 */
export class ExponentialSmoother {
  private value: number | null = null;

  constructor(private readonly factor: number) {}

  /**
   * 输入本帧原始值，返回平滑后的值。
   * @param snapThreshold 变化超过该阈值时直接跳变（用于重新入画等突变场景）
   */
  next(target: number, snapThreshold = Number.POSITIVE_INFINITY): number {
    if (this.value === null || Math.abs(target - this.value) > snapThreshold) {
      this.value = target;
      return this.value;
    }
    this.value = this.value * this.factor + target * (1 - this.factor);
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

/**
 * 角度专用平滑器。直接对弧度做插值会在 ±π 处跳变，
 * 这里先把差值折算到 [-π, π] 再平滑。
 */
export class AngleSmoother {
  private value: number | null = null;

  constructor(private readonly factor: number) {}

  next(target: number): number {
    if (this.value === null) {
      this.value = target;
      return this.value;
    }
    let delta = target - this.value;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    this.value += delta * (1 - this.factor);
    return this.value;
  }

  reset(): void {
    this.value = null;
  }
}

/**
 * 把眼镜的四个关键参数（中心 X / 中心 Y / 宽度 / 旋转角）分别平滑，
 * 高度由宽度按素材比例推导，因此不需要单独平滑。
 */
export class GlassesTransformSmoother {
  private readonly centerX = new ExponentialSmoother(SMOOTHING_FACTOR);
  private readonly centerY = new ExponentialSmoother(SMOOTHING_FACTOR);
  private readonly width = new ExponentialSmoother(SMOOTHING_FACTOR);
  private readonly rotation = new AngleSmoother(ROTATION_SMOOTHING_FACTOR);

  /**
   * @param transform 本帧原始参数
   * @param referenceSize 画面参考尺寸（一般传 canvas 宽度），用于计算跳变阈值
   */
  smooth(transform: GlassesTransform, referenceSize: number): GlassesTransform {
    if (!transform.visible) {
      return transform;
    }
    const snap = referenceSize * SMOOTHING_SNAP_RATIO;
    const width = this.width.next(transform.width, snap);

    return {
      ...transform,
      centerX: this.centerX.next(transform.centerX, snap),
      centerY: this.centerY.next(transform.centerY, snap),
      width,
      // 高度跟随平滑后的宽度，保证素材不变形
      height: width * (transform.height / transform.width),
      rotation: this.rotation.next(transform.rotation),
    };
  }

  /** 人脸丢失或摄像头重启时调用，避免下次出现「从旧位置飘过来」 */
  reset(): void {
    this.centerX.reset();
    this.centerY.reset();
    this.width.reset();
    this.rotation.reset();
  }
}
