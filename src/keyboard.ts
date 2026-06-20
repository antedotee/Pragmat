import type { View } from "./state";

export interface Shortcuts {
  newTask: () => void;
  newBurst: () => void;
  newArc: () => void;
  go: (view: View) => void;
  toggleSidebar: () => void;
  deleteSelected: () => boolean; // returns true if a selected row was deleted
  undo: () => void;
  redo: () => void;
  search: () => void;
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || el.isContentEditable;
}

export function registerShortcuts(h: Shortcuts): void {
  window.addEventListener("keydown", (e) => {
    // Delete / Backspace removes the focused (selected) row — but never while
    // editing text, where those keys belong to the field.
    if ((e.key === "Backspace" || e.key === "Delete") && !isEditable(e.target)) {
      if (h.deleteSelected()) {
        e.preventDefault();
        return;
      }
    }

    // macOS app: ⌘ is the shortcut modifier. ⌃ must stay free (e.g. ⌃A = line
    // start in text fields, and shouldn't create an Arc).
    if (!e.metaKey || e.ctrlKey) return;
    const key = e.key.toLowerCase();
    const editable = isEditable(e.target);

    if (key === "z" && !editable) {
      // ⌘Z undo / ⌘⇧Z redo — only outside text fields, so native text undo
      // still works while editing a title/notes.
      e.preventDefault();
      if (e.shiftKey) h.redo();
      else h.undo();
    } else if (key === "n") {
      // New to-do — works everywhere, even mid-edit.
      e.preventDefault();
      h.newTask();
    } else if (key === "f") {
      // Quick Find — works everywhere; preventDefault so the webview's native find doesn't fire.
      e.preventDefault();
      h.search();
    } else if (key === "\\") {
      // Toggle sidebar — works everywhere, even mid-edit.
      e.preventDefault();
      h.toggleSidebar();
    } else if (key === "b" && !editable) {
      e.preventDefault();
      h.newBurst();
    } else if (key === "a" && !editable) {
      // ⌘A stays "select all" while editing text; otherwise it makes an Arc.
      e.preventDefault();
      h.newArc();
    } else if (key === "1") {
      e.preventDefault();
      h.go({ type: "today" });
    } else if (key === "2") {
      e.preventDefault();
      h.go({ type: "future" });
    } else if (key === "3") {
      e.preventDefault();
      h.go({ type: "whenever" });
    } else if (key === "4") {
      e.preventDefault();
      h.go({ type: "downtheroad" });
    }
  });
}
