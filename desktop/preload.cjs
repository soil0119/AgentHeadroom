const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("agentHeadroom", {
  getDashboard: () => ipcRenderer.invoke("dashboard:get"),
  refresh: () => ipcRenderer.invoke("dashboard:refresh"),
  openSettings: () => ipcRenderer.invoke("dashboard:open-settings"),
  quit: () => ipcRenderer.invoke("dashboard:quit"),
  resizeDashboard: (height) => ipcRenderer.invoke("dashboard:resize", { height }),
  onDashboardChanged: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("dashboard:changed", listener);
    return () => ipcRenderer.removeListener("dashboard:changed", listener);
  },
  getProviders: () => ipcRenderer.invoke("providers:get"),
  openAdapters: () => ipcRenderer.invoke("providers:open-adapters"),
  installClaude: () => ipcRenderer.invoke("connectors:claude-install"),
  removeClaude: () => ipcRenderer.invoke("connectors:claude-remove"),
  openExternal: (url) => ipcRenderer.invoke("providers:open-external", { url }),
});
