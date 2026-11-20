import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Maximize2, Minus, Plus, Scan, X } from 'lucide-react';

const MIN_SCALE = 0.25;
const MAX_SCALE = 4;
const STEP = 1.25;

type Props = {
  src: string;
  alt: string;
  onClose: () => void;
};

/**
 * Full-window viewer for Help screenshots. Opens fitted to the window; zoom with the buttons,
 * +/- keys or Ctrl/⌘+scroll, click the image to toggle between fit and actual size, and drag or
 * scroll to look around. Esc, the close button or a click on the backdrop closes it.
 */
export default function ImageViewer({ src, alt, onClose }: Props) {
  // null = fit to window; otherwise a multiple of the image's natural size
  const [scale, setScale] = useState<number | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [fitScale, setFitScale] = useState(1);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number; moved: boolean } | null>(null);

  const measureFit = useCallback(() => {
    const vp = viewportRef.current;
    if (!vp || !natural) return;
    setFitScale(Math.min(1, (vp.clientWidth - 32) / natural.w, (vp.clientHeight - 32) / natural.h));
  }, [natural]);

  useEffect(() => {
    measureFit();
    window.addEventListener('resize', measureFit);
    return () => window.removeEventListener('resize', measureFit);
  }, [measureFit]);

  const current = scale ?? fitScale;
  const zoomTo = useCallback((next: number) => {
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)));
  }, []);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomTo(current * STEP);
      } else if (e.key === '-') {
        e.preventDefault();
        zoomTo(current / STEP);
      } else if (e.key === '0') {
        e.preventDefault();
        setScale(null);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [current, onClose, zoomTo]);

  const onWheel = (e: React.WheelEvent) => {
    if (!(e.ctrlKey || e.metaKey)) return; // plain scrolling pans
    e.preventDefault();
    zoomTo(e.deltaY < 0 ? current * STEP : current / STEP);
  };

  // Drag to pan when the image is larger than the window
  const onPointerDown = (e: React.PointerEvent) => {
    const vp = viewportRef.current;
    if (!vp || e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, left: vp.scrollLeft, top: vp.scrollTop, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const vp = viewportRef.current;
    const d = drag.current;
    if (!vp || !d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    vp.scrollLeft = d.left - dx;
    vp.scrollTop = d.top - dy;
  };
  const endDrag = () => {
    setTimeout(() => { drag.current = null; }, 0);
  };

  const onImageClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (drag.current?.moved) return;
    setScale(scale === null && fitScale < 1 ? 1 : null);
  };

  const width = natural ? Math.round(natural.w * current) : undefined;
  const zoomedIn = natural !== null && current > fitScale + 0.001;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col bg-black/85 text-white"
      role="dialog"
      aria-modal="true"
      aria-label={alt ? `Image: ${alt}` : 'Image viewer'}
    >
      <div className="flex items-center gap-2 px-4 py-2 bg-black/60 border-b border-white/10">
        <p className="flex-1 truncate text-sm text-white/80" title={alt}>{alt}</p>
        <button type="button" className="p-1.5 rounded hover:bg-white/15" onClick={() => zoomTo(current / STEP)} title="Zoom out (−)" aria-label="Zoom out">
          <Minus className="w-4 h-4" />
        </button>
        <span className="w-14 text-center text-sm tabular-nums" aria-live="polite">{Math.round(current * 100)}%</span>
        <button type="button" className="p-1.5 rounded hover:bg-white/15" onClick={() => zoomTo(current * STEP)} title="Zoom in (+)" aria-label="Zoom in">
          <Plus className="w-4 h-4" />
        </button>
        <button type="button" className="p-1.5 rounded hover:bg-white/15" onClick={() => setScale(null)} title="Fit to window (0)" aria-label="Fit to window">
          <Scan className="w-4 h-4" />
        </button>
        <button type="button" className="p-1.5 rounded hover:bg-white/15" onClick={() => setScale(1)} title="Actual size" aria-label="Actual size">
          <Maximize2 className="w-4 h-4" />
        </button>
        <button ref={closeRef} type="button" className="ml-2 p-1.5 rounded hover:bg-white/15" onClick={onClose} title="Close (Esc)" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>
      <div
        ref={viewportRef}
        className={`flex-1 overflow-auto ${zoomedIn ? 'cursor-grab active:cursor-grabbing' : ''}`}
        onClick={() => { if (!drag.current?.moved) onClose(); }}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {/* min-w/min-h + margin:auto centres the image when smaller than the window */}
        <div className="min-w-full min-h-full flex p-4">
          <img
            src={src}
            alt={alt}
            draggable={false}
            onLoad={(e) => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
            onClick={onImageClick}
            style={{ width, maxWidth: 'none' }}
            className={`m-auto rounded shadow-2xl select-none ${zoomedIn ? '' : 'cursor-zoom-in'}`}
          />
        </div>
      </div>
    </div>,
    document.body
  );
}
