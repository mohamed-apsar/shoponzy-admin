import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import "./ImageCropper.css";

 

/* Crop dialog with a locked aspect ratio. Drag to reposition, wheel / slider to zoom, slider or the
   90° buttons to rotate. The image always covers the frame, so the output never has empty corners.
   onConfirm receives a JPEG File rendered at exactly output.width × output.height. */

const MAX_ZOOM = 5;
const rad = (deg) => (deg * Math.PI) / 180;

// Smallest scale at which the rotated image still covers a W×H frame.
function coverScale(img, W, H, deg) {
  const c = Math.abs(Math.cos(rad(deg)));
  const s = Math.abs(Math.sin(rad(deg)));
  return Math.max((W * c + H * s) / img.w, (W * s + H * c) / img.h);
}

// Keeps the frame inside the (rotated, scaled) image by clamping the offset in the image's own axes.
function clampOffset(offset, img, W, H, deg, scale) {
  const t = rad(deg);
  const c = Math.cos(t);
  const s = Math.sin(t);
  const qx = c * offset.x + s * offset.y;
  const qy = -s * offset.x + c * offset.y;
  const maxX = Math.max(0, (scale * img.w - (W * Math.abs(c) + H * Math.abs(s))) / 2);
  const maxY = Math.max(0, (scale * img.h - (W * Math.abs(s) + H * Math.abs(c))) / 2);
  const cx = Math.min(maxX, Math.max(-maxX, qx));
  const cy = Math.min(maxY, Math.max(-maxY, qy));
  return { x: c * cx - s * cy, y: s * cx + c * cy };
}

function frameSize(aspect) {
  const maxW = Math.min(620, (typeof window !== "undefined" ? window.innerWidth : 800) - 72);
  const maxH = Math.min(420, (typeof window !== "undefined" ? window.innerHeight : 800) * 0.5);
  let W = maxW;
  let H = W / aspect;
  if (H > maxH) { H = maxH; W = H * aspect; }
  return { W: Math.round(W), H: Math.round(H) };
}

