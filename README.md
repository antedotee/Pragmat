# Pragmat

A fast, minimal macOS task app. Keyboard-first, Things-3-inspired, built with Tauri + vanilla TypeScript.

## Concepts

Every open to-do sits in one **lane** by when you'll do it, and can optionally be filed into a project or an area.

**Lanes**

- **Raws** — the inbox: open to-dos with no date, not yet filed anywhere.
- **Today** — what you're doing today (plus anything with an overdue deadline).
- **Future** — anything with a scheduled date or deadline, shown as a day-by-day agenda.
- **Whenever** — dateless "someday" to-dos you'll get to eventually.
- **Down the road** — further-off ideas you're not putting a date on yet.

**Collections**

- **Burst** — a finite, focused project you complete (`⌘B`). Carries a progress ring that fills as you check things off.
- **Arc** — an ongoing area of life that never "finishes" — health, reading, work (`⌘A`).

**Archive**

- **Logbook / Bin** — completed and trashed to-dos.

## Shortcuts

| Key | Action |
| --- | --- |
| `⌘N` | New to-do in the current view (works mid-edit) |
| `⌘B` | New burst |
| `⌘A` | New arc (while not editing text) |
| `⌘T` | Jump to Today |
| `⌘2` / `⌘3` / `⌘4` | Jump to Future / Whenever / Down the road |
| `⌘F` | Quick find |
| `⌘\` | Toggle the sidebar |
| `⌘Z` / `⌘⇧Z` | Undo / redo (outside text fields) |
| `Enter` | Save and start the next to-do |
| `Esc` | Stop editing |

## Develop

```bash
npm install
npm run tauri dev
```

## Stack

- **Tauri v2** — native macOS shell
- **Vanilla TypeScript + Vite** — no UI framework
- **SQLite** via `tauri-plugin-sql`
- **[oat](https://oat.ink)** base styling + inlined **Lucide** icons
- Translucent (vibrancy) sidebar, sliding selection indicator, staggered list animations
