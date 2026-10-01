const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("xugc", {
  get: () => ipcRenderer.invoke("state:get"),
  setSettings: (patch) => ipcRenderer.invoke("settings:set", patch),
  generate: (job) => ipcRenderer.invoke("generate", job),
  verdict: (id, v) => ipcRenderer.invoke("verdict", id, v),
  deleteTake: (id) => ipcRenderer.invoke("take:delete", id),
  addClips: () => ipcRenderer.invoke("dataset:add"),
  addClipPaths: (paths) => ipcRenderer.invoke("dataset:addPaths", paths),
  caption: (id, text) => ipcRenderer.invoke("dataset:caption", id, text),
  removeClip: (id) => ipcRenderer.invoke("dataset:remove", id),
  train: (opts) => ipcRenderer.invoke("train", opts),
  pickImages: () => ipcRenderer.invoke("pick:images"),
  onJob: (cb) => ipcRenderer.on("job", (_e, p) => cb(p)),
  onTrain: (cb) => ipcRenderer.on("train", (_e, p) => cb(p)),
});
