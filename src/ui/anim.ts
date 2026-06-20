import { springPath, springDurationMs, TAB_SPRING, type SpringParams } from "../spring";

// Animation toolkit. Pick the tool by the job:
//   • simple state change (hover, colour, opacity, a fixed-distance move) → a CSS
//     `transition` in app.css. Declarative, cheap, nothing to wire up.
//   • physical / measured / interruptible motion (springs, auto-height, FLIP,
//     drag tracking, staggered reveals) → `spring()` below. CSS can't sample a
//     spring curve or animate to `height: auto`.
// `spring()` is the single primitive every JS animation in the app builds on.

/**
 * Play a spring on `el`: sample the spring 0→1, turn each sample into a keyframe
 * via `frame(t)` (t overshoots slightly past 1, like real spring physics), and
 * run it. Returns the Animation so callers can await `.finished` or `.cancel()`.
 *
 *   spring(card, (t) => ({ height: `${lerp(from, to, t)}px` }), CARD_SPRING)
 */
export function spring(
  el: HTMLElement,
  frame: (t: number) => Keyframe,
  params: SpringParams = TAB_SPRING,
  opts: KeyframeAnimationOptions = {},
): Animation {
  const path = springPath(0, 1, params);
  return el.animate(path.map(frame), {
    duration: springDurationMs(path),
    easing: "linear",
    fill: "forwards",
    ...opts,
  });
}

/** Linear interpolate — the usual partner to `spring()`'s normalized `t`. */
export const lerp = (from: number, to: number, t: number): number => from + (to - from) * t;
/** Clamp to [0,1] — for properties (e.g. opacity) that must not follow the overshoot. */
export const clamp01 = (t: number): number => Math.min(1, Math.max(0, t));

// Card grow/shrink: near-critically damped so height neither overshoots into an
// empty gap on open nor bounces on close. Personality lives in the reveal below.
const CARD_SPRING: SpringParams = { stiffness: 320, damping: 34, mass: 1 };

// Snappier than the card grow — checkpoint rows pop in/out quickly. Well-damped
// so a reveal doesn't bounce.
const ROW_SPRING: SpringParams = { stiffness: 620, damping: 42, mass: 0.7 };

// A bit quicker than the card grow, for the logged-items show/hide. Critically
// damped (no bounce on a tall list), ~25% faster settle than CARD_SPRING.
export const LIST_SPRING: SpringParams = { stiffness: 520, damping: 46, mass: 1 };

// Each detail block fades up out of a blur — vertical only (the card never moves
// sideways). A little overshoot in the easing gives the "alive" feel.
const REVEAL_KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: "translateY(8px)", filter: "blur(5px)" },
  { opacity: 1, transform: "translateY(0)", filter: "blur(0px)" },
];
const REVEAL_EASE = "cubic-bezier(0.34, 1.3, 0.64, 1)";
const REVEAL_MS = 300;
const REVEAL_STAGGER_MS = 55;

// Size a textarea to its content (height = content). Re-run on content change,
// width change (window/sidebar resize), and font load — see callers.
export function autosizeTextarea(el: HTMLTextAreaElement): void {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

let notesMirror: HTMLDivElement | null = null;
// Height-only autosize: KEEP the textarea's CSS width and grow the height to hug
// wrapped content — one line tall when empty. WebKit's textarea scrollHeight is
// unreliable for a width-constrained box (it can stay several lines tall when
// empty), so measure via an offscreen mirror at the box's own width instead.
// ponytail: one shared mirror node, fine for these few notes fields.
export function autosizeHeight(el: HTMLTextAreaElement): void {
  if (!notesMirror) {
    notesMirror = document.createElement("div");
    notesMirror.style.cssText =
      "position:absolute;top:-9999px;left:0;visibility:hidden;pointer-events:none;";
    document.body.appendChild(notesMirror);
  }
  const m = notesMirror;
  const cs = getComputedStyle(el);
  m.style.fontFamily = cs.fontFamily;
  m.style.fontSize = cs.fontSize;
  m.style.fontWeight = cs.fontWeight;
  m.style.lineHeight = cs.lineHeight;
  m.style.letterSpacing = cs.letterSpacing;
  m.style.whiteSpace = "pre-wrap";
  m.style.overflowWrap = "anywhere";
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  m.style.width = `${Math.max(0, el.clientWidth - padX)}px`;
  // A trailing newline (or empty value) needs a sentinel char to reserve its line.
  m.textContent = el.value === "" || el.value.endsWith("\n") ? el.value + "x" : el.value;
  el.style.height = `${m.offsetHeight}px`;
}

/** Spring an element's `height` from one px value to another. Returns the Animation. */
export function springHeight(el: HTMLElement, from: number, to: number, params: SpringParams = CARD_SPRING): Animation {
  return spring(el, (t) => ({ height: `${lerp(from, to, t)}px` }), params);
}

/**
 * Spring a freshly-inserted row open: height 0→its natural height with a blur-
 * fade-in. Measure-then-collapse synchronously (no flash), then animate and clear
 * the inline styles. Used when a new checkpoint appears.
 */
export function revealRow(el: HTMLElement): Animation {
  const target = el.offsetHeight; // natural height (already in flow)
  el.style.height = "0px";
  el.style.overflow = "hidden";
  el.style.opacity = "0";
  const anim = spring(el, (t) => {
    const c = clamp01(t); // height/opacity must not follow the spring's overshoot
    return { height: `${lerp(0, target, c)}px`, opacity: `${c}`, filter: `blur(${lerp(4, 0, c)}px)` };
  }, ROW_SPRING);
  anim.finished.then(
    () => {
      anim.cancel(); // drop fill:forwards so the row reflows at auto height
      el.style.height = el.style.overflow = el.style.opacity = el.style.filter = "";
    },
    () => {},
  );
  return anim;
}

/** Spring a row closed (height→0, fade out), then run `done` (e.g. remove it). */
export function collapseRow(el: HTMLElement, done: () => void): Animation {
  const from = el.offsetHeight;
  el.style.overflow = "hidden";
  const anim = spring(el, (t) => {
    const c = clamp01(t);
    return { height: `${lerp(from, 0, c)}px`, opacity: `${1 - c}`, filter: `blur(${lerp(0, 3, c)}px)` };
  }, ROW_SPRING);
  anim.finished.then(done, done);
  return anim;
}

/**
 * Reveal `blocks` one after another (blur-fade-up, staggered). Callers hide the
 * blocks (inline `opacity: 0`) during the grow; this animates them back in and
 * clears the inline style afterwards. Returns the animations so they can be
 * cancelled if the card closes mid-reveal.
 */
export function staggerReveal(blocks: HTMLElement[]): Animation[] {
  return blocks.map((el, i) => {
    const anim = el.animate(REVEAL_KEYFRAMES, {
      duration: REVEAL_MS,
      delay: i * REVEAL_STAGGER_MS,
      easing: REVEAL_EASE,
      fill: "both",
    });
    anim.finished.then(
      () => {
        el.style.opacity = "";
        anim.cancel();
      },
      () => {}, // cancelled — nothing to clean up
    );
    return anim;
  });
}
