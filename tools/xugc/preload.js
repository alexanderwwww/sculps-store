const { contextBridge, ipcRenderer } = require("electron");
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld("xugc", {
  get: call("state:get"), estimate: call("estimate"), setSettings: call("settings:set"),
  setKey: call("key:set"), testKey: call("key:test"), setHf: call("hf:set"), sweep: call("pods:sweep"),
  fetchProduct: call("product:fetch"), clearProduct: call("product:clear"),
  generate: call("generate"), cancel: call("cancel"),
  styleToggle: call("style:toggle"), styleRead: call("style:read"), styleWrite: call("style:write"), styleDelete: call("style:delete"), styleAdd: call("style:add"),
  verdict: call("verdict"), deleteTake: call("take:delete"),
  addClips: call("dataset:add"), addClipPaths: call("dataset:addPaths"), caption: call("dataset:caption"), removeClip: call("dataset:remove"),
  copy: call("clipboard:write"), preview: call("prompt:preview"), decide: call("claude:decide"),
  onClaude: (cb) => ipcRenderer.on("claude", (_e, p) => cb(p)), onDone: (cb) => ipcRenderer.on("job:done", (_e, p) => cb(p)),
  onJob: (cb) => ipcRenderer.on("job", (_e, p) => cb(p)),
});
