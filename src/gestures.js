/**
 * Pointer and wheel gestures on the plot canvas: one pointer pans, two pointers pinch-zoom
 * around their midpoint, the wheel zooms around the pointer, a mouse traces while hovering and
 * a finger or pen traces where it taps. Coordinates passed on are CSS pixels inside the canvas.
 */

const TAP_SLOP_PX = 6;
const WHEEL_ZOOM_RATE = 0.0015;
const LINE_HEIGHT_PX = 16;

const midpoint = (p, q) => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 });
const distance = (p, q) => Math.hypot(p.x - q.x, p.y - q.y);

/**
 * Wires the gestures.
 * @param {HTMLElement} target the canvas (it should have touch-action: none)
 * @param {object} on callbacks
 * @param {(dx: number, dy: number) => void} on.pan content follows the pointer by (dx, dy) pixels
 * @param {(factor: number, x: number, y: number) => void} on.zoom factor < 1 zooms in around (x, y)
 * @param {(x: number, y: number, touch: boolean) => void} on.trace snap the read-out near (x, y)
 * @param {() => void} on.clearTrace hide the read-out
 * @param {() => void} on.interact any pan or zoom started
 */
export function attachGestures(target, on) {
  const pointers = new Map();
  let tapStart = null; // first pointer's position until it moves beyond the slop or a second one lands

  const local = (event) => {
    const rect = target.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const pinch = (anchor, from, to) => {
    const before = distance(anchor, from);
    const after = distance(anchor, to);
    if (before < 1 || after < 1) return;
    const m0 = midpoint(anchor, from);
    const m1 = midpoint(anchor, to);
    on.pan(m1.x - m0.x, m1.y - m0.y);
    on.zoom(before / after, m1.x, m1.y);
  };

  target.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    target.setPointerCapture(event.pointerId);
    const p = local(event);
    pointers.set(event.pointerId, p);
    tapStart = pointers.size === 1 ? p : null;
    if (pointers.size > 1) on.interact();
  });

  target.addEventListener('pointermove', (event) => {
    const p = local(event);
    const last = pointers.get(event.pointerId);
    if (!last) {
      if (event.pointerType === 'mouse') on.trace(p.x, p.y, false);
      return;
    }
    if (pointers.size === 1) {
      if (tapStart && distance(p, tapStart) < TAP_SLOP_PX) return;
      if (tapStart) {
        tapStart = null;
        on.clearTrace();
        on.interact();
        target.classList.add('is-dragging');
      }
      on.pan(p.x - last.x, p.y - last.y);
    } else if (pointers.size === 2) {
      const anchor = [...pointers].find(([id]) => id !== event.pointerId)[1];
      pinch(anchor, last, p);
    }
    pointers.set(event.pointerId, p);
  });

  const release = (event) => {
    if (!pointers.delete(event.pointerId)) return;
    if (tapStart && event.type === 'pointerup' && event.pointerType !== 'mouse') {
      on.trace(tapStart.x, tapStart.y, true);
    }
    tapStart = null;
    if (pointers.size === 0) target.classList.remove('is-dragging');
  };
  target.addEventListener('pointerup', release);
  target.addEventListener('pointercancel', release);
  target.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'mouse' && pointers.size === 0) on.clearTrace();
  });

  target.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      const unit = [1, LINE_HEIGHT_PX, target.clientHeight][event.deltaMode] ?? 1;
      const factor = Math.min(2, Math.max(0.5, Math.exp(event.deltaY * unit * WHEEL_ZOOM_RATE)));
      const p = local(event);
      on.interact();
      on.zoom(factor, p.x, p.y);
    },
    { passive: false },
  );
}
