import { icon, type IconName } from "../icons";

export interface NewPopoverHandlers {
  onBurst: () => void;
  onArc: () => void;
}

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

  // Open with the CSS disclosure transition (the `.open` class), NOT WAAPI — CSS
  // transitions play even when the OS has Reduce Motion on, whereas WebKit
  // (WKWebView) suppresses Web Animations under reduced motion. Force a reflow so
  // the resting state (opacity 0 / scaled) commits before flipping to `.open`.
  void pop.offsetWidth;
  pop.classList.add("open");

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    activeClose = null;
    document.removeEventListener("mousedown", onOut, true);
    document.removeEventListener("keydown", onKey, true);
    pop.classList.remove("open");
    pop.classList.add("closing");
    pop.addEventListener("transitionend", () => pop.remove(), { once: true });
    window.setTimeout(() => pop.remove(), 250); // fallback if transitionend doesn't fire
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
