import { icon } from "../icons";
import {
  parseDate, toISODate, fromISODate, formatChip,
  addDays, addMonths, startOfMonth, endOfMonth, sameDay, sameMonth, atMidnight,
} from "../date";

// The card's date picker: type a date (live-parsed), tap a quick pick, or click
// the mini month grid. Mirrors new-popover.ts (single active, Esc/outside-click
// close, DISCLOSURE_SPRING open) with one twist — it lives over an open card, so
// its Escape handler runs on `window` capture to fire BEFORE the card's
// document-capture handler (which would otherwise collapse the card).

let activeClose: (() => void) | null = null;

const WD = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const col = (d: Date): number => (d.getDay() + 6) % 7; // Monday-first column 0..6

export function openDatePopover(
  anchor: HTMLElement,
  current: string | null,
  onPick: (iso: string | null) => void,
): void {
  if (activeClose) { activeClose(); return; } // toggle off

  const today = atMidnight(new Date());
  let selected = current ? fromISODate(current) : null;
  let displayed = startOfMonth(selected ?? today);
  let preview: Date | null = null; // live-parsed-but-uncommitted day, for grid highlight

  const pop = document.createElement("div");
  pop.className = "date-popover";
  pop.style.transition = "none";
  pop.innerHTML = `
    <div class="dp-type">
      <span class="dp-type-ic">${icon("calendar", 14)}</span>
      <input class="dp-input" type="text" placeholder="Type a date…" spellcheck="false" autocomplete="off" />
      <span class="dp-preview"></span>
    </div>
    <div class="dp-quick">
      <button type="button" data-q="today">Today</button>
      <button type="button" data-q="tomorrow">Tomorrow</button>
      <button type="button" class="dp-clear" data-q="clear">Clear</button>
    </div>
    <div class="dp-cal">
      <div class="dp-cal-head">
        <span class="dp-month"></span>
        <span class="dp-nav">
          <button type="button" class="dp-prev" aria-label="Previous month">&lsaquo;</button>
          <button type="button" class="dp-next" aria-label="Next month">&rsaquo;</button>
        </span>
      </div>
      <div class="dp-grid"></div>
    </div>`;
  document.body.appendChild(pop);

  const input = pop.querySelector<HTMLInputElement>(".dp-input")!;
  const previewEl = pop.querySelector<HTMLElement>(".dp-preview")!;
  const monthEl = pop.querySelector<HTMLElement>(".dp-month")!;
  const grid = pop.querySelector<HTMLElement>(".dp-grid")!;

  function renderGrid(): void {
    monthEl.textContent = displayed.toLocaleDateString(undefined, { month: "long", year: "numeric" });
    const first = startOfMonth(displayed);
    const last = endOfMonth(displayed);
    let html = WD.map((w) => `<span class="dp-wd">${w}</span>`).join("");
    for (let i = 0; i < col(first); i++) html += `<span class="dp-cell dp-blank"></span>`;
    for (let day = 1; day <= last.getDate(); day++) {
      const d = new Date(displayed.getFullYear(), displayed.getMonth(), day);
      const cls = [
        "dp-cell",
        sameDay(d, today) ? "dp-today" : "",
        selected && sameDay(d, selected) ? "dp-sel" : "",
        preview && sameDay(d, preview) ? "dp-prev-day" : "",
      ].filter(Boolean).join(" ");
      html += `<button type="button" class="${cls}" data-iso="${toISODate(d)}">${day}</button>`;
    }
    grid.innerHTML = html;
  }
  renderGrid();

  const commit = (d: Date): void => { onPick(toISODate(d)); close(); };

  // --- typing ---
  input.addEventListener("input", () => {
    const d = parseDate(input.value);
    preview = d;
    if (d) {
      previewEl.textContent = formatChip(d);
      if (!sameMonth(d, displayed)) displayed = startOfMonth(d);
    } else {
      previewEl.textContent = "";
    }
    renderGrid();
  });

  // --- clicks: quick picks, nav, grid days ---
  pop.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const cell = t.closest<HTMLElement>(".dp-cell[data-iso]");
    if (cell) { commit(fromISODate(cell.dataset.iso!)); return; }
    if (t.closest(".dp-prev")) { displayed = addMonths(displayed, -1); renderGrid(); return; }
    if (t.closest(".dp-next")) { displayed = addMonths(displayed, 1); renderGrid(); return; }
    const q = t.closest<HTMLElement>("[data-q]")?.dataset.q;
    if (q === "today") commit(today);
    else if (q === "tomorrow") commit(addDays(today, 1));
    else if (q === "clear") { onPick(null); close(); }
  });

  // --- placement: prefer below the anchor, flip above if it won't fit ---
  const a = anchor.getBoundingClientRect();
  const r = pop.getBoundingClientRect();
  const below = a.bottom + r.height + 8 <= window.innerHeight;
  const top = below ? a.bottom + 6 : a.top - r.height - 6;
  const left = Math.min(Math.max(8, a.left), window.innerWidth - r.width - 8);
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;

  // Open via the CSS `.open` transition (NOT WAAPI) so it plays under OS Reduce
  // Motion, which WebKit applies to Web Animations. Resting state is translate +
  // opacity only (no scale), so the getBoundingClientRect above stayed true-size.
  void pop.offsetWidth; // commit the resting state before flipping to .open
  pop.classList.add("open");

  let closed = false;
  function close(): void {
    if (closed) return;
    closed = true;
    activeClose = null;
    window.removeEventListener("keydown", onKey, true);
    document.removeEventListener("mousedown", onOut, true);
    pop.classList.remove("open");
    pop.classList.add("closing");
    pop.addEventListener("transitionend", () => pop.remove(), { once: true });
    window.setTimeout(() => pop.remove(), 250); // fallback if transitionend doesn't fire
  }

  function onOut(e: MouseEvent): void {
    const t = e.target as Node;
    if (!pop.contains(t) && t !== anchor && !anchor.contains(t)) close();
  }
  // On window-capture so Escape beats the card's document-capture collapse.
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      close();
    } else if (e.key === "Enter") {
      const d = parseDate(input.value);
      if (d) { e.preventDefault(); e.stopImmediatePropagation(); commit(d); }
    }
  }

  activeClose = close;
  input.focus();
  window.setTimeout(() => {
    window.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onOut, true);
  }, 0);
}
