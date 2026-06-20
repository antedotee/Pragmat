import "./vendor/oat.min.css";
import "./vendor/oat.min.js";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/cormorant-garamond/600.css";
import "./styles/theme.css";
import "./styles/app.css";

import { initDb } from "./db";
import { loadAll } from "./state";
import { mount } from "./app";
import { applyTheme, savedThemeId } from "./themes";

async function boot(): Promise<void> {
  applyTheme(savedThemeId());
  await initDb();
  await loadAll();
  mount(document.getElementById("app")!);
}

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<pre style="padding:40px;color:#d2553f;font:13px ui-monospace,monospace;white-space:pre-wrap">Pragmat failed to start:\n\n${String(err)}</pre>`;
});
