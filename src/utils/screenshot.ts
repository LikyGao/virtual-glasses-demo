import { SCREENSHOT_FILENAME_PREFIX } from '../constants';

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

/** 生成 virtual-glasses-YYYYMMDD-HHmmss.png 形式的文件名 */
export function buildScreenshotFilename(date = new Date()): string {
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${SCREENSHOT_FILENAME_PREFIX}-${stamp}.png`;
}

/**
 * 把 canvas 当前内容导出为 PNG 并触发下载。
 * canvas 上已经是「镜像后的视频 + 眼镜」，所以截图与用户所见完全一致。
 */
export function downloadCanvasAsPng(canvas: HTMLCanvasElement): Promise<void> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('画面导出失败'));
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = buildScreenshotFilename();
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      // 释放对象 URL，避免内存泄漏
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, 'image/png');
  });
}
