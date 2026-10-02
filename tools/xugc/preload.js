const { contextBridge, ipcRenderer } = require("electron");
const call = (ch) => (...a) => ipcRenderer.invoke(ch, ...a);
contextBridge.exposeInMainWorld("xugc", {
  get: call("state:get"), estimate: call("estimate"), setSettings: call("settings:set"),
  setKey: call("key:set"), testKey: call("key:test"), setHf: call("hf:set"), setGoogle: call("google:set"), setFal: call("fal:set"), testGoogle: call("google:test"), sweep: call("pods:sweep"),
  fetchProduct: call("product:fetch"), clearProduct: call("product:clear"),
  generate: call("generate"), cancel: call("cancel"),
  styleToggle: call("style:toggle"), styleRead: call("style:read"), styleWrite: call("style:write"), styleDelete: call("style:delete"), styleAdd: call("style:add"),
  verdict: call("verdict"), deleteTake: call("take:delete"),
  addClips: call("dataset:add"), addClipPaths: call("dataset:addPaths"), caption: call("dataset:caption"), removeClip: call("dataset:remove"),
  collectStarter: call("collect:starter"), collectRun: call("collect:run"), collectStop: call("collect:stop"), collectRemove: call("collect:remove"),
  trainEstimate: call("train:estimate"), trainStart: call("train:start"), trainFinish: call("train:finish"), loraDelete: call("lora:delete"),
  onCollect: (cb) => ipcRenderer.on("collect", (_e, p) => cb(p)), onTrain: (cb) => ipcRenderer.on("train", (_e, p) => cb(p)),
  copy: call("clipboard:write"), refFromPath: call("reference:fromPath"), refPick: call("reference:pick"), refSave: call("reference:save"), refUpdate: call("reference:update"), refClear: call("reference:clear"),
  pathFor: (file) => { try { return require("electron").webUtils.getPathForFile(file); } catch { return ""; } }, preview: call("prompt:preview"), decide: call("claude:decide"),
  onClaude: (cb) => ipcRenderer.on("claude", (_e, p) => cb(p)), onDone: (cb) => ipcRenderer.on("job:done", (_e, p) => cb(p)),
  onJob: (cb) => ipcRenderer.on("job", (_e, p) => cb(p)),
});
