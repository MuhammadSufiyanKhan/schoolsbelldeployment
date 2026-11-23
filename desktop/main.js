// Schoolwell desktop: a native window around the Schoolwell web app. All data lives in the shared Supabase
// database, so desktop, mobile and web always show the same records.
const { app, BrowserWindow, Menu, shell, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

function appUrl() {
  // Priority: environment variable, then config.json next to the app, then the user's own config in the app data folder.
  const candidates = [process.env.SCHOOLWELL_URL];
  for (const f of [path.join(app.getPath("userData"), "config.json"), path.join(__dirname, "config.json")]) {
    try { candidates.push(JSON.parse(fs.readFileSync(f, "utf8")).url); } catch { /* missing or invalid: try the next one */ }
  }
  const raw = candidates.find((u) => typeof u === "string" && u.trim());
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && !(u.protocol === "http:" && ["localhost", "127.0.0.1"].includes(u.hostname))) throw new Error("only https (or http://localhost) is allowed");
    return u;
  } catch (e) {
    console.error("Invalid Schoolwell URL:", e.message);
    app.exit(1);
  }
}

let win;
const BASE = () => appUrl();

function createWindow() {
  const base = BASE();
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 900, minHeight: 600, title: "Schoolwell", icon: path.join(__dirname, "build", "icon.png"), show: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true },
  });
  win.once("ready-to-show", () => win.show());
  win.loadURL(base.href);

  const sameOrigin = (url) => { try { return new URL(url).origin === base.origin; } catch { return false; } };
  // Never let the app window wander off to other sites: external https links open in the real browser.
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https:/.test(url) && !sameOrigin(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!sameOrigin(url) && !url.startsWith("file://")) { e.preventDefault(); if (/^https:/.test(url)) shell.openExternal(url); } });
  win.webContents.on("did-fail-load", (_e, code, _d, url, isMainFrame) => {
    if (isMainFrame && code !== -3) win.loadFile(path.join(__dirname, "offline.html"), { search: "retry=" + encodeURIComponent(url) });   // -3 = aborted
  });
}

app.whenReady().then(() => {
  // The login session lives in a cookie, and Chromium writes cookies to disk only every ~30 seconds. Closing the app soon after signing in
  // (or after the hourly session refresh) therefore lost the session and asked for a login again. Write cookies out as soon as they change, and on exit.
  const ses = session.defaultSession;
  let pendingFlush;
  ses.cookies.on("changed", () => { clearTimeout(pendingFlush); pendingFlush = setTimeout(() => ses.cookies.flushStore().catch(() => {}), 150); });
  app.on("before-quit", () => { ses.cookies.flushStore().catch(() => {}); });
  // Only the camera/microphone (for face attendance and voice features) may be requested, and only by the Schoolwell origin.
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(permission === "media" && new URL(wc.getURL()).origin === BASE().origin));
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Schoolwell", submenu: [{ role: "reload" }, { role: "forceReload" }, { type: "separator" }, { role: "quit" }] },
    { label: "Edit", submenu: [{ role: "undo" }, { role: "redo" }, { type: "separator" }, { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }] },
    { label: "View", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
  ]));
  createWindow();
  app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

// One window at a time: opening the app again focuses the existing one.
if (!app.requestSingleInstanceLock()) app.quit();
app.on("second-instance", () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
