# Pragmat

A fast, minimal macOS task app. Keyboard-first, Things-3-inspired, built with Tauri + vanilla TypeScript.

## Concepts

- **Today / Future** — your two time buckets for open to-dos.
- **Burst** — a finite, focused project you complete (`⌘B`).
- **Arc** — an ongoing area of life that never "finishes" (`⌘A`).
- **Logbook / Bin** — completed and trashed to-dos.

## Shortcuts

| Key | Action |
| --- | --- |
| `⌘N` | New to-do in the current view (works mid-edit) |
| `⌘B` | New burst |
| `⌘A` | New arc (while not editing text) |
| `⌘1` / `⌘2` | Jump to Today / Future |
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