export default function ImageCropper({ source, title, aspect, output, onCancel, onConfirm }) {
  const [img, setImg] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [{ W, H }] = useState(() => frameSize(aspect));
  const frameRef = useRef(null);
  const drag = useRef(null);

  // source is a File (fresh upload) or a URL (re-cropping a saved image; Cloudinary allows CORS).
  useEffect(() => {
    let objectUrl = "";
    let cancelled = false;
    const el = new Image();
    // Handlers first, and ignored once this effect is cleaned up (its object URL is revoked then).
    el.onload = () => { if (!cancelled) setImg({ el, src: el.src, w: el.naturalWidth, h: el.naturalHeight }); };
    el.onerror = () => {
      if (cancelled) return;
      setLoadError(typeof source === "string"
        ? "This saved image can't be opened for cropping. Upload the original file instead."
        : "This file couldn't be read as an image.");
    };
    if (typeof source === "string") {
      el.crossOrigin = "anonymous";
      el.src = source;
    } else {
      objectUrl = URL.createObjectURL(source);
      el.src = objectUrl;
    }
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [source]);

  const scale = img ? coverScale(img, W, H, rotation) * zoom : 1;

  const update = useCallback((next) => {
    if (!img) return;
    const z = Math.min(MAX_ZOOM, Math.max(1, next.zoom ?? zoom));
    const r = next.rotation ?? rotation;
    const s = coverScale(img, W, H, r) * z;
    setZoom(z);
    setRotation(r);
    setOffset(clampOffset(next.offset ?? offset, img, W, H, r, s));
  }, [img, zoom, rotation, offset, W, H]);

  // Wheel zoom needs a non-passive listener to stop the page/modal from scrolling.
  const updateRef = useRef(update);
  updateRef.current = update;
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      updateRef.current({ zoom: zoomRef.current * (event.deltaY < 0 ? 1.08 : 1 / 1.08) });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [img]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !busy) onCancel(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  function onPointerDown(event) {
    if (!img) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, start: offset };
  }
  function onPointerMove(event) {
    if (!drag.current) return;
    const d = drag.current;
    update({ offset: { x: d.start.x + event.clientX - d.x, y: d.start.y + event.clientY - d.y } });
  }
  function onPointerUp() { drag.current = null; }

  function onKeyDown(event) {
    const step = event.shiftKey ? 20 : 5;
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[event.key]) {
      event.preventDefault();
      update({ offset: { x: offset.x + moves[event.key][0], y: offset.y + moves[event.key][1] } });
    } else if (event.key === "+" || event.key === "=") update({ zoom: zoom * 1.1 });
    else if (event.key === "-") update({ zoom: zoom / 1.1 });
  }

  const rotateBy = (delta) => {
    let r = rotation + delta;
    if (r > 180) r -= 360;
    if (r < -180) r += 360;
    update({ rotation: r });
  };

  async function confirm() {
    if (!img) return;
    setBusy(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = output.width;
      canvas.height = output.height;
      const ctx = canvas.getContext("2d");
      const k = output.width / W;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingQuality = "high";
      ctx.translate(output.width / 2 + offset.x * k, output.height / 2 + offset.y * k);
      ctx.rotate(rad(rotation));
      ctx.scale(scale * k, scale * k);
      ctx.drawImage(img.el, -img.w / 2, -img.h / 2);
      const blob = await new Promise((resolve, reject) => {
        try { canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("empty"))), "image/jpeg", 0.9); } catch (err) { reject(err); }
      });
      const base = (typeof source === "string" ? "image" : source.name.replace(/\.[^.]+$/, "")) || "image";
      await onConfirm(new File([blob], `${base}-${output.width}x${output.height}.jpg`, { type: "image/jpeg" }));
    } catch {
      setLoadError("The cropped image couldn't be created. Upload the original file instead.");
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="ic-overlay" onClick={() => !busy && onCancel()}>
      <section className="ic-dialog" role="dialog" aria-modal="true" aria-label={`Crop ${title}`} onClick={(e) => e.stopPropagation()}>
        <header className="ic-header">
          <h3>Crop {title}</h3>
          <span>{output.width} × {output.height} px</span>
        </header>
        <div
          ref={frameRef}
          className="ic-frame"
          style={{ width: W, height: H }}
          tabIndex={0}
          aria-label="Crop area. Drag or use the arrow keys to reposition; plus and minus to zoom."
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        >
          {img && <img
            src={img.src}
            alt=""
            draggable={false}
            style={{
              width: img.w, height: img.h, left: (W - img.w) / 2, top: (H - img.h) / 2,
              transform: `translate(${offset.x}px, ${offset.y}px) rotate(${rotation}deg) scale(${scale})`,
            }}
          />}
          {!img && !loadError && <p className="ic-status">Loading image…</p>}
          <span className="ic-grid" aria-hidden="true" />
        </div>
        {loadError && <p className="cm-error">{loadError}</p>}
        <div className="ic-controls">
          <label>Zoom
            <input type="range" min="1" max={MAX_ZOOM} step="0.01" value={zoom} disabled={!img} onChange={(e) => update({ zoom: Number(e.target.value) })} />
          </label>
          <label><span>Rotate <output>{Math.round(rotation)}°</output></span>
            <input type="range" min="-180" max="180" step="1" value={rotation} disabled={!img} onChange={(e) => update({ rotation: Number(e.target.value) })} />
          </label>
          <div className="ic-buttons">
            <button type="button" className="cm-secondary-btn" disabled={!img} onClick={() => rotateBy(-90)}>⟲ 90°</button>
            <button type="button" className="cm-secondary-btn" disabled={!img} onClick={() => rotateBy(90)}>⟳ 90°</button>
            <button type="button" className="cm-secondary-btn" disabled={!img} onClick={() => update({ zoom: 1, rotation: 0, offset: { x: 0, y: 0 } })}>Reset</button>
          </div>
        </div>
        <div className="ic-actions">
          <button type="button" className="cm-secondary-btn" onClick={onCancel} disabled={busy}>Cancel</button>
          <button type="button" className="cm-primary-btn" onClick={confirm} disabled={!img || busy}>{busy ? "Uploading…" : "Crop & upload"}</button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
