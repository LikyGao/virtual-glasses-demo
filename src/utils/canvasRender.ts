import type { GlassesTransform } from '../types';

export interface GlassesLayer {
  image: HTMLImageElement;
  transform: GlassesTransform;
  opacity: number;
}

/** 清空画布（关闭摄像头时用） */
export function clearCanvas(ctx: CanvasRenderingContext2D): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
}

/**
 * 绘制一帧：镜像的摄像头画面 + 眼镜图层。
 *
 * 关键点：整幅画面只做一次水平镜像变换，视频和眼镜都画在这个变换里，
 * 因此两者天然共用同一套坐标系，缩放页面也不会错位；
 * 截图直接导出 canvas，也就与用户看到的镜像画面完全一致。
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  layer: GlassesLayer | null,
): void {
  const { width, height } = ctx.canvas;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  // 1) 全局镜像，符合自拍习惯
  ctx.translate(width, 0);
  ctx.scale(-1, 1);

  // 2) 摄像头视频帧（canvas 尺寸等于视频原始尺寸，不会拉伸）
  ctx.drawImage(video, 0, 0, width, height);

  // 3) 眼镜图层：保存状态 → 平移到眼镜中心 → 按头部角度旋转 → 按眼距缩放 → 绘制 → 恢复
  if (layer && layer.transform.visible) {
    const { transform } = layer;
    ctx.save();
    ctx.translate(transform.centerX, transform.centerY);
    ctx.rotate(transform.rotation);
    ctx.globalAlpha = layer.opacity;
    ctx.drawImage(
      layer.image,
      -transform.width / 2,
      -transform.height / 2,
      transform.width,
      transform.height,
    );
    ctx.restore();
  }

  ctx.restore();
}
