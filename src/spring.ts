export interface SpringParams {
  stiffness: number;
  damping: number;
  mass: number;
}

// The "FluidTabs" spring — used for the sliding label pill AND the board
// content transition, so switching labels feels like one unified motion.
export const TAB_SPRING: SpringParams = { stiffness: 380, damping: 34, mass: 0.75 };

// The "DisclosureCard" reveal used by the New popover and the Quick Find modal so
// both open with the same motion. Critically damped (no bounce) and tuned to
// settle in ~220ms — Emil's rule: UI motion stays under 300ms.
export const DISCLOSURE_SPRING: SpringParams = { stiffness: 600, damping: 22, mass: 0.2 };

// Damped-spring simulation from `from` to `to`. Returns sample positions at
// 120fps — feed to element.animate() as keyframes with linear easing for a
// physically accurate spring (what Framer Motion's `type: "spring"` produces).
export function springPath(from: number, to: number, p: SpringParams): number[] {
  const dt = 1 / 120;
  const range = Math.abs(to - from) || 1;
  const out: number[] = [];
  let x = from;
  let v = 0;
  for (let i = 0; i < 600; i++) {
    const a = (-p.stiffness * (x - to) - p.damping * v) / p.mass;
    v += a * dt;
    x += v * dt;
    out.push(x);
    if (Math.abs(to - x) < range * 0.004 && Math.abs(v) < range * 0.05) break;
  }
  out.push(to);
  return out;
}

export function springDurationMs(path: number[]): number {
  return (path.length / 120) * 1000;
}
