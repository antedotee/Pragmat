import {
  type Task,
  type Checkpoint,
  setTaskTitle,
  setTaskNotes,
  setTaskStatus,
  setTaskSchedule,
  setTaskDueDate,
  setTaskDeadline,
  setTaskTags,
  getCheckpoints,
  addCheckpoint,
  toggleCheckpoint,
  setCheckpointTitle,
  setCheckpointOrder,
  setCheckpointCount,
  deleteCheckpoint,
  checkpointSortBetween,
} from "../state";
import { icon } from "../icons";
import { springHeight, staggerReveal, autosizeHeight, revealRow, collapseRow, spring, clamp01 } from "./anim";
import { DISCLOSURE_SPRING } from "../spring";
import { fromISODate, formatChip, deadlineLabel } from "../date";
import { openDatePopover } from "./date-popover";
import { enableDragReorder } from "./drag-reorder";
import { CP_LIST, CP_ROW, CP_TOGGLE, CP_TOGGLE_ICON, CP_TITLE, CP_DEL, CP_HANDLE } from "./cls";

export interface CardHandlers {
  onClose: () => void; // re-render board to reflect edits
  onNew: () => void; // ⌘N
  onTrash: (t: Task) => void | Promise<void>;
  onRestore: (t: Task) => void | Promise<void>;
  onDelete: (t: Task) => void | Promise<void>;
}

interface OpenCard {
  li: HTMLLIElement;
  collapse: () => void;
}

let openCard: OpenCard | null = null;

export function closeTodoCard(): void {
  openCard?.collapse();
}

export function isCardOpen(): boolean {
  return openCard !== null;
}

