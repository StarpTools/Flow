const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hq', {
  getState: () => ipcRenderer.invoke('get-state'),
  mutate: (type, payload) => ipcRenderer.invoke('mutate', { type, payload }),

  session: {
    start: (opts) => ipcRenderer.invoke('session:start', opts || {}),
    pause: () => ipcRenderer.invoke('session:pause'),
    resume: () => ipcRenderer.invoke('session:resume'),
    confirm: () => ipcRenderer.invoke('session:confirm'),
    finish: (note) => ipcRenderer.invoke('session:finish', { note }),
    discard: () => ipcRenderer.invoke('session:discard')
  },

  widget: {
    setVisible: (visible) => ipcRenderer.invoke('widget:setVisible', { visible })
  },

  focusMain: () => ipcRenderer.invoke('window:focusMain'),
  revealData: () => ipcRenderer.invoke('data:reveal'),

  /* Imágenes de los papeles. Van por su propio canal y no por mutate porque
     tocan archivos en disco, y porque leer una devuelve datos en vez de
     cambiar el estado. */
  imagen: {
    pegar: (notaId, nombre, dataUrl) =>
      ipcRenderer.invoke('imagen:pegar', { notaId, nombre, dataUrl }),
    elegir: (notaId) => ipcRenderer.invoke('imagen:elegir', { notaId }),
    leer: (notaId, id) => ipcRenderer.invoke('imagen:leer', { notaId, id }),
    borrar: (notaId, id) => ipcRenderer.invoke('imagen:borrar', { notaId, id })
  },

  exportImage: (html, nombre) => ipcRenderer.invoke('export:image', { html, nombre }),
  exportSave: (png, nombre) => ipcRenderer.invoke('export:save', { png, nombre }),

  importV1: (json) => ipcRenderer.invoke('data:import', { json }),

  onState: (cb) => ipcRenderer.on('state', (_e, payload) => cb(payload))
});
