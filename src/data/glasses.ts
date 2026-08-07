import type { GlassesConfig } from '../types';

/**
 * 眼镜素材配置。
 *
 * 所有素材都是项目内的 SVG（public/glasses/），不依赖外部图片地址。
 * 素材统一使用 400 × 140 的 viewBox，镜片中心线在 y = 70，
 * 因此高度由 GLASSES_ASSET_ASPECT_RATIO 统一推导，不用逐个配置。
 *
 * 调参说明：
 * - widthScale：镜架总宽 ÷ 双眼外眼角距离。人脸外眼角间距约 90mm，
 *   常见镜架总宽约 140mm，所以基准值取 1.55 左右，再按素材留白微调。
 * - verticalOffset：正数把眼镜往下移，单位是眼镜自身高度的倍数。
 *   瞳孔通常略高于镜片中心，所以一般是很小的正数。
 */

/** 素材宽高比（宽 ÷ 高），与 SVG 的 viewBox 一致 */
export const GLASSES_ASSET_ASPECT_RATIO = 400 / 140;

export const GLASSES_CATALOG: GlassesConfig[] = [
  {
    id: 'black-square',
    name: '黑色方框',
    caption: '经典板材 · 全框',
    assetUrl: 'glasses/black-square.svg',
    widthScale: 1.58,
    verticalOffset: 0.04,
    rotationOffset: 0,
    opacity: 1,
  },
  {
    id: 'gold-round',
    name: '金色圆框',
    caption: '细金属 · 复古圆框',
    assetUrl: 'glasses/gold-round.svg',
    widthScale: 1.52,
    verticalOffset: 0.03,
    rotationOffset: 0,
    opacity: 1,
  },
  {
    id: 'clear-frame',
    name: '透明框',
    caption: '透明醋酸纤维 · 粗框',
    assetUrl: 'glasses/clear-frame.svg',
    widthScale: 1.6,
    verticalOffset: 0.05,
    rotationOffset: 0,
    opacity: 0.92,
  },
  {
    id: 'sunglasses',
    name: '墨镜',
    caption: '深色镜片 · 飞行员型',
    assetUrl: 'glasses/sunglasses.svg',
    widthScale: 1.64,
    verticalOffset: 0.04,
    rotationOffset: 0,
    opacity: 0.96,
  },
];

/** 默认选中的眼镜 */
export const DEFAULT_GLASSES_ID = GLASSES_CATALOG[0].id;
