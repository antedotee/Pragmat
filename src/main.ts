import "./styles/tailwind.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "./styles/theme.css";
import "./styles/app.css";

import { initDb, getSetting } from "./db";
import { loadAll } from "./state";
import { mount } from "./app";
import { applyTheme, savedThemeId } from "./themes";

async function boot(): Promise<void> {
  applyTheme(savedThemeId()); // fast first paint from localStorage (no flash)
  await initDb();
  // DB is the durable source of truth — restores the theme even if the webview
  // dropped localStorage between launches. Applied before mount, so no flash.
  const savedTheme = await getSetting("theme");
  if (savedTheme) applyTheme(savedTheme);
  await loadAll();
  mount(document.getElementById("app")!);
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:40px;color:#d2553f;font:13px ui-monospace,monospace;white-space:pre-wrap">Pragmat failed to start:\n\n${String(err)}</pre>`;
});
