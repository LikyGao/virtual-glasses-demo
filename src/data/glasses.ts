import type { GlassesConfig } from '../types';

/**
 * GLB coordinates are calibrated from each model's front frame and lens center.
 * widthScale is frame width / 3D outer-eye distance; fitOffset is in frame widths.
 * These are visual-fit estimates, not measured millimeter dimensions.
 */
export const GLASSES_ASSET_ASPECT_RATIO = 400 / 140;

export const GLASSES_CATALOG: GlassesConfig[] = [
  {
    id: 'classic-black', name: 'ハートフレーム', caption: '立体モデル · ライトピンク',
    assetUrl: 'models/classic-black.png', modelUrl: 'models/classic_black_oval.glb',
    modelRotation: [0, 0, 0], frontMesh: 'Object_4', lensMesh: 'Object_8',
    fitOffset: [0, -0.015, 0.15], widthScale: 1.52, verticalOffset: 0.03, rotationOffset: 0, opacity: 1,
  },
  {
    id: 'classic-round', name: 'ブラックスクエア', caption: '立体モデル · セルフレーム',
    assetUrl: 'models/classic-round.png', modelUrl: 'models/classic_round.glb',
    modelRotation: [0, 0, 0], frontMesh: 'Object_5', lensMesh: 'Object_9',
    fitOffset: [0, -0.015, 0.15], widthScale: 1.52, verticalOffset: 0.03, rotationOffset: 0, opacity: 1,
  },
  {
    id: 'aviator', name: 'スクエアサングラス', caption: '立体モデル · ダークレンズ',
    assetUrl: 'models/aviator.png', modelUrl: 'models/sunglasses_aviator_round.glb',
    modelRotation: [0, 0, 0], frontMesh: 'Glasses_Glasses1_0', lensMesh: 'Glasses_Lenses_0',
    fitOffset: [0, -0.025, 0.15], widthScale: 1.56, verticalOffset: 0.08, rotationOffset: 0, opacity: 1,
  },
];

/** 默认选中的眼镜 */
export const DEFAULT_GLASSES_ID = GLASSES_CATALOG[0].id;
