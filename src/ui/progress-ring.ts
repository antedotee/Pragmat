// A burst's completion as a thin ring that sweeps clockwise from 12 o'clock.
// The SVG is the burst's icon (sidebar lane + board header); setRingProgress
// sweeps the arc to its new value.
//
// The sweep is interruptible (a new completion re-targets a sweep already in
// flight), so it reads the live computed offset and animates from there via
// element.animate() rather than a CSS transition.

const SWEEP_MS = 600; // sweep duration so completing a to-do is visible

const R = 40; // viewBox-100 radius; stroke-width 12 → ~2px arc at the 16–21px display sizes
const C = 2 * Math.PI * R; // arc circumference = full dash length

const clamp = (f: number): number => Math.max(0, Math.min(1, f));
const offset = (frac: number): number => C * (1 - clamp(frac)); // 0% → whole dash hidden

export function progressRing(size: number, frac: number): string {
  return `<svg class="pie" width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" aria-hidden="true">
    <circle class="pie-track stroke-line" cx="50" cy="50" r="${R}" stroke-width="12"/>
    <circle class="pie-arc stroke-accent" cx="50" cy="50" r="${R}" stroke-width="12" stroke-linecap="round"
      transform="rotate(-90 50 50)" stroke-dasharray="${C}" stroke-dashoffset="${offset(frac)}"/>
  </svg>`;
}

// Re-target an existing ring; sweep the arc from its current offset to the new
// one. Interruptible: reads the live computed offset so a sweep already in flight
// continues from where it is.
export function setRingProgress(svg: Element, frac: number): void {
  const arc = svg.querySelector<SVGCircleElement>(".pie-arc");
  if (!arc) return;
  const to = offset(frac);
  const from = parseFloat(getComputedStyle(arc).strokeDashoffset) || to;
  arc.getAnimations().forEach((a) => a.cancel());
  arc.style.strokeDashoffset = String(to); // commit the resting value
  if (from === to) return;
  arc.animate(
    [{ strokeDashoffset: `${from}px` }, { strokeDashoffset: `${to}px` }],
    { duration: SWEEP_MS, easing: "cubic-bezier(0.65, 0, 0.35, 1)" },
  );
}
