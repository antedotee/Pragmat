# Pragmat — landing site

Marketing site for [Pragmat](https://github.com/antedotee/Pragmat), built with
**Astro + Tailwind v4**. Pure static output, near-zero JS.

```bash
cd landing
npm install
npm run dev      # http://localhost:4321
npm run build    # → dist/
```

## Design

- **Palette** comes straight from `pragmat-icon.svg`: the blue→cyan momentum
  gradient (`#afd6ee → #48cde5`) and the peach sun (`#fe640b`), on a
  [Catppuccin Latte](https://catppuccin.com) neutral set. Tokens live in
  `src/styles/global.css` (`@theme`).
- **Type:** Cormorant Garamond (display) + system sans (body), matching the app.

## Components (`src/components/`)

Ports of the requested cult-ui / motion-primitives pieces, redone in pure
CSS / SVG / tiny vanilla JS — no React, no framer-motion:

| Component | What it is |
| --- | --- |
| `DitherHero` | Full-screen "color + soft" dither, an inline SVG scene + ordered-dither filter |
| `SquigglyArrow` | cult-ui squiggle-arrow — `variant`, `direction`, draws in on scroll |
| `TextEffect` | motion-primitives per-char fade |
| `TextLoop` | motion-primitives rotating words, 3D rotateX flip |
| `TextScramble` | motion-primitives decode-on-reveal |
| `ProgressiveBlur` | masked backdrop-filter ramp |

All scroll/loop/scramble behaviour runs from one `<script>` in
`src/layouts/Base.astro` and degrades gracefully under `prefers-reduced-motion`.

## Deploy

Static — host `dist/` anywhere (GitHub Pages, Vercel, Netlify). Update `site`
in `astro.config.mjs` for correct canonical/OG URLs.
