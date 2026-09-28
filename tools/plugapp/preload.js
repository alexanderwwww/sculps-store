/**
 * The only way the screen talks to the Mac.
 *
 * Context isolation is on and node is off in the renderer, so this is a short,
 * named list rather than a door. The screen can ask for a picture of the
 * desktop, ask where the window is, ask to change shape, and open a link in
 * his real browser. Nothing else.
 */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("plug", {
  desktop: () => ipcRenderer.invoke("desktop"),
  where: () => ipcRenderer.invoke("where"),
  shape: (next) => ipcRenderer.invoke("shape", next),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  onMoved: (fn) => ipcRenderer.on("moved", () => fn()),
  onShape: (fn) => ipcRenderer.on("shape", (_e, s) => fn(s)),
});
