import { icon, type IconName } from "../icons";
import { spring, clamp01 } from "./anim";

export interface NewPopoverHandlers {
  onBurst: () => void;
  onArc: () => void;
}

// The DisclosureCard spring — soft, slow, near-zero bounce.
const DISCLOSURE_SPRING = { stiffness: 26.7, damping: 4.1, mass: 0.2 };

// Only one popover at a time. Clicking New while it's open closes it (toggle).
let activeClose: (() => void) | null = null;

function option(iconName: IconName, title: string, desc: string, onPick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "np-option";
  b.innerHTML = `<span class="np-icon">${icon(iconName, 16)}</span><span class="np-text"><span class="np-name">${title}</span><span class="np-desc">${desc}</span></span>`;
  b.addEventListener("click", onPick);
  return b;
}

export function openNewPopover(anchor: HTMLElement, h: NewPopoverHandlers): void {
  // toggle: a popover is already open → close it and stop (no stacking)
  if (activeClose) {
    activeClose();
    return;
  }

  const pop = document.createElement("div");
  pop.className = "new-popover";
  pop.style.transition = "none"; // WAAPI drives open/close, not CSS
  pop.innerHTML = `<div class="np-options"></div>
    <p class="np-foot">A <b>burst</b> is a finite project you finish. An <b>arc</b> is an ongoing area of life.</p>`;
  document.body.appendChild(pop);

  const opts = pop.querySelector<HTMLElement>(".np-options")!;
  const pick = (fn: () => void) => () => {
    close();
    fn();
  };
  opts.append(
    option("burst", "New Burst", "A focused project with an end", pick(h.onBurst)),
    option("arc", "New Arc", "An ongoing area of life", pick(h.onArc)),
  );

  // anchor: grow up from the button's bottom-left corner
  const a = anchor.getBoundingClientRect();
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, a.left)}px`;
  pop.style.top = `${Math.max(8, a.top - r.height - 8)}px`;
  pop.style.transformOrigin = "bottom left";

  // open with the Disclosure spring
  pop.style.opacity = "0";
  const openAnim = spring(
    pop,
    (t) => ({ opacity: String(clamp01(t)), transform: `translateY(${(1 - t) * 8}px) scale(${0.9 + t * 0.1})` }),
    DISCLOSURE_SPRING,
  );
  openAnim.addEventListener("finish", () => {
    pop.style.opacity = "1";
    pop.style.transform = "none";
    openAnim.cancel();
  });

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    activeClose = null;
    document.removeEventListener("mousedown", onOut, true);
    document.removeEventListener("keydown", onKey, true);
    pop.getAnimations().forEach((an) => an.cancel());
    const out = pop.animate(
      [
        { opacity: 1, transform: "none" },
        { opacity: 0, transform: "translateY(4px) scale(0.97)" },
      ],
      { duration: 130, easing: "cubic-bezier(0.4, 0, 1, 1)", fill: "forwards" },
    );
    out.addEventListener("finish", () => pop.remove());
  }

  function onOut(e: MouseEvent): void {
    const t = e.target as Node;
    if (!pop.contains(t) && t !== anchor && !anchor.contains(t)) close();
  }
  function onKey(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (k === "b") {
      e.preventDefault();
      pick(h.onBurst)();
    } else if (k === "a") {
      e.preventDefault();
      pick(h.onArc)();
    }
  }
  activeClose = close;
  window.setTimeout(() => {
    document.addEventListener("mousedown", onOut, true);
    document.addEventListener("keydown", onKey, true);
  }, 0);
}
