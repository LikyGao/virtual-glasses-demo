import { useEffect, useRef, useState } from 'react';
import type { GlassesConfig } from '../types';

export type GlassesImageMap = Map<string, HTMLImageElement>;

/**
 * 预加载全部眼镜素材，并把结果放进一个 ref 里供渲染循环同步读取。
 * 素材只加载一次，切换眼镜时不会触发任何重新加载或重新初始化。
 */
export function useGlassesImages(catalog: GlassesConfig[]): {
  imagesRef: React.RefObject<GlassesImageMap>;
  loadedCount: number;
} {
  const imagesRef = useRef<GlassesImageMap>(new Map());
  const [loadedCount, setLoadedCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const images = imagesRef.current;

    catalog.forEach((item) => {
      if (images.has(item.id)) return;
      const image = new Image();
      image.decoding = 'async';
      image.onload = () => {
        if (cancelled) return;
        images.set(item.id, image);
        setLoadedCount(images.size);
      };
      image.onerror = () => {
        console.error(`[Glasses] 素材加载失败：${item.assetUrl}`);
      };
      // 相对路径基于 Vite 的 base，部署到子目录时同样有效
      image.src = new URL(item.assetUrl, document.baseURI).href;
    });

    return () => {
      cancelled = true;
    };
  }, [catalog]);

  return { imagesRef, loadedCount };
}
