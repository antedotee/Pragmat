import { searchAll, todoLocationLabel, type View, type Task } from "../state";
import { icon } from "../icons";
import { spring, clamp01, springHeight, LIST_SPRING } from "./anim";
import { DISCLOSURE_SPRING } from "../spring";

export interface SearchHandlers {
  onPickView: (view: View) => void; // burst/arc → open its view
  onPickTodo: (task: Task) => void; // todo → reveal + highlight in its view
}

interface ResultItem {
  el: HTMLElement;
  activate: () => void;
}

const ROW =
  "flex items-center gap-2.5 mx-1.5 px-3 py-2 rounded-lg cursor-pointer text-text " +
  "[transition:background_100ms_var(--ease-out)] data-[sel]:bg-sel hover:bg-hover";

const esc = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

let isOpen = false;

// ⌘F Quick Find. A floating panel in the upper third; results grow the panel
// height with a spring as you filter (content stays visible — accordion).
export function openSearch(h: SearchHandlers): void {
  if (isOpen) return; // already open
  isOpen = true;

  const backdrop = document.createElement("div");
  backdrop.className =
    "fixed inset-0 z-[200] flex justify-center items-start pt-[15vh] px-4 bg-black/20 " +
    "opacity-0 [transition:opacity_150ms_var(--ease-out)]";

  const panel = document.createElement("div");
  panel.className =
    "w-[440px] max-w-full flex flex-col overflow-hidden bg-surface border border-line rounded-card shadow-modal";
  panel.style.opacity = "0"; // avoid a first-frame flash before the enter animation

  // search input row
  const head = document.createElement("div");
  head.className = "flex items-center gap-2.5 px-3.5 h-12 flex-none";
  head.innerHTML = `<span class="flex-none grid place-items-center text-faint">${icon("search", 16)}</span>`;
  const input = document.createElement("input");
  input.className = "flex-1 min-w-0 bg-transparent outline-none text-[15px] text-text placeholder:text-faint";
  input.placeholder = "Quick Find";
  input.spellcheck = false;
  const clearBtn = document.createElement("button");
  clearBtn.type = "button";
  clearBtn.className =
    "flex-none grid place-items-center w-6 h-6 rounded-md text-faint hover:text-accent hover:bg-hover " +
    "[transition:color_120ms_var(--ease-out),background_120ms_var(--ease-out)]";
  clearBtn.innerHTML = icon("x", 14);
  clearBtn.addEventListener("click", () => {
    input.value = "";
    render();
    input.focus();
  });
  head.append(input, clearBtn);

  // results — height is sprung; max-height + scroll for long lists
  const results = document.createElement("div");
  results.className = "overflow-y-auto max-h-[58vh] pb-1.5";
  results.style.height = "0px";

  panel.append(head, results);
  backdrop.append(panel);
  document.body.append(backdrop);

  let items: ResultItem[] = [];
  let selected = -1;

  function highlight(): void {
    items.forEach((it, i) => it.el.toggleAttribute("data-sel", i === selected));
    items[selected]?.el.scrollIntoView({ block: "nearest" });
  }

  function listRow(type: "burst" | "arc", name: string): HTMLElement {
    const r = document.createElement("div");
    r.className = ROW;
    r.innerHTML =
      `<span class="flex-none grid place-items-center text-dim">${icon(type, 16)}</span>` +
      `<span class="truncate font-medium">${esc(name)}</span>`;
    return r;
  }

  function todoRow(task: Task): HTMLElement {
    const r = document.createElement("div");
    r.className = ROW;
    r.innerHTML =
      `<span class="flex-none w-4 h-4 rounded-[5px] border-[1.5px] border-check"></span>` +
      `<span class="flex flex-col min-w-0 leading-tight">` +
      `<span class="truncate">${esc(task.title || "New to-do")}</span>` +
      `<span class="truncate text-[12px] text-faint">${esc(todoLocationLabel(task))}</span></span>`;
    return r;
  }

  function divider(): HTMLElement {
    const d = document.createElement("div");
    d.className = "my-1 mx-3.5 border-t border-line";
    return d;
  }

  let heightAnim: Animation | null = null;
  function animateHeight(): void {
    const from = results.getBoundingClientRect().height; // current (may be mid-animation)
    results.style.height = "auto";
    results.style.overflow = "hidden";
    const to = results.offsetHeight; // target (capped by max-height)
    results.style.height = `${from}px`;
    void results.getBoundingClientRect();
    heightAnim?.cancel();
    const a = springHeight(results, from, to, LIST_SPRING);
    heightAnim = a;
    a.finished.then(
      () => {
        a.cancel();
        results.style.height = "auto";
        results.style.overflow = ""; // back to CSS overflow-y:auto
      },
      () => {}, // retargeted by the next keystroke
    );
  }

  function pick(fn: () => void): void {
    close();
    fn();
  }

  function render(): void {
    const { bursts, arcs, todos } = searchAll(input.value);
    results.innerHTML = "";
    items = [];
    const add = (el: HTMLElement, activate: () => void): void => {
      el.addEventListener("mousemove", () => {
        selected = items.findIndex((x) => x.el === el);
        highlight();
      });
      el.addEventListener("click", activate);
      results.appendChild(el);
      items.push({ el, activate });
    };
    for (const b of bursts) add(listRow("burst", b.name || "New Burst"), () => pick(() => h.onPickView({ type: "burst", id: b.id })));
    for (const a of arcs) add(listRow("arc", a.name || "New Arc"), () => pick(() => h.onPickView({ type: "arc", id: a.id })));
    if ((bursts.length || arcs.length) && todos.length) results.appendChild(divider());
    for (const t of todos) add(todoRow(t), () => pick(() => h.onPickTodo(t)));
    selected = items.length ? 0 : -1;
    highlight();
    animateHeight();
  }

  // Debounced so fast typing doesn't re-render + re-spring on every keystroke.
  let renderTimer = 0;
  input.addEventListener("input", () => {
    window.clearTimeout(renderTimer);
    renderTimer = window.setTimeout(render, 90);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && items.length) {
      e.preventDefault();
      selected = (selected + 1) % items.length;
      highlight();
    } else if (e.key === "ArrowUp" && items.length) {
      e.preventDefault();
      selected = (selected - 1 + items.length) % items.length;
      highlight();
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[selected]?.activate();
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  });

  // open: backdrop fades; panel uses the SAME DisclosureCard spring as the New popover.
  requestAnimationFrame(() => (backdrop.style.opacity = "1"));
  const openAnim = spring(
    panel,
    (t) => ({ opacity: String(clamp01(t)), transform: `translateY(${(1 - t) * 8}px) scale(${0.9 + t * 0.1})` }),
    DISCLOSURE_SPRING,
  );
  openAnim.finished.then(
    () => {
      panel.style.opacity = "1";
      panel.style.transform = "none";
      openAnim.cancel();
    },
    () => {},
  );
  window.setTimeout(() => input.focus(), 0);

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    isOpen = false;
    document.removeEventListener("keydown", onDocKey, true);
    panel.getAnimations().forEach((a) => a.cancel());
    backdrop.style.opacity = "0";
    panel
      .animate(
        [
          { opacity: 1, transform: "none" },
          { opacity: 0, transform: "translateY(4px) scale(0.97)" },
        ],
        { duration: 130, easing: "cubic-bezier(0.23, 1, 0.32, 1)", fill: "forwards" }, // ease-out, never ease-in
      )
      .finished.then(() => backdrop.remove(), () => backdrop.remove());
  }

  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });
  function onDocKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  }
  document.addEventListener("keydown", onDocKey, true);

  render(); // empty → height 0; typing grows it
}
