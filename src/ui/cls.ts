// Shared Tailwind class clusters. One source of truth per reused atom, so a
// utility rewrite in vanilla TS doesn't rot into copy-pasted 12-class strings.
// Genuine one-offs stay inline at the call site.
//
// Conventions:
//   • JS finds/toggles elements by `data-*` attributes, NOT these classes —
//     styling and hooks are decoupled. State lives in `data-*` flags and is
//     styled with Tailwind `group-data-[…]:` / `data-[…]:` variants.
//   • Colours/radii/easings come from the @theme token bridge (tailwind.css):
//     bg/sidebar/surface/hover/sel, text/dim/faint, line/check,
//     accent/accent-press/on-accent, rounded-row/-card, ease-out, …
//   • Animated icon reveals use arbitrary [transform:…]/[filter:…]/[transition:…]
//     (not scale-*/blur-*) so the transitions target the same properties the
//     spring/CSS did — guarantees pixel-identical motion.

// — checklist (checkpoints) ————————————————————————————————————————————————
export const CP_LIST = "flex flex-col gap-px mt-1 mb-0.5";

// `group` so the toggle/title/× can react to the row's hover + data-done state.
// `.dragging` (added by the drag engine) lifts the grabbed row above its
// siblings — without z-index it slides BEHIND them and the reorder looks dead.
export const CP_ROW =
  "group flex items-center gap-2.5 px-1 py-0.5 rounded-[7px] hover:bg-hover " +
  "[&.dragging]:relative [&.dragging]:z-10 [&.dragging]:bg-surface [&.dragging]:cursor-grabbing " +
  "[&.dragging]:shadow-[0_6px_20px_rgba(0,0,0,0.14)]";

export const CP_TOGGLE =
  "flex-none w-4 h-4 p-0 box-border grid place-items-center rounded-full bg-transparent " +
  "border-[1.5px] border-check [-webkit-app-region:no-drag] " +
  "[transition:border-color_100ms_var(--ease-out),background_110ms_var(--ease-out),transform_100ms_var(--ease-out)] " +
  "hover:border-accent active:[transform:scale(0.94)] " +
  "group-data-[done]:bg-accent group-data-[done]:border-accent";

export const CP_TOGGLE_ICON =
  "w-[11px] h-[11px] text-on-accent opacity-0 [transform:scale(0.25)] [filter:blur(4px)] " +
  "[transition:opacity_110ms_var(--ease-out),transform_150ms_var(--ease-out),filter_110ms_var(--ease-out)] " +
  "group-data-[done]:opacity-100 group-data-[done]:[transform:scale(1)] group-data-[done]:[filter:blur(0)]";

export const CP_TITLE =
  "flex-1 min-w-0 m-0 bg-transparent outline-none text-[14px] text-text placeholder:text-faint " +
  "group-data-[done]:text-faint group-data-[done]:opacity-60";

export const CP_DEL =
  "flex-none grid place-items-center w-6 h-6 rounded-md bg-transparent text-faint opacity-40 " +
  "[-webkit-app-region:no-drag] " +
  "[transition:opacity_120ms_var(--ease-out),color_120ms_var(--ease-out),background_120ms_var(--ease-out)] " +
  "group-hover:opacity-100 hover:bg-hover hover:text-accent";

// drag handle (grip) — the ONLY grab point for reordering a checkpoint. Grab
// cursor; select-none/touch-none so a drag never selects text or scrolls.
export const CP_HANDLE =
  "flex-none grid place-items-center w-6 h-6 rounded-md bg-transparent text-faint opacity-40 " +
  "cursor-grab active:cursor-grabbing select-none touch-none [-webkit-app-region:no-drag] " +
  "[transition:opacity_120ms_var(--ease-out),color_120ms_var(--ease-out),background_120ms_var(--ease-out)] " +
  "group-hover:opacity-100 hover:bg-hover hover:text-accent";

// faint glyph on a collapsed row signalling it carries checkpoints
export const TASK_CP_FLAG = "flex-none grid place-items-center text-faint";
