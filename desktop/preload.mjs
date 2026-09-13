import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("agentHeadroom", {
  getProviders: () => ipcRenderer.invoke("providers:get"),
  saveManual: (id, remainingPercent, resetsAt) => ipcRenderer.invoke(
    "providers:save-manual",
    { id, remainingPercent, resetsAt },
  ),
  addCustom: (name, usageUrl) => ipcRenderer.invoke(
    "providers:add-custom",
    { name, usageUrl },
  ),
  removeCustom: (id) => ipcRenderer.invoke("providers:remove-custom", { id }),
  openExternal: (url) => ipcRenderer.invoke("providers:open-external", { url }),
});
