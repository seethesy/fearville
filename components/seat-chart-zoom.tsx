'use client';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export function SeatChartZoom({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: ReactNode;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(width);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const element = viewport.current;
    if (!element) return;
    const measure = () => setAvailable(element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const fit = Math.min(1, Math.max(0.1, available / width));
  const scale = fit * zoom;
  const adjust = (step: number) =>
    setZoom((current) => Math.max(0.5, Math.min(3, current + step)));
  return (
    <div className="seat-chart-zoom">
      <div className="seat-chart-controls" aria-label="Seating chart zoom">
        <button type="button" onClick={() => adjust(-0.25)} disabled={zoom <= 0.5} aria-label="Zoom out seating chart">−</button>
        <button type="button" onClick={() => setZoom(1)} aria-label="Fit seating chart to screen">Fit</button>
        <button type="button" onClick={() => adjust(0.25)} disabled={zoom >= 3} aria-label="Zoom in seating chart">+</button>
        <output aria-live="polite">{Math.round(scale * 100)}%</output>
      </div>
      <div ref={viewport} className="seat-circle-scroll seat-chart-viewport">
        <div className="seat-chart-size" style={{ width: width * scale, height: height * scale }}>
          <div className="seat-chart-scaled" style={{ width, height, transform: `scale(${scale})` }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
