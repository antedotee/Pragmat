export interface ModalOptions {
  originRect?: DOMRect; // expand-from-origin (todo rows)
  className?: string;
  onClose?: () => void;
}

export interface ModalHandle {
  close: () => void;
  panel: HTMLElement;
  body: HTMLElement;
}

// FLIP the panel from a source rect to its natural position — reads as the
// row's edges lengthening into the modal. Content fades in to hide the stretch.
function flipFrom(panel: HTMLElement, rect: DOMRect): void {
  // measure the natural (untransformed) target first
  panel.style.transition = "none";
  panel.style.transform = "none";
  const target = panel.getBoundingClientRect();
  const dx = rect.left - target.left;
  const dy = rect.top - target.top;
  const sx = Math.max(rect.width / target.width, 0.05);
  const sy = Math.max(rect.height / target.height, 0.05);
  panel.style.transformOrigin = "top left";
  panel.style.transform = `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`;
  panel.getBoundingClientRect(); // reflow
  panel.style.transition = "transform 200ms var(--ease-out)";
  panel.style.transform = "none";
}

export function openModal(content: HTMLElement, opts: ModalOptions = {}): ModalHandle {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";

  const panel = document.createElement("div");
  panel.className = "modal-panel" + (opts.className ? ` ${opts.className}` : "");

  const body = document.createElement("div");
  body.className = "modal-body";
  body.appendChild(content);
  panel.appendChild(body);
  backdrop.appendChild(panel);
  document.body.appendChild(backdrop);

  requestAnimationFrame(() => {
    backdrop.classList.add("open");
    if (opts.originRect) flipFrom(panel, opts.originRect);
  });

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    document.removeEventListener("keydown", onKey, true);
    backdrop.classList.remove("open");
    backdrop.classList.add("closing");
    const done = () => {
      backdrop.remove();
      opts.onClose?.();
    };
    backdrop.addEventListener("transitionend", (e) => {
      if (e.target === backdrop) done();
    }, { once: true });
    window.setTimeout(done, 240);
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }
  document.addEventListener("keydown", onKey, true);
  backdrop.addEventListener("mousedown", (e) => {
    if (e.target === backdrop) close();
  });

  return { close, panel, body };
}