export function openTodoCard(li: HTMLLIElement, task: Task, h: CardHandlers, caret?: number): void {
  if (openCard && openCard.li === li) return;
  closeTodoCard();

  const list = li.parentElement as HTMLElement; // #task-list
  const board = list.parentElement as HTMLElement; // #board (positioned)
  const collapsedH = li.offsetHeight;

  // The card floats ABOVE the list as an overlay — the row stays put underneath
  // and nothing else moves. We build into this element, not the <li>.
  const card = document.createElement("div");
  card.className = "task expanded card-overlay" + (task.status === "done" ? " is-done" : "");

  // --- top row: checkbox + title ---
  const top = document.createElement("div");
  top.className = "card-top";

  const check = document.createElement("button");
  check.type = "button";
  check.className = "checkbox" + (task.status === "done" ? " checked" : "");
  check.innerHTML = icon("check", 12);
  check.addEventListener("click", async (e) => {
    e.stopPropagation();
    const next = task.status === "done" ? "open" : "done";
    await setTaskStatus(task.id, next);
    task.status = next;
    check.classList.toggle("checked", next === "done");
    card.classList.toggle("is-done", next === "done");
  });

  // A textarea (not an input) so a long title wraps and shows in full when open.
  const title = document.createElement("textarea");
  title.className = "card-title";
  title.value = task.title;
  title.placeholder = "New to-do";
  title.rows = 1;
  title.spellcheck = false;
  const sizeTitle = (): void => autosizeHeight(title);
  title.addEventListener("input", () => {
    sizeTitle();
    void setTaskTitle(task.id, title.value.trim());
  });
  // Titles are single-line semantically: Enter commits + closes (no newline). ⌘N closes + opens next.
  title.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      collapse();
    }
  });
  top.append(check, title);

  // --- detail ---
  const detail = document.createElement("div");
  detail.className = "card-detail";

  const notes = document.createElement("textarea");
  notes.className = "card-notes";
  notes.value = task.notes;
  notes.placeholder = "Notes";
  notes.rows = 1;
  notes.spellcheck = false;
  const autosize = () => autosizeHeight(notes);
  notes.addEventListener("input", () => {
    autosize();
    void setTaskNotes(task.id, notes.value);
  });
  notes.addEventListener("keydown", (e) => e.stopPropagation());

  // tags
  const tagsWrap = document.createElement("div");
  tagsWrap.className = "card-tags";
  const tagInput = document.createElement("input");
  tagInput.className = "tag-input";
  tagInput.placeholder = "Add tag…";
  tagInput.spellcheck = false;
  function renderTags(): void {
    tagsWrap.querySelectorAll(".chip-tag").forEach((c) => c.remove());
    for (const tag of task.tags) {
      const chip = document.createElement("span");
      chip.className = "chip chip-tag";
      chip.innerHTML = `<span>${tag}</span>`;
      const rm = document.createElement("button");
      rm.type = "button";
      rm.className = "chip-x";
      rm.innerHTML = icon("x", 11);
      rm.addEventListener("click", async () => {
        task.tags = task.tags.filter((t) => t !== tag);
        await setTaskTags(task.id, task.tags);
        renderTags();
      });
      chip.appendChild(rm);
      tagsWrap.insertBefore(chip, tagInput);
    }
  }
  tagInput.addEventListener("keydown", async (e) => {
    e.stopPropagation();
    if (e.key === "Enter" && tagInput.value.trim()) {
      task.tags.push(tagInput.value.trim());
      await setTaskTags(task.id, task.tags);
      tagInput.value = "";
      renderTags();
    } else if (e.key === "Backspace" && !tagInput.value && task.tags.length) {
      task.tags.pop();
      await setTaskTags(task.id, task.tags);
      renderTags();
    }
  });
  tagsWrap.append(tagInput);
  renderTags();

  // checklist. The loaded checkpoints are held here so drag-reorder can read
  // neighbour sort_orders and delete can keep the list in step.
  let cps: Checkpoint[] = [];
  const cpList = document.createElement("div");
  cpList.className = CP_LIST;
  const removeCheckpoint = (cp: Checkpoint, row: HTMLElement): void => {
    cps = cps.filter((c) => c.id !== cp.id);
    void deleteCheckpoint(cp.id);
    collapseRow(row, () => row.remove()); // smooth removal, not a hard cut
  };
  function checkpointRow(cp: Checkpoint): HTMLElement {
    const row = document.createElement("div");
    row.className = CP_ROW;
    row.dataset.cp = ""; // drag-reorder + canStart hook
    row.dataset.id = String(cp.id); // drag-reorder keys off this
    if (cp.done) row.dataset.done = ""; // styled via group-data-[done]:
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = CP_TOGGLE;
    toggle.innerHTML = icon("check", 11, CP_TOGGLE_ICON);
    toggle.addEventListener("click", async () => {
      cp.done = !cp.done;
      row.toggleAttribute("data-done", cp.done);
      await toggleCheckpoint(cp.id, cp.done);
    });
    const input = document.createElement("input");
    input.className = CP_TITLE;
    input.dataset.cpTitle = ""; // drag canStart + caret-hop hook
    input.value = cp.title;
    input.placeholder = "Checklist item";
    input.spellcheck = false;
    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        e.preventDefault();
        void setCheckpointTitle(cp.id, input.value.trim());
        void newCheckpoint();
      } else if (e.key === "Backspace" && input.value === "") {
        e.preventDefault();
        // delete the empty checkpoint and hop the caret to the end of the previous one
        const prev = row.previousElementSibling?.querySelector<HTMLInputElement>("[data-cp-title]") ?? null;
        removeCheckpoint(cp, row);
        if (prev) {
          prev.focus();
          prev.setSelectionRange(prev.value.length, prev.value.length);
        }
      }
    });
    input.addEventListener("blur", () => void setCheckpointTitle(cp.id, input.value.trim()));
    const handle = document.createElement("span");
    handle.className = CP_HANDLE;
    handle.dataset.cpHandle = ""; // the ONLY drag-start hook
    handle.setAttribute("aria-label", "Drag to reorder");
    handle.title = "Drag to reorder";
    handle.innerHTML = icon("grip", 13);
    const del = document.createElement("button");
    del.type = "button";
    del.className = CP_DEL;
    del.innerHTML = icon("x", 12);
    del.addEventListener("click", () => removeCheckpoint(cp, row));
    row.append(toggle, input, handle, del);
    return row;
  }
  async function newCheckpoint(): Promise<void> {
    const cp = await addCheckpoint(task.id);
    cps.push(cp);
    const row = checkpointRow(cp);
    cpList.appendChild(row);
    revealRow(row); // springs height 0→auto with a blur-fade-in
    row.querySelector<HTMLInputElement>("[data-cp-title]")?.focus();
  }
  void getCheckpoints(task.id).then((loaded) => {
    cps = loaded;
    for (const cp of cps) cpList.appendChild(checkpointRow(cp));
  });
  // Drag a checkpoint up/down to reorder. Reuses the list drag engine (FLIP +
  // spring settle); dropping lands a fractional sort_order between neighbours.
  enableDragReorder(cpList, {
    canDrag: () => true,
    rowSelector: "[data-cp]",
    clampToList: true,
    settleSpring: { stiffness: 950, damping: 48, mass: 0.6 }, // snappier FLIP for the tight checklist (~250ms, Emil <300ms)
    // Reorder ONLY by grabbing the grip handle — leaves the title input fully
    // free for editing (text select, ⌘C/⌘X/⌘A all work normally).
    canStart: (t) => !!t.closest("[data-cp-handle]"),
    onDrop: (id, prevId, nextId) => {
      const sortOf = (cid: number | null) =>
        cid == null ? null : cps.find((c) => c.id === cid)?.sort_order ?? null;
      const newSort = checkpointSortBetween(sortOf(prevId), sortOf(nextId));
      const moved = cps.find((c) => c.id === id);
      if (moved) moved.sort_order = newSort;
      cps.sort((a, b) => a.sort_order - b.sort_order || a.id - b.id);
      void setCheckpointOrder(id, newSort);
    },
  });

  // The lane shows as a removable chip in the tags row. Only the dateless lanes
  // (today/whenever/downtheroad) get a chip here — "future" is represented by the
  // date chip instead, and "raw" (unscheduled) shows nothing. The × clears back to
  // raw. ⌘T sets Today; a date sets Future. Lanes are mutually exclusive.
  const WHEN_META = {
    today: { ic: "today", label: "Today" },
    whenever: { ic: "whenever", label: "Whenever" },
    downtheroad: { ic: "downtheroad", label: "Down the road" },
  } as const;
  function renderWhen(): void {
    tagsWrap.querySelector(".chip-when")?.remove();
    const meta = WHEN_META[task.schedule as keyof typeof WHEN_META];
    if (!meta) return; // raw → no chip; future → shown as the date chip
    const chip = document.createElement("span");
    chip.className = "chip chip-when" + (task.schedule === "today" ? " is-today" : "");
    chip.innerHTML = `<span class="when-ic">${icon(meta.ic, 12)}</span><span>${meta.label}</span>`;
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "chip-x";
    rm.innerHTML = icon("x", 11);
    rm.addEventListener("click", async (e) => {
      e.stopPropagation();
      await setTaskSchedule(task.id, "raw");
      task.schedule = "raw";
      renderWhen();
    });
    chip.appendChild(rm);
    tagsWrap.insertBefore(chip, tagsWrap.firstChild); // sits ahead of the tags
  }
  renderWhen();

  // The date IS the Future lane. Setting a date moves the to-do to Future (out of
  // today/whenever/…); clearing it drops back to raw — setTaskDueDate handles the
  // schedule flip, so we re-render both chips. The × clears; the chip body re-opens
  // the picker. Set via the calendar meta-icon below.
  const onDate = async (iso: string | null): Promise<void> => {
    await setTaskDueDate(task.id, iso); // also flips schedule (future ⟺ dated)
    task.due_date = iso;
    renderDue(true);
    renderWhen(); // a Today chip (etc.) must drop once this is Future
  };
  function renderDue(animate = false): void {
    tagsWrap.querySelector(".chip-due")?.remove();
    if (!task.due_date) return;
    const chip = document.createElement("span");
    chip.className = "chip chip-due";
    chip.innerHTML = `<span class="when-ic">${icon("calendar", 12)}</span><span>${formatChip(fromISODate(task.due_date))}</span>`;
    chip.addEventListener("click", () => openDatePopover(chip, task.due_date, onDate));
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "chip-x";
    rm.innerHTML = icon("x", 11);
    rm.addEventListener("click", (e) => {
      e.stopPropagation(); // don't also re-open via the chip body
      void onDate(null);
    });
    chip.appendChild(rm);
    tagsWrap.insertBefore(chip, tagsWrap.querySelector(".chip-tag") ?? tagInput); // after the when chip, ahead of tags
    if (animate) {
      spring(chip, (t) => ({ opacity: String(clamp01(t)), transform: `scale(${0.9 + 0.1 * clamp01(t)})` }), DISCLOSURE_SPRING);
    }
  }
  renderDue();

  // The deadline shows as a removable chip (flag + date + countdown), red once
  // overdue. Orthogonal to schedule/date — setting it doesn't move the to-do.
  const onDeadline = async (iso: string | null): Promise<void> => {
    await setTaskDeadline(task.id, iso);
    task.deadline = iso;
    renderDeadline(true);
  };
  function renderDeadline(animate = false): void {
    tagsWrap.querySelector(".chip-deadline")?.remove();
    if (!task.deadline) return;
    const { text, overdue } = deadlineLabel(fromISODate(task.deadline), new Date());
    const chip = document.createElement("span");
    chip.className = "chip chip-deadline" + (overdue ? " is-overdue" : "");
    chip.innerHTML =
      `<span class="when-ic">${icon("flag", 12)}</span>` +
      `<span>Deadline: ${formatChip(fromISODate(task.deadline))}</span>` +
      `<span class="chip-sub">· ${text}</span>`;
    chip.addEventListener("click", () => openDatePopover(chip, task.deadline, onDeadline));
    const rm = document.createElement("button");
    rm.type = "button";
    rm.className = "chip-x";
    rm.innerHTML = icon("x", 11);
    rm.addEventListener("click", (e) => {
      e.stopPropagation();
      void onDeadline(null);
    });
    chip.appendChild(rm);
    tagsWrap.insertBefore(chip, tagsWrap.querySelector(".chip-tag") ?? tagInput); // after when/due chips, ahead of tags
    if (animate) {
      spring(chip, (t) => ({ opacity: String(clamp01(t)), transform: `scale(${0.9 + 0.1 * clamp01(t)})` }), DISCLOSURE_SPRING);
    }
  }
  renderDeadline();

  // meta row: tag/checklist/trash actions
  const meta = document.createElement("div");
  meta.className = "card-meta";
  const actions = document.createElement("div");
  actions.className = "card-meta-actions";
  const tagAction = metaIcon("tag", "Add tag");
  tagAction.addEventListener("click", () => tagInput.focus());
  const cpAction = metaIcon("checklist", "Add checklist item");
  cpAction.addEventListener("click", () => void newCheckpoint());
  const dateAction = metaIcon("calendar", "Set date");
  dateAction.addEventListener("click", () => openDatePopover(dateAction, task.due_date, onDate));
  const deadlineAction = metaIcon("flag", "Set deadline");
  deadlineAction.addEventListener("click", () => openDatePopover(deadlineAction, task.deadline, onDeadline));
  actions.append(tagAction, cpAction, dateAction, deadlineAction);

  if (task.status === "trashed") {
    const restore = metaIcon("restore", "Restore");
    restore.addEventListener("click", async () => {
      await h.onRestore(task);
      collapse();
    });
    const del = metaIcon("x", "Delete forever");
    del.classList.add("danger");
    del.addEventListener("click", async () => {
      await h.onDelete(task);
      collapse();
    });
    actions.append(restore, del);
  } else {
    const trash = metaIcon("bin", "Delete");
    trash.classList.add("danger");
    trash.addEventListener("click", async () => {
      await h.onTrash(task);
      collapse();
    });
    actions.append(trash);
  }
  meta.append(actions);

  detail.append(notes, tagsWrap, cpList, meta);
  card.append(top, detail);

  // Position the overlay exactly over the row (relative to #board, so the list's
  // overflow doesn't clip it), then mount it.
  const lr = li.getBoundingClientRect();
  const br = board.getBoundingClientRect();
  card.style.top = `${lr.top - br.top}px`;
  card.style.left = `${lr.left - br.left}px`;
  card.style.width = `${lr.width}px`;
  card.style.height = `${collapsedH}px`;
  card.style.overflow = "hidden";
  board.appendChild(card);

  // --- expand: spring the height, then stagger-reveal the detail blocks ---
  // Sprung via ./anim — the card grows to a measured height (CSS can't spring to auto).
  const blocks = [notes, tagsWrap, cpList, meta] as HTMLElement[];
  let growAnim: Animation | null = null;
  let revealAnims: Animation[] = [];

  void card.getBoundingClientRect();
  requestAnimationFrame(() => {
    sizeTitle(); // wrap + size a long title
    autosize(); // size the notes to its content first
    // Measure the TRUE expanded height (what height:auto renders) so the grow
    // lands exactly there — no sub-pixel snap when we hand back to auto.
    card.style.height = "auto";
    const target = card.offsetHeight;
    card.style.height = `${collapsedH}px`;
    for (const el of blocks) el.style.opacity = "0"; // hidden while the card grows
    const grow = springHeight(card, collapsedH, target);
    growAnim = grow;
    grow.finished.then(
      () => {
        grow.cancel(); // stop fill:forwards pinning the height; allow auto reflow
        card.style.height = "auto";
        card.style.overflow = "visible";
        revealAnims = staggerReveal(blocks);
      },
      () => {}, // cancelled by an early collapse
    );
  });

  window.setTimeout(() => {
    title.focus({ preventScroll: true }); // don't scroll-jump the list when the card opens
    if (!task.title) {
      title.select();
    } else if (caret != null) {
      const p = Math.min(caret, title.value.length); // land the caret where you clicked
      title.setSelectionRange(p, p);
    }
  }, 60);

  // --- shortcuts + dismiss ---
  function onKey(e: KeyboardEvent): void {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      collapse();
      return;
    }
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    // (⌘C intentionally NOT bound — it must stay copy. Add checkpoints via the
    // checklist icon or Enter on a checkpoint.)
    if (k === "t") {
      e.preventDefault();
      e.stopPropagation();
      if (task.schedule !== "today") {
        task.schedule = "today"; // optimistic; clear with the chip's ×
        task.due_date = null; // Today and Future(date) are mutually exclusive
        renderWhen();
        renderDue(); // drop the date chip if it had one
        void setTaskSchedule(task.id, "today"); // also clears due_date in the DB
      }
    } else if (k === "l") {
      e.preventDefault();
      e.stopPropagation();
      tagInput.focus();
    } else if (k === "n") {
      e.preventDefault();
      e.stopPropagation();
      collapse();
      h.onNew();
    }
  }
  function onDocMouseDown(e: MouseEvent): void {
    const t = e.target as HTMLElement;
    // the date popover mounts in <body>, not in the card — treat it as inside
    if (!card.contains(t) && !t.closest?.(".date-popover")) collapse();
  }
  document.addEventListener("keydown", onKey, true);
  // defer outside-click registration so the opening click doesn't immediately close it
  window.setTimeout(() => document.addEventListener("mousedown", onDocMouseDown, true), 0);

  let collapsed = false;
  function collapse(): void {
    if (collapsed) return;
    collapsed = true;
    openCard = null;
    document.removeEventListener("keydown", onKey, true);
    document.removeEventListener("mousedown", onDocMouseDown, true);
    growAnim?.cancel();
    revealAnims.forEach((a) => a.cancel());
    // Row glyph reflects non-empty checkpoints only — recompute from the live
    // inputs before the row underneath re-renders.
    const filled = [...cpList.querySelectorAll<HTMLInputElement>("[data-cp-title]")].filter(
      (i) => i.value.trim() !== "",
    ).length;
    setCheckpointCount(task.id, filled);
    const cur = card.offsetHeight;
    card.style.overflow = "hidden";
    // shrink the overlay back into the row, then update the row + drop the overlay
    springHeight(card, cur, collapsedH).finished.then(
      () => {
        h.onClose(); // closeTodoRow: refresh/remove the row underneath
        card.remove();
      },
      () => card.remove(),
    );
  }

  openCard = { li, collapse };
}

function metaIcon(name: Parameters<typeof icon>[0], label: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "meta-ic";
  b.setAttribute("aria-label", label);
  b.title = label;
  b.innerHTML = icon(name, 15);
  return b;
}
