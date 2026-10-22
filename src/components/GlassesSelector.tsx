import type { GlassesConfig } from '../types';

interface GlassesSelectorProps {
  catalog: GlassesConfig[];
  selectedId: string;
  onSelect: (id: string) => void;
}

/**
 * 眼镜选择区。切换只改变一个 id，不触碰摄像头与模型实例。
 * 用 radiogroup 语义，键盘和读屏都能正常操作。
 */
export function GlassesSelector({ catalog, selectedId, onSelect }: GlassesSelectorProps) {
  return (
    <section className="selector" aria-label="メガネ選択">
      <h2 className="section-label">フレームを選ぶ</h2>
      <div className="selector__list" role="radiogroup" aria-label="メガネの種類">
        {catalog.map((item) => {
          const selected = item.id === selectedId;
          return (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={`frame-card${selected ? ' frame-card--selected' : ''}`}
              onClick={() => onSelect(item.id)}
            >
              <span className="frame-card__preview">
                <img src={item.assetUrl} alt="" width={400} height={140} />
              </span>
              <span className="frame-card__name">{item.name}</span>
              <span className="frame-card__caption">{item.caption}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
