// Deliberately tiny: the web app needs nothing from Node. contextIsolation + sandbox keep it that way.
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("schoolwellDesktop", { isDesktop: true, platform: process.platform });
