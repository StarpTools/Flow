const { app, BrowserWindow, ipcMain, screen, shell, dialog, clipboard, nativeTheme, Menu,
        Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const store = require('./store');
const COLORES = store.COLORES;
/* El mismo archivo que usa la ventana. Se carga aquí porque el cálculo del
   próximo repaso tiene que ocurrir donde se escriben los datos: si lo hiciera
   la ventana y mandara el resultado, una ventana con un fallo podría guardar
   intervalos inventados. */
const repaso = require('./app/js/repaso.js');

// Los errores de "GPU process exited unexpectedly" en Windows vienen de la
// aceleración por hardware de Chromium. La app no la necesita.
app.disableHardwareAcceleration();

/* El nombre fija la carpeta de datos (%APPDATA%\Flow). Se declara explicito
   en vez de dejar que Electron lo deduzca del package.json, para que la ruta
   no dependa de un campo que alguien podria tocar sin darse cuenta. */
app.setName('Flow');

/* Windows no enseña un aviso del sistema si no sabe de qué app viene: sin
   esto las notificaciones de los eventos no aparecen, y encima sin error. */
app.setAppUserModelId('com.luis.flow');

/* Una sola instancia. Hace falta desde que Flow puede arrancar con la sesión
   y quedarse escondido: sin esto, pulsar el acceso directo abriría una segunda
   copia con los mismos datos y las dos se pisarían al guardar. La segunda
   simplemente saca a la primera a primer plano.

   Las pruebas y las capturas quedan fuera: usan su propio almacén y no deben
   morir porque el Flow de verdad esté abierto. */
const ENSAYO = !!(process.env.HQ_SELFTEST || process.env.HQ_SHOTS);
if (!ENSAYO && !app.requestSingleInstanceLock()) {
  app.quit();
} else if (!ENSAYO) {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

// Arrancado por Windows al iniciar sesión: se queda en el widget, sin abrir
// la ventana grande. La idea es que avise, no que te reciba con una pantalla.
const ARRANQUE_OCULTO = process.argv.indexOf('--oculto') !== -1;

/* Las pruebas y las capturas escriben en su propio almacén. Sin esto, una
   corrida de pruebas mete datos inventados en el archivo real del usuario, que
   es justo lo que una app de registro personal jamás debe hacer. */
if (process.env.HQ_SELFTEST || process.env.HQ_SHOTS) {
  app.setPath('userData', path.join(app.getPath('temp'), 'flow-pruebas'));
}

let mainWindow = null;
let widgetWindow = null;

// ---------------------------------------------------------------------------
// Sesión activa
//
// El cronómetro vive AQUÍ, en el proceso principal, no en una ventana. Así el
// tiempo sigue corriendo aunque cierres el HQ y solo dejes el widget, y las dos
// ventanas nunca pueden discrepar sobre cuánto llevas.
// ---------------------------------------------------------------------------
let session = null;
let tickTimer = null;

function uid(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function localDate(d) {
  const dt = d ? new Date(d) : new Date();
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function scheduleNextCheckin() {
  if (!session) return;
  const s = store.get().settings;
  const min = Math.max(1, s.checkinMinMin);
  const max = Math.max(min, s.checkinMaxMin);
  const mins = min + Math.random() * (max - min);
  session.nextCheckinAt = Date.now() + mins * 60000;
}

function startTicking() {
  if (tickTimer) return;
  tickTimer = setInterval(tick, 1000);
}

function stopTicking() {
  if (tickTimer) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

function tick() {
  if (!session) {
    stopTicking();
    return;
  }
  if (session.state !== 'running') return;

  session.countedSec += 1;

  const now = Date.now();

  if (session.checkin) {
    // Durante la ventana de gracia el tiempo se sigue acumulando. Si confirmas
    // rápido no pierdes nada; si no apareces, se descuenta entero al vencer.
    if (now >= session.checkin.deadline) {
      /* No confirmaste. Dos cosas distintas pasan aquí:

         1. La ventana de gracia no cuenta como tiempo, punto: se resta.
         2. El tramo desde la última verificación buena hasta ahora queda EN
            DUDA. No lo borramos (podrías haber estado trabajando todo el
            rato y solo te levantaste al final), pero tampoco lo damos por
            bueno: se marca como no verificado y se reporta aparte.

         Descartar el tramo entero castigaría trabajo real; darlo por bueno
         convertiría el número en una mentira. Separarlo es lo único honesto. */
      const graceSec = Math.round((session.checkin.deadline - session.checkin.askedAt) / 1000);
      session.countedSec = Math.max(0, session.countedSec - graceSec);
      session.unverifiedSec += Math.max(0, session.countedSec - session.lastVerifiedSec);
      session.lastVerifiedSec = session.countedSec;
      session.checkin = null;
      session.state = 'paused';
      session.lastEvent = { kind: 'checkin-fallido', at: now };
      scheduleNextCheckin();
      if (widgetWindow) widgetWindow.showInactive();
      broadcast();
      return;
    }
  } else if (session.nextCheckinAt && now >= session.nextCheckinAt) {
    session.checkin = {
      askedAt: now,
      deadline: now + store.get().settings.checkinGraceSec * 1000
    };
    session.checkinsAsked += 1;
    session.lastEvent = { kind: 'checkin', at: now };
    if (widgetWindow) {
      widgetWindow.showInactive();
      widgetWindow.setAlwaysOnTop(true, 'screen-saver');
    }
    broadcast();
    return;
  }

  broadcast(true);
}

function sessionView() {
  if (!session) return null;
  return {
    id: session.id,
    date: session.date,
    activityId: session.activityId,
    spotId: session.spotId,
    planItemId: session.planItemId,
    startedAt: session.startedAt,
    countedSec: session.countedSec,
    unverifiedSec: session.unverifiedSec,
    state: session.state,
    checkinsAsked: session.checkinsAsked,
    checkinsConfirmed: session.checkinsConfirmed,
    checkin: session.checkin
      ? { askedAt: session.checkin.askedAt, deadline: session.checkin.deadline }
      : null,
    lastEvent: session.lastEvent || null
  };
}

// tickOnly evita reenviar todo el dataset una vez por segundo.
function broadcast(tickOnly) {
  const payload = tickOnly
    ? { tick: true, session: sessionView() }
    // El error de guardado viaja con cada estado: si el disco se llena o el
    // antivirus bloquea el archivo, tienes que enterarte al momento, no
    // después de una hora de trabajo que no se guardó.
    : { tick: false, data: store.get(), session: sessionView(), errorGuardado: store.getError() };
  for (const win of [mainWindow, widgetWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send('state', payload);
  }
}

// ---------------------------------------------------------------------------
// Eventos y sus avisos
//
// Un evento no es plan: el plan son horas que cumples, un evento es un punto
// en el tiempo que llega. Por eso vive aparte y no entra en ninguna cuenta.
//
// El aviso se decide AQUI, en el proceso principal, por lo mismo que el
// cronometro: la ventana puede estar cerrada, y un recordatorio que solo
// funciona con la pantalla abierta no es un recordatorio.
// ---------------------------------------------------------------------------

// Un evento sin hora se avisa tomando las 9:00 como su hora. Sin esto habria
// que avisar a medianoche, que es cuando nadie lo va a leer.
const HORA_SIN_HORA = '09:00';

// Cuanto despues de un evento ya no tiene sentido avisar. Abrir Flow el jueves
// no puede soltar de golpe los avisos del lunes.
const CADUCA_MS = 6 * 60 * 60 * 1000;

function momentoDe(ev) {
  const [Y, M, D] = String(ev.date).split('-').map(Number);
  const [h, m] = String(ev.time || HORA_SIN_HORA).split(':').map(Number);
  return new Date(Y, M - 1, D, h, m, 0, 0).getTime();
}

function cuandoSeAvisa(ev) {
  return momentoDe(ev) - Math.max(0, ev.avisarMin) * 60000;
}

function textoDelAviso(ev) {
  const hoy = localDate();
  const manana = localDate(new Date(Date.now() + 86400000));
  const dia = ev.date === hoy ? 'Hoy' : ev.date === manana ? 'Mañana' : 'El ' + ev.date;
  return dia + (ev.time ? ' a las ' + ev.time : '') + (ev.note ? ' · ' + ev.note : '');
}

function avisarDe(ev) {
  if (Notification.isSupported()) {
    const aviso = new Notification({
      title: ev.title,
      body: textoDelAviso(ev),
      icon: ICONO
    });
    aviso.on('click', () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    });
    aviso.show();
  }

  /* Ademas del aviso del sistema, la app se hace notar como con las
     verificaciones: el aviso de Windows se puede haber ido ya de pantalla
     cuando vuelves al ordenador, y la barra de tareas sigue parpadeando. */
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isFocused()) {
    mainWindow.flashFrame(true);
  }
  if (widgetWindow && !widgetWindow.isDestroyed()) widgetWindow.showInactive();
}

let avisosTimer = null;

function revisarAvisos() {
  const data = store.get();
  if (!Array.isArray(data.events) || !data.events.length) return;

  const ahora = Date.now();
  let alguno = false;

  for (const ev of data.events) {
    if (ev.avisadoAt || ev.avisarMin < 0) continue;
    if (ahora < cuandoSeAvisa(ev)) continue;
    // Demasiado tarde: no se avisa, y tampoco se marca. Si el evento sigue
    // siendo futuro manana, el aviso saldra entonces.
    if (ahora > momentoDe(ev) + CADUCA_MS) continue;

    ev.avisadoAt = new Date().toISOString();
    avisarDe(ev);
    alguno = true;
  }

  if (alguno) {
    store.save();
    broadcast();
  }
}

/* Arrancar con Windows. Solo en la app instalada: en desarrollo registraria
   electron.exe, que al reiniciar abriria un Electron pelado sin Flow dentro. */
function aplicarArranqueConWindows(activado) {
  if (!app.isPackaged) return;
  try {
    app.setLoginItemSettings({ openAtLogin: !!activado, args: ['--oculto'] });
  } catch (err) {
    console.error('No se pudo cambiar el arranque automático:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Ventanas
// ---------------------------------------------------------------------------
const ICONO = path.join(__dirname, 'app', 'assets', 'icon-256.png');

/* Corrector ortográfico.

   Chromium trae uno dentro, pero sin esto no sirve de nada: hay que decirle en
   qué idiomas escribes, y hay que construir el menú del clic derecho a mano
   porque Electron no trae ninguno. Sin el menú, las palabras salen subrayadas
   en rojo y no hay forma de corregirlas — que es peor que no subrayarlas.

   Español e inglés a la vez, y a propósito: estas notas están llenas de
   check-raise, commit, merge y overbet. Con solo español, media nota sale
   subrayada y el subrayado deja de significar nada. Chromium da por buena una
   palabra si la conoce CUALQUIERA de los idiomas activos. */
const IDIOMAS_CORRECTOR = ['es', 'es-ES', 'en-US'];

function configurarCorrector(win) {
  const ses = win.webContents.session;

  try {
    const disponibles = ses.availableSpellCheckerLanguages || [];
    const usar = IDIOMAS_CORRECTOR.filter((l) => disponibles.indexOf(l) !== -1);
    // Un idioma que esta versión de Chromium no traiga hace que la llamada
    // lance y deje el corrector sin configurar entero.
    if (usar.length) ses.setSpellCheckerLanguages(usar);
  } catch (err) {
    console.error('No se pudo configurar el corrector:', err.message);
  }

  win.webContents.on('context-menu', (_e, params) => {
    const items = [];

    /* Las sugerencias primero y sin envolver en un submenú: corregir tiene que
       ser dos clics, no cuatro. Es lo único que se hace aquí con prisa. */
    for (const sug of (params.dictionarySuggestions || []).slice(0, 6)) {
      items.push({
        label: sug,
        click: () => win.webContents.replaceMisspelling(sug)
      });
    }

    if (params.misspelledWord) {
      if (!items.length) items.push({ label: 'Sin sugerencias', enabled: false });
      items.push({ type: 'separator' });
      items.push({
        label: 'Añadir "' + params.misspelledWord + '" al diccionario',
        click: () => ses.addWordToSpellCheckerDictionary(params.misspelledWord)
      });
      items.push({ type: 'separator' });
    }

    if (params.isEditable || params.selectionText) {
      items.push({ role: 'cut', label: 'Cortar', enabled: params.editFlags.canCut });
      items.push({ role: 'copy', label: 'Copiar', enabled: params.editFlags.canCopy });
      items.push({ role: 'paste', label: 'Pegar', enabled: params.editFlags.canPaste });
      items.push({ type: 'separator' });
      items.push({ role: 'selectAll', label: 'Seleccionar todo' });
    }

    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
}

/* Color de fondo de la ventana ANTES de que cargue el HTML. Sin esto, abrir
   la app en tema oscuro produce un destello blanco en cada arranque, que es
   justo lo que va a molestar a quien eligió el tema oscuro. */
function fondoVentana() {
  const t = store.get().settings.theme;
  const oscuro = t === 'dark' || (t !== 'light' && nativeTheme.shouldUseDarkColors);
  return oscuro ? '#12151c' : '#ffffff';
}

/* Tamaño con el que abre la app la primera vez.

   No es un número fijo: se calcula desde el área útil de la pantalla. Con
   datos reales dentro, "Planificar" mide 838px de contenido y "Hoy" 790px,
   así que una ventana de 800 de alto (709 de hueco) obliga a hacer scroll en
   las dos vistas que son de vistazo. Se pide el alto necesario y se recorta
   a lo que la pantalla permita, con margen para la barra de tareas. */
function boundsPorDefecto() {
  const { workArea } = screen.getPrimaryDisplay();
  const width = Math.min(1240, workArea.width - 80);
  const height = Math.min(980, workArea.height - 40);
  return {
    width: Math.max(900, width),
    height: Math.max(600, height),
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2)
  };
}

/* Un tamaño guardado puede haber quedado fuera de la pantalla: desconectar un
   monitor, cambiar de resolución o venir de un portátil con pantalla mayor.
   Restaurar eso a ciegas deja la ventana invisible y la app parece rota. */
function boundsValidos(b) {
  if (!b || !isFinite(b.width) || !isFinite(b.height)) return null;
  if (b.width < 700 || b.height < 500) return null;

  const visibleEnAlguna = screen.getAllDisplays().some((d) => {
    const w = d.workArea;
    // Basta con que asome una franja suficiente para poder agarrarla.
    return b.x < w.x + w.width - 80 && b.x + b.width > w.x + 80 &&
           b.y < w.y + w.height - 40 && b.y + b.height > w.y;
  });
  return visibleEnAlguna ? b : null;
}

let guardarBoundsTimer = null;

function recordarBounds() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized() || mainWindow.isMaximized()) return;
  clearTimeout(guardarBoundsTimer);
  // Arrastrar una ventana dispara decenas de eventos: se escribe al parar.
  guardarBoundsTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    store.get().settings.windowBounds = mainWindow.getBounds();
    store.save();
  }, 400);
}

function createMainWindow() {
  const guardado = boundsValidos(store.get().settings.windowBounds);
  const b = guardado || boundsPorDefecto();

  mainWindow = new BrowserWindow({
    width: b.width,
    height: b.height,
    x: b.x,
    y: b.y,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: fondoVentana(),
    title: 'Flow',
    icon: ICONO,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Chromium ralentiza los temporizadores de las ventanas que no estan al
      // frente. Esta app se usa justamente asi: trabajando en otra ventana
      // mientras el cronometro corre. Sin esto, lo que ves en pantalla se
      // queda atras del tiempo real.
      backgroundThrottling: false,
      spellcheck: true
    }
  });

  configurarCorrector(mainWindow);
  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'app', 'index.html'));

  if (process.env.HQ_DEBUG) {
    mainWindow.webContents.on('console-message', (_e, lvl, msg, line, src) => {
      console.log('[HQ ' + lvl + '] ' + msg + ' (' + String(src).split('/').pop() + ':' + line + ')');
    });
  }

  if (process.env.HQ_SELFTEST) {
    require('./selftest').run(mainWindow, app);
  }

  if (process.env.HQ_SHOTS) {
    require('./shots').run(mainWindow, app);
  }

  mainWindow.on('resize', recordarBounds);
  mainWindow.on('move', recordarBounds);

  mainWindow.on('close', () => {
    // Al cerrar se guarda sin esperar al temporizador: si el usuario ajusta
    // el tamaño y cierra en el acto, el ajuste no se puede perder.
    clearTimeout(guardarBoundsTimer);
    if (mainWindow && !mainWindow.isDestroyed() &&
        !mainWindow.isMinimized() && !mainWindow.isMaximized()) {
      store.get().settings.windowBounds = mainWindow.getBounds();
      store.flush();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function createWidgetWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const w = 320;
  const h = 132;

  widgetWindow = new BrowserWindow({
    width: w,
    height: h,
    x: workArea.x + workArea.width - w - 24,
    y: workArea.y + workArea.height - h - 24,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: fondoVentana(),
    icon: ICONO,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // El widget nunca tiene el foco: ese es justo su trabajo. Si Chromium
      // lo ralentiza por estar en segundo plano, el cronometro que ves se
      // congela mientras el tiempo real sigue corriendo.
      backgroundThrottling: false
    }
  });

  widgetWindow.setAlwaysOnTop(true, 'screen-saver');
  widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  widgetWindow.loadFile(path.join(__dirname, 'widget', 'widget.html'));

  if (process.env.HQ_DEBUG) {
    widgetWindow.webContents.on('console-message', (_e, lvl, msg, line, src) => {
      console.log('[WIDGET ' + lvl + '] ' + msg + ' (' + String(src).split('/').pop() + ':' + line + ')');
    });
  }

  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });
}

function setWidgetVisible(visible) {
  const data = store.get();
  data.settings.widgetEnabled = !!visible;
  store.save();

  if (visible) {
    if (!widgetWindow) createWidgetWindow();
    else widgetWindow.showInactive();
  } else if (widgetWindow) {
    widgetWindow.close();
    widgetWindow = null;
  }
  broadcast();
}

app.whenReady().then(() => {
  store.init(app.getPath('userData'));
  createMainWindow();
  if (ARRANQUE_OCULTO && mainWindow) mainWindow.hide();
  if (store.get().settings.widgetEnabled || ARRANQUE_OCULTO) createWidgetWindow();

  aplicarArranqueConWindows(store.get().settings.arrancarConWindows);

  /* Cada medio minuto basta: el aviso mas fino que se puede pedir es de
     minutos, y una comprobacion por segundo solo gastaria bateria. Se hace
     una al arrancar para recuperar lo que venciera con la app cerrada. */
  revisarAvisos();
  avisosTimer = setInterval(revisarAvisos, 30000);
});

app.on('window-all-closed', () => {
  store.flush();
  app.quit();
});

app.on('before-quit', () => {
  clearInterval(avisosTimer);
  // Una sesión abierta al cerrar se guarda igual. Perder 40 minutos de trabajo
  // registrado por cerrar la ventana seria el peor bug posible de esta app.
  if (session && session.countedSec > 0) finishSession('');
  store.flush();
});

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
ipcMain.handle('get-state', () => ({
  data: store.get(),
  session: sessionView(),
  dataPath: store.getFilePath()
}));

// --- Sesión ---------------------------------------------------------------

ipcMain.handle('session:start', (_e, { activityId, spotId, planItemId }) => {
  if (session) return { ok: false, error: 'Ya hay una sesión en curso' };
  session = {
    id: uid('s'),
    date: localDate(),
    activityId: activityId || null,
    spotId: spotId || null,
    planItemId: planItemId || null,
    startedAt: new Date().toISOString(),
    countedSec: 0,
    // Tiempo de tramos que quedaron sin confirmar, y marca del último punto
    // verificado. La diferencia entre ambos es lo que está en duda ahora.
    unverifiedSec: 0,
    lastVerifiedSec: 0,
    state: 'running',
    checkinsAsked: 0,
    checkinsConfirmed: 0,
    checkin: null,
    nextCheckinAt: null,
    lastEvent: null
  };
  scheduleNextCheckin();
  startTicking();
  broadcast();
  return { ok: true };
});

ipcMain.handle('session:pause', () => {
  if (!session) return { ok: false };
  session.state = 'paused';
  session.checkin = null;
  broadcast();
  return { ok: true };
});

ipcMain.handle('session:resume', () => {
  if (!session) return { ok: false };
  session.state = 'running';
  scheduleNextCheckin();
  startTicking();
  broadcast();
  return { ok: true };
});

ipcMain.handle('session:confirm', () => {
  if (!session || !session.checkin) return { ok: false };
  session.checkinsConfirmed += 1;
  // Todo lo acumulado hasta aquí queda certificado.
  session.lastVerifiedSec = session.countedSec;
  session.checkin = null;
  session.lastEvent = { kind: 'confirmado', at: Date.now() };
  scheduleNextCheckin();
  broadcast();
  return { ok: true };
});

function finishSession(note) {
  if (!session) return null;
  const data = store.get();
  const record = {
    id: session.id,
    date: session.date,
    activityId: session.activityId,
    spotId: session.spotId,
    planItemId: session.planItemId,
    startedAt: session.startedAt,
    endedAt: new Date().toISOString(),
    countedSec: session.countedSec,
    // Si la sesión termina con una pregunta abierta, ese último tramo
    // tampoco esta verificado.
    unverifiedSec:
      session.unverifiedSec +
      (session.checkin ? Math.max(0, session.countedSec - session.lastVerifiedSec) : 0),
    checkinsAsked: session.checkinsAsked,
    checkinsConfirmed: session.checkinsConfirmed,
    note: note || ''
  };
  data.sessions.push(record);
  store.save();
  session = null;
  stopTicking();
  broadcast();
  return record;
}

ipcMain.handle('session:finish', (_e, { note }) => {
  const rec = finishSession(note);
  return { ok: !!rec, record: rec };
});

ipcMain.handle('session:discard', () => {
  session = null;
  stopTicking();
  broadcast();
  return { ok: true };
});

// --- Mutaciones de datos --------------------------------------------------
//
// Un único canal para todo lo que escribe. El renderer describe QUE cambia y
// el proceso principal es el único que toca el archivo.

ipcMain.handle('mutate', (_e, action) => {
  const data = store.get();
  const p = action.payload || {};

  switch (action.type) {
    case 'activity:add': {
      const name = (p.name || '').trim();
      if (!name) return { ok: false, error: 'Nombre vacío' };
      if (data.activities.some((a) => a.name.toLowerCase() === name.toLowerCase()))
        return { ok: false, error: 'Ya existe esa actividad' };
      const kind = p.kind === 'daily' ? 'daily' : 'timed';
      const act = { id: uid('a'), name, color: p.color || '#8B8B8B', kind };
      if (kind === 'daily') {
        act.target = Number(p.target) > 0 ? Number(p.target) : 1;
        act.unit = p.unit || 'h';
      }
      data.activities.push(act);
      break;
    }
    case 'activity:remove': {
      data.activities = data.activities.filter((a) => a.id !== p.id);
      break;
    }
    case 'activity:rename': {
      const a = data.activities.find((x) => x.id === p.id);
      if (a && p.name && p.name.trim()) a.name = p.name.trim();
      if (a && p.color) a.color = p.color;
      if (a && Number(p.target) > 0) a.target = Number(p.target);
      break;
    }

    // --- Registro diario y descanso -------------------------------------

    case 'daily:set': {
      const v = Number(p.value);
      if (!data.daily[p.date]) data.daily[p.date] = {};
      // Un valor vacío o cero borra el registro en vez de guardar un 0, que
      // se leería como "dormí cero horas" en vez de "no lo he anotado".
      if (!p.value && p.value !== 0) delete data.daily[p.date][p.activityId];
      else if (!isFinite(v) || v < 0) return { ok: false, error: 'Valor inválido' };
      else data.daily[p.date][p.activityId] = v;
      if (!Object.keys(data.daily[p.date]).length) delete data.daily[p.date];
      break;
    }

    case 'rest:toggle': {
      if (data.restDays[p.date]) delete data.restDays[p.date];
      else data.restDays[p.date] = true;
      break;
    }

    /* Grupos de spots. Planos: agrupan la lista y deciden si el spot lleva
       cifras de dinero. No son una carpeta por la que haya que navegar. */
    case 'spotGroup:add': {
      const nombre = (p.name || '').trim();
      if (!nombre) return { ok: false, error: 'Ponle nombre al grupo' };
      if (data.spotGroups.some((g) => g.name.toLowerCase() === nombre.toLowerCase()))
        return { ok: false, error: 'Ya tienes un grupo que se llama así' };
      data.spotGroups.push({
        id: uid('sg'),
        name: nombre.slice(0, 60),
      });
      break;
    }
    case 'spotGroup:update': {
      const g = data.spotGroups.find((x) => x.id === p.id);
      if (!g) return { ok: false, error: 'Grupo desconocido' };
      if (typeof p.name === 'string' && p.name.trim()) {
        const nombre = p.name.trim();
        if (data.spotGroups.some((x) => x.id !== p.id && x.name.toLowerCase() === nombre.toLowerCase()))
          return { ok: false, error: 'Ya tienes un grupo que se llama así' };
        g.name = nombre.slice(0, 60);
      }
      break;
    }
    /* Borrar un grupo NO borra sus spots: se quedan sin grupo, que es como
       estaban antes de que existieran los grupos. Un clic que se lleva por
       delante meses de sesiones y resultados no debería existir. */
    case 'spotGroup:remove': {
      data.spotGroups = data.spotGroups.filter((g) => g.id !== p.id);
      data.spots.forEach((s) => { if (s.groupId === p.id) s.groupId = null; });
      break;
    }

    case 'spot:add': {
      const name = (p.name || '').trim();
      if (!name) return { ok: false, error: 'Nombre vacío' };
      if (p.groupId && !data.spotGroups.some((g) => g.id === p.groupId))
        return { ok: false, error: 'Grupo desconocido' };
      /* El color no es decoración: es la señal de en qué ámbito estás
         escribiendo en el bloc. Sin ella, dos spots se ven iguales y volver a
         mezclar apuntes de dos mundos es cuestión de tiempo. */
      const usados = data.spots.map((s) => s.color);
      const libre = COLORES.filter((c) => usados.indexOf(c) === -1)[0];
      data.spots.push({
        id: uid('sp'),
        name,
        note: p.note || '',
        color: p.color || libre || COLORES[data.spots.length % COLORES.length],
        groupId: p.groupId || null,
        createdAt: new Date().toISOString(),
        archived: false
      });
      break;
    }
    case 'spot:update': {
      const sp = data.spots.find((x) => x.id === p.id);
      if (sp) {
        if (typeof p.name === 'string' && p.name.trim()) sp.name = p.name.trim();
        if (typeof p.note === 'string') sp.note = p.note;
        if (typeof p.color === 'string') sp.color = p.color;
        if (typeof p.groupId !== 'undefined') {
          if (p.groupId && !data.spotGroups.some((g) => g.id === p.groupId))
            return { ok: false, error: 'Grupo desconocido' };
          sp.groupId = p.groupId || null;
        }
        if (typeof p.archived === 'boolean') sp.archived = p.archived;
      }
      break;
    }
    case 'spot:remove': {
      data.spots = data.spots.filter((x) => x.id !== p.id);
      data.results = data.results.filter((r) => r.spotId !== p.id);

      /* Las carpetas del tema se van con él: eran suyas y de nadie más. Los
         PAPELES no: se quedan sin tema y la pantalla "Papeles sueltos" los
         recoge. Borrar un tema no puede llevarse por delante meses de apuntes,
         y sin esa pantalla se quedarían en el archivo pero fuera del alcance
         de la vista, que se recorre entrando siempre por un tema. */
      data.noteTypes = data.noteTypes.filter((t) => t.spotId !== p.id);
      data.reviews.forEach((r) => {
        if (r.spotId === p.id) { r.spotId = null; r.typeId = null; }
      });
      break;
    }

    case 'plan:add': {
      /* Una actividad de registro diario no se agenda ni se cronometra. Los
         desplegables ya la filtran, pero la validación vive aquí porque este
         canal lo usan también las pruebas y la importación, y colar tiempo en
         un ítem diario ensucia el reparto de horas de forma invisible. */
      const actPlan = data.activities.find((a) => a.id === p.activityId);
      if (!actPlan) return { ok: false, error: 'Actividad desconocida' };
      if (actPlan.kind === 'daily')
        return { ok: false, error: '"' + actPlan.name + '" es de registro diario, no se agenda' };

      // dates puede traer varias fechas: así funcionan los chips de repetición.
      const dates = Array.isArray(p.dates) ? p.dates : [p.date];
      for (const d of dates) {
        if (!d) continue;
        if (!data.plan[d]) data.plan[d] = [];
        data.plan[d].push({
          id: uid('p'),
          activityId: p.activityId,
          spotId: p.spotId || null,
          plannedMins: p.plannedMins || 60
        });
      }
      break;
    }
    case 'plan:remove': {
      const list = data.plan[p.date];
      if (list) {
        data.plan[p.date] = list.filter((i) => i.id !== p.id);
        if (!data.plan[p.date].length) delete data.plan[p.date];
      }
      break;
    }
    case 'plan:clearDay': {
      delete data.plan[p.date];
      break;
    }

    case 'result:add': {
      data.results.push({
        id: uid('r'),
        spotId: p.spotId,
        date: p.date || localDate(),
        hands: Number(p.hands) || 0,
        profit: Number(p.profit) || 0,
        note: p.note || ''
      });
      data.results.sort((a, b) => (a.date < b.date ? -1 : 1));
      break;
    }
    case 'result:remove': {
      data.results = data.results.filter((r) => r.id !== p.id);
      break;
    }

    case 'session:remove': {
      data.sessions = data.sessions.filter((s) => s.id !== p.id);
      break;
    }
    case 'session:addManual': {
      const actMan = data.activities.find((a) => a.id === p.activityId);
      if (actMan && actMan.kind === 'daily')
        return { ok: false, error: '"' + actMan.name + '" se registra a diario, no con cronómetro' };
      data.sessions.push({
        id: uid('s'),
        date: p.date || localDate(),
        activityId: p.activityId || null,
        spotId: p.spotId || null,
        planItemId: p.planItemId || null,
        startedAt: new Date(p.date + 'T12:00:00').toISOString(),
        endedAt: new Date(p.date + 'T12:00:00').toISOString(),
        countedSec: Math.round((Number(p.mins) || 0) * 60),
        checkinsAsked: 0,
        checkinsConfirmed: 0,
        manual: true,
        note: p.note || ''
      });
      break;
    }

    // --- Bloc de lógicas (repetición espaciada) -------------------------

    /* Los apartados pertenecen a un ámbito: un spot, o General (spotId null)
       para las notas que no son de ningún spot. No se comparten. Por eso todas
       las comprobaciones de nombre repetido son DENTRO del ámbito: que un spot
       de poker tenga "Preflop" no puede impedir que otro tenga el suyo. */
    case 'noteType:add': {
      const nombre = (p.name || '').trim();
      if (!nombre) return { ok: false, error: 'Ponle nombre al apartado' };
      const ambito = p.spotId || null;
      if (ambito && !data.spots.some((s) => s.id === ambito))
        return { ok: false, error: 'Spot desconocido' };
      if (data.noteTypes.some((t) => (t.spotId || null) === ambito &&
                                     t.name.toLowerCase() === nombre.toLowerCase()))
        return { ok: false, error: 'Este ámbito ya tiene un apartado que se llama así' };
      data.noteTypes.push({
        id: uid('nt'),
        name: nombre.slice(0, 60),
        color: p.color || '#5b5bd6',
        spotId: ambito
      });
      break;
    }
    case 'noteType:update': {
      const t = data.noteTypes.find((x) => x.id === p.id);
      if (!t) return { ok: false, error: 'Apartado desconocido' };
      if (typeof p.name === 'string' && p.name.trim()) {
        const nombre = p.name.trim();
        if (data.noteTypes.some((x) => x.id !== p.id &&
                                       (x.spotId || null) === (t.spotId || null) &&
                                       x.name.toLowerCase() === nombre.toLowerCase()))
          return { ok: false, error: 'Este ámbito ya tiene un apartado que se llama así' };
        t.name = nombre.slice(0, 60);
      }
      if (p.color) t.color = p.color;
      break;
    }

    /* Copiar los apartados de otro ámbito. Un spot nuevo nace vacío a
       propósito —sembrarlo con categorías de poker sería absurdo en unos
       apuntes de git— pero recrear a mano los mismos seis nombres cada vez que
       abres un spot de poker es trabajo tonto. Esto los copia; a partir de ahí
       son independientes. Los nombres que ya existan en el destino se saltan,
       para que pulsarlo dos veces no duplique nada. */
    case 'noteType:copyFrom': {
      const destino = p.toSpotId || null;
      const origen = p.fromSpotId || null;
      if (destino === origen) return { ok: false, error: 'Origen y destino son el mismo ámbito' };
      if (destino && !data.spots.some((s) => s.id === destino))
        return { ok: false, error: 'Spot desconocido' };

      const yaHay = data.noteTypes
        .filter((t) => (t.spotId || null) === destino)
        .map((t) => t.name.toLowerCase());

      let copiados = 0;
      for (const t of data.noteTypes.filter((x) => (x.spotId || null) === origen)) {
        if (yaHay.indexOf(t.name.toLowerCase()) !== -1) continue;
        data.noteTypes.push({
          id: uid('nt'), name: t.name, color: t.color, spotId: destino
        });
        yaHay.push(t.name.toLowerCase());
        copiados++;
      }
      if (!copiados) return { ok: false, error: 'No había ningún apartado nuevo que copiar' };
      break;
    }
    /* Borrar un apartado NO borra sus notas: pasan a "sin clasificar".
       Un clic que se lleva por delante treinta resúmenes de clase es un clic
       que no debería existir. */
    case 'noteType:remove': {
      data.noteTypes = data.noteTypes.filter((t) => t.id !== p.id);
      data.reviews.forEach((r) => { if (r.typeId === p.id) r.typeId = null; });
      break;
    }

    /* --- Papeles ------------------------------------------------------
       El papel es el documento. No se repasa él: se repasan sus tarjetas. */

    case 'review:add': {
      const title = (p.title || '').trim();
      if (!title) return { ok: false, error: 'Ponle un título al papel' };
      if (p.spotId && !data.spots.some((s) => s.id === p.spotId))
        return { ok: false, error: 'Tema desconocido' };

      /* La carpeta tiene que ser del mismo tema que el papel. Es la regla que
         hace imposible mezclar: sin ella un papel de git podía quedar
         clasificado en una carpeta de otra materia. */
      if (p.typeId) {
        const t = data.noteTypes.find((x) => x.id === p.typeId);
        if (!t) return { ok: false, error: 'Carpeta desconocida' };
        if ((t.spotId || null) !== (p.spotId || null))
          return { ok: false, error: 'Esa carpeta es de otro tema' };
      }

      const ahora = new Date().toISOString();
      data.reviews.push({
        id: uid('rv'),
        title: title,
        text: String(p.text || ''),
        typeId: p.typeId || null,
        spotId: p.spotId || null,
        imagenes: [],
        tarjetas: [],
        createdAt: ahora,
        updatedAt: ahora
      });
      break;
    }

    case 'review:update': {
      const rv = data.reviews.find((x) => x.id === p.id);
      if (!rv) return { ok: false, error: 'Papel desconocido' };

      if (typeof p.title === 'string') {
        if (!p.title.trim()) return { ok: false, error: 'El papel necesita un título' };
        rv.title = p.title.trim();
      }
      /* El cuerpo SÍ puede quedarse vacío: vaciar un papel es una edición
         legítima. Solo se recorta por el final, porque los espacios del
         principio de una línea pueden ser sangría escrita a propósito. */
      if (typeof p.text === 'string') rv.text = p.text.replace(/\s+$/, '');

      /* Tema y carpeta se resuelven juntos, porque una carpeta solo existe
         dentro de su tema. Mover un papel a otro tema tiene que dejarlo SIN
         carpeta, no clasificado en una que no es suya. */
      const temaNuevo = typeof p.spotId !== 'undefined'
        ? (p.spotId || null)
        : (rv.spotId || null);
      if (temaNuevo && !data.spots.some((s) => s.id === temaNuevo))
        return { ok: false, error: 'Tema desconocido' };

      let carpetaNueva = typeof p.typeId !== 'undefined' ? (p.typeId || null) : (rv.typeId || null);
      if (carpetaNueva) {
        const t = data.noteTypes.find((x) => x.id === carpetaNueva);
        if (!t) return { ok: false, error: 'Carpeta desconocida' };
        // Una carpeta de otro tema no es un error del usuario: es que ha
        // movido el papel. Se cae sola en vez de bloquear el guardado.
        if ((t.spotId || null) !== temaNuevo) carpetaNueva = null;
      }

      rv.spotId = temaNuevo;
      rv.typeId = carpetaNueva;
      rv.updatedAt = new Date().toISOString();
      break;
    }

    case 'review:remove': {
      /* Los archivos de sus imágenes se van con él. Si se quedaran, la carpeta
         de datos acumularía capturas que ya no puede ver nadie y nunca se
         limpiarían. */
      const rvBorrar = data.reviews.find((x) => x.id === p.id);
      if (rvBorrar) borrarArchivosDeImagen(rvBorrar.imagenes);
      data.reviews = data.reviews.filter((x) => x.id !== p.id);
      break;
    }

    /* --- Tarjetas -----------------------------------------------------
       Viven dentro de su papel, en una lista aparte de la teoría. Cada una
       lleva su propio calendario: es lo que hace que lo que ya sabes deje de
       volver al ritmo de lo que no. */

    case 'card:add': {
      const rv = data.reviews.find((x) => x.id === p.notaId);
      if (!rv) return { ok: false, error: 'Papel desconocido' };
      const pregunta = (p.pregunta || '').trim();
      if (!pregunta) return { ok: false, error: 'La tarjeta necesita una pregunta' };
      rv.tarjetas.push(Object.assign({
        id: uid('tj'),
        pregunta: pregunta,
        respuesta: String(p.respuesta || '')
      }, repaso.nuevo(localDate())));
      rv.updatedAt = new Date().toISOString();
      break;
    }

    case 'card:update': {
      const rv = data.reviews.find((x) => x.id === p.notaId);
      const c = rv && rv.tarjetas.find((x) => x.id === p.id);
      if (!c) return { ok: false, error: 'Tarjeta desconocida' };
      if (typeof p.pregunta === 'string') {
        if (!p.pregunta.trim()) return { ok: false, error: 'La tarjeta necesita una pregunta' };
        c.pregunta = p.pregunta.trim();
      }
      if (typeof p.respuesta === 'string') c.respuesta = p.respuesta.replace(/\s+$/, '');
      rv.updatedAt = new Date().toISOString();
      break;
    }

    case 'card:remove': {
      const rv = data.reviews.find((x) => x.id === p.notaId);
      if (!rv) return { ok: false, error: 'Papel desconocido' };
      rv.tarjetas = rv.tarjetas.filter((x) => x.id !== p.id);
      rv.updatedAt = new Date().toISOString();
      break;
    }

    case 'card:grade': {
      const rv = data.reviews.find((x) => x.id === p.notaId);
      const c = rv && rv.tarjetas.find((x) => x.id === p.id);
      if (!c) return { ok: false, error: 'Tarjeta desconocida' };

      const siguiente = repaso.responder(c, p.grade, localDate());
      if (!siguiente) return { ok: false, error: 'Respuesta desconocida: ' + p.grade };
      Object.assign(c, siguiente);
      break;
    }

    /* Aplazar sin responder. Existe porque la alternativa es peor: si la única
       salida fuera responder, un día con prisa acabaría con todo marcado
       "bien" sin haberlo pensado, y eso corrompe el calendario para meses. */
    case 'card:posponer': {
      const rv = data.reviews.find((x) => x.id === p.notaId);
      const c = rv && rv.tarjetas.find((x) => x.id === p.id);
      if (!c) return { ok: false };
      c.due = repaso.sumarDias(localDate(), Math.max(1, Number(p.dias) || 1));
      break;
    }

    /* --- Imágenes -----------------------------------------------------
       El archivo se guarda y se borra en los manejadores de imagen:aparte,
       que es donde se puede tocar el disco. Aquí solo se renombra, que es lo
       único que no toca ningún archivo. */

    case 'image:rename': {
      const rv = data.reviews.find((x) => x.id === p.notaId);
      const im = rv && rv.imagenes.find((x) => x.id === p.id);
      if (!im) return { ok: false, error: 'Imagen desconocida' };
      const nombre = (p.nombre || '').trim();
      if (!nombre) return { ok: false, error: 'La imagen necesita un nombre' };
      // Dos imágenes del mismo papel no pueden llamarse igual: [[nombre]] no
      // sabría a cuál de las dos apunta.
      if (rv.imagenes.some((x) => x.id !== im.id &&
                                  x.nombre.toLowerCase() === nombre.toLowerCase()))
        return { ok: false, error: 'Este papel ya tiene una imagen con ese nombre' };
      im.nombre = nombre.slice(0, 60);
      rv.updatedAt = new Date().toISOString();
      break;
    }

    // --- Life ---------------------------------------------------------

    case 'area:add': {
      const name = (p.name || '').trim();
      if (!name) return { ok: false, error: 'Nombre vacío' };
      data.areas.push({ id: uid('ar'), name, color: p.color || '#5b5bd6' });
      break;
    }
    case 'area:update': {
      const a = data.areas.find((x) => x.id === p.id);
      if (a) {
        if (typeof p.name === 'string' && p.name.trim()) a.name = p.name.trim();
        if (p.color) a.color = p.color;
      }
      break;
    }
    case 'area:remove': {
      // Se lleva consigo todo lo que colgaba del ámbito. Es destructivo a
      // propósito: dejar paradigmas huérfanos invisibles sería peor.
      data.areas = data.areas.filter((x) => x.id !== p.id);
      data.paradigms = data.paradigms.filter((x) => x.areaId !== p.id);
      data.strategies = data.strategies.filter((x) => x.areaId !== p.id);
      delete data.life[p.id];
      break;
    }

    case 'life:setDiagnosis': {
      if (!data.life[p.areaId]) data.life[p.areaId] = { diagnosis: '', updatedAt: null };
      data.life[p.areaId].diagnosis = String(p.text || '');
      data.life[p.areaId].updatedAt = new Date().toISOString();
      break;
    }

    case 'paradigm:add': {
      const text = (p.text || '').trim();
      if (!text) return { ok: false, error: 'Texto vacío' };
      data.paradigms.push({
        id: uid('pg'),
        areaId: p.areaId,
        kind: p.kind === 'build' ? 'build' : 'drop',
        text,
        createdAt: new Date().toISOString(),
        doneAt: null
      });
      break;
    }
    case 'paradigm:toggle': {
      const pg = data.paradigms.find((x) => x.id === p.id);
      if (pg) pg.doneAt = pg.doneAt ? null : new Date().toISOString();
      break;
    }
    case 'paradigm:remove': {
      data.paradigms = data.paradigms.filter((x) => x.id !== p.id);
      break;
    }

    case 'strategy:add': {
      const text = (p.text || '').trim();
      if (!text) return { ok: false, error: 'Texto vacío' };
      data.strategies.push({
        id: uid('st'),
        areaId: p.areaId,
        text,
        source: (p.source || '').trim(),
        status: 'probando',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      break;
    }
    case 'strategy:setStatus': {
      const st = data.strategies.find((x) => x.id === p.id);
      if (st && ['probando', 'funciona', 'descartada'].indexOf(p.status) !== -1) {
        st.status = p.status;
        st.updatedAt = new Date().toISOString();
      }
      break;
    }
    case 'strategy:remove': {
      data.strategies = data.strategies.filter((x) => x.id !== p.id);
      break;
    }

    /* --- Eventos ------------------------------------------------------
       Una entrega, una reunion, un examen. No se cumple: llega. */

    case 'event:add':
    case 'event:update': {
      const nuevo = action.type === 'event:add';
      const ev = nuevo ? null : data.events.find((x) => x.id === p.id);
      if (!nuevo && !ev) return { ok: false, error: 'Evento desconocido' };

      const title = typeof p.title === 'string' ? p.title.trim() : (ev ? ev.title : '');
      if (!title) return { ok: false, error: 'El evento necesita un título' };

      const date = typeof p.date === 'string' ? p.date : (ev ? ev.date : '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
        return { ok: false, error: 'Fecha no válida' };

      const time = typeof p.time === 'string' ? p.time.trim() : (ev ? ev.time : '');
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
        return { ok: false, error: 'La hora se escribe como 16:30' };

      const avisar = typeof p.avisarMin !== 'undefined'
        ? Math.min(10080, Math.max(-1, Math.round(Number(p.avisarMin) || 0)))
        : (ev ? ev.avisarMin : 0);

      const campos = {
        title,
        date,
        time,
        note: typeof p.note === 'string' ? p.note : (ev ? ev.note : ''),
        avisarMin: avisar
      };

      if (nuevo) {
        data.events.push(Object.assign({
          id: uid('ev'),
          avisadoAt: null,
          createdAt: new Date().toISOString()
        }, campos));
      } else {
        /* Cambiar cuando es o cuando avisa vuelve a armar el aviso: si no,
           mover una reunion de las 9 a las 18 dejaria el aviso dado por las
           9 y no sonaria nunca a la hora nueva. */
        const movido = ev.date !== campos.date || ev.time !== campos.time ||
                       ev.avisarMin !== campos.avisarMin;
        Object.assign(ev, campos);
        if (movido) ev.avisadoAt = null;
        ev.updatedAt = new Date().toISOString();
      }
      break;
    }

    case 'event:remove': {
      data.events = data.events.filter((x) => x.id !== p.id);
      break;
    }

    case 'settings:update': {
      Object.assign(data.settings, p);
      // El arranque con Windows no es solo un dato guardado: hay que decirselo
      // al sistema en el momento, o la casilla mentiria hasta el proximo inicio.
      if (typeof p.arrancarConWindows !== 'undefined') {
        aplicarArranqueConWindows(p.arrancarConWindows);
      }
      break;
    }

    default:
      return { ok: false, error: 'Accion desconocida: ' + action.type };
  }

  store.save();
  broadcast();
  // Devolvemos el estado ya actualizado: el renderer lo aplica al resolverse
  // la promesa, sin depender de que el evento 'state' llegue antes.
  return { ok: true, data: data };
});

// --- Ventanas -------------------------------------------------------------

ipcMain.handle('widget:setVisible', (_e, { visible }) => {
  setWidgetVisible(visible);
  return { ok: true };
});

ipcMain.handle('window:focusMain', () => {
  if (!mainWindow) createMainWindow();
  else {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
  return { ok: true };
});

/* Convierte el HTML del resumen en un PNG.

   Se renderiza en una ventana oculta propia en vez de capturar un trozo de la
   ventana principal: así el resumen tiene su ancho fijo y su composición
   propia, sin depender de cómo tenga el usuario la ventana en ese momento. */
ipcMain.handle('export:image', async (_e, { html, nombre }) => {
  const tmpDir = path.join(app.getPath('temp'), 'flow-export');
  const tmpFile = path.join(tmpDir, 'resumen-' + Date.now() + '.html');
  let win = null;

  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(tmpFile, html, 'utf8');

    win = new BrowserWindow({
      width: 908,
      height: 900,
      show: false,
      // El resumen lleva los tokens del tema activo, así que el fondo de la
      // ventana tiene que coincidir: si no, la captura sale con un marco del
      // color contrario alrededor del contenido.
      backgroundColor: fondoVentana(),
      webPreferences: { offscreen: false, backgroundThrottling: false }
    });

    await win.loadFile(tmpFile);
    // Margen para que las fuentes de Google terminen de cargar; con la
    // fuente de reserva el ancho de los textos cambia y descuadra el diseño.
    await new Promise((r) => setTimeout(r, 900));

    // La altura la decide el contenido, no una constante.
    const alto = await win.webContents.executeJavaScript(
      'Math.ceil(document.body.getBoundingClientRect().height)'
    );
    win.setContentSize(908, Math.max(200, Math.min(4000, alto)));
    await new Promise((r) => setTimeout(r, 250));

    const img = await win.webContents.capturePage();
    if (img.isEmpty()) return { ok: false, error: 'La captura salió vacía' };

    clipboard.writeImage(img);
    return {
      ok: true,
      dataUrl: img.toDataURL(),
      png: img.toPNG().toString('base64'),
      nombre: nombre || 'flow-resumen.png'
    };
  } catch (err) {
    return { ok: false, error: err.message };
  } finally {
    if (win && !win.isDestroyed()) win.destroy();
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }
});

ipcMain.handle('export:save', async (_e, { png, nombre }) => {
  const res = await dialog.showSaveDialog({
    title: 'Guardar resumen',
    defaultPath: nombre || 'flow-resumen.png',
    filters: [{ name: 'Imagen PNG', extensions: ['png'] }]
  });
  if (res.canceled || !res.filePath) return { ok: false, cancelado: true };
  try {
    fs.writeFileSync(res.filePath, Buffer.from(png, 'base64'));
    shell.showItemInFolder(res.filePath);
    return { ok: true, ruta: res.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('data:reveal', () => {
  shell.showItemInFolder(store.getFilePath());
  return { ok: true };
});

/* --- Imágenes de los papeles ------------------------------------------------

   Los archivos viven sueltos en <datos>/imagenes/, no dentro del JSON. Meter
   capturas en base64 dentro del archivo de datos lo haría crecer a decenas de
   megas, y como cada guardado reescribe el archivo entero, apuntar una línea de
   texto pasaría a costar reescribir todas las imágenes de todos los papeles.

   Se leen bajo demanda y se devuelven como data URL en vez de servir file://.
   Así la Content-Security-Policy de la ventana sigue igual de cerrada —solo
   'self' y data:— y no hay que abrirle al renderer una puerta al disco. */

function carpetaImagenes() {
  const dir = path.join(path.dirname(store.getFilePath()), 'imagenes');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const TIPOS_IMAGEN = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp' };

function borrarArchivosDeImagen(lista) {
  for (const im of lista || []) {
    if (!im || !im.archivo) continue;
    // Un borrado que falla no puede impedir borrar el papel: como mucho deja
    // un archivo huérfano, que es mucho menos grave que un papel inmortal.
    try { fs.unlinkSync(path.join(carpetaImagenes(), path.basename(im.archivo))); } catch (_) {}
  }
}

// Nombre libre dentro del papel: "captura", "captura 2"…
function nombreLibre(nota, base) {
  const limpio = String(base || 'imagen').slice(0, 50).trim() || 'imagen';
  const usados = nota.imagenes.map((x) => x.nombre.toLowerCase());
  if (usados.indexOf(limpio.toLowerCase()) === -1) return limpio;
  for (let i = 2; i < 500; i++) {
    const cand = limpio + ' ' + i;
    if (usados.indexOf(cand.toLowerCase()) === -1) return cand;
  }
  return limpio + ' ' + Date.now();
}

function guardarImagen(notaId, nombre, dataUrl) {
  const data = store.get();
  const nota = data.reviews.find((r) => r.id === notaId);
  if (!nota) return { ok: false, error: 'Papel desconocido' };

  const m = /^data:([^;,]+)(;base64)?,/.exec(String(dataUrl || ''));
  const ext = m && TIPOS_IMAGEN[m[1]];
  if (!ext) return { ok: false, error: 'Eso no es una imagen que Flow sepa guardar' };

  const bytes = Buffer.from(String(dataUrl).slice(m[0].length), 'base64');
  if (!bytes.length) return { ok: false, error: 'La imagen llegó vacía' };

  const id = uid('im');
  const archivo = id + '.' + ext;
  try {
    fs.writeFileSync(path.join(carpetaImagenes(), archivo), bytes);
  } catch (err) {
    return { ok: false, error: 'No se pudo guardar la imagen: ' + err.message };
  }

  const imagen = { id: id, nombre: nombreLibre(nota, nombre), archivo: archivo };
  nota.imagenes.push(imagen);
  nota.updatedAt = new Date().toISOString();
  store.save();
  broadcast();
  return { ok: true, imagen: imagen, data: store.get() };
}

ipcMain.handle('imagen:pegar', (_e, { notaId, nombre, dataUrl }) =>
  guardarImagen(notaId, nombre, dataUrl));

ipcMain.handle('imagen:elegir', async (_e, { notaId }) => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Elegir imagen',
    properties: ['openFile'],
    filters: [{ name: 'Imágenes', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
  });
  if (res.canceled || !res.filePaths.length) return { ok: false, cancelado: true };

  const ruta = res.filePaths[0];
  const ext = path.extname(ruta).slice(1).toLowerCase();
  const tipo = Object.keys(TIPOS_IMAGEN).find((t) => TIPOS_IMAGEN[t] === (ext === 'jpeg' ? 'jpg' : ext));
  if (!tipo) return { ok: false, error: 'Ese formato no se puede guardar' };

  try {
    const b64 = fs.readFileSync(ruta).toString('base64');
    // El nombre del archivo sin extensión es el mejor nombre por defecto:
    // "diagrama-flujo.png" se enlaza como [[diagrama-flujo]].
    return guardarImagen(notaId, path.basename(ruta, path.extname(ruta)),
      'data:' + tipo + ';base64,' + b64);
  } catch (err) {
    return { ok: false, error: 'No se pudo leer el archivo: ' + err.message };
  }
});

ipcMain.handle('imagen:leer', (_e, { notaId, id }) => {
  const nota = store.get().reviews.find((r) => r.id === notaId);
  const im = nota && nota.imagenes.find((x) => x.id === id);
  if (!im) return { ok: false, error: 'Imagen desconocida' };
  try {
    const ruta = path.join(carpetaImagenes(), path.basename(im.archivo));
    const ext = path.extname(im.archivo).slice(1).toLowerCase();
    const tipo = Object.keys(TIPOS_IMAGEN).find((t) => TIPOS_IMAGEN[t] === ext) || 'image/png';
    return { ok: true, dataUrl: 'data:' + tipo + ';base64,' + fs.readFileSync(ruta).toString('base64') };
  } catch (err) {
    /* El archivo puede no estar: copiar la carpeta de datos a otro sitio sin
       llevarse imagenes/, por ejemplo. Se dice claro en vez de dejar un hueco
       en blanco que parezca un fallo de la app. */
    return { ok: false, error: 'El archivo de esta imagen ya no está en disco' };
  }
});

ipcMain.handle('imagen:borrar', (_e, { notaId, id }) => {
  const data = store.get();
  const nota = data.reviews.find((r) => r.id === notaId);
  const im = nota && nota.imagenes.find((x) => x.id === id);
  if (!im) return { ok: false, error: 'Imagen desconocida' };
  borrarArchivosDeImagen([im]);
  nota.imagenes = nota.imagenes.filter((x) => x.id !== id);
  nota.updatedAt = new Date().toISOString();
  store.save();
  broadcast();
  return { ok: true, data: store.get() };
});

ipcMain.handle('data:import', async (_e, { json }) => {
  // Importa el localStorage del Poker HQ v1 (actividades + días planificados).
  try {
    const parsed = typeof json === 'string' ? JSON.parse(json) : json;
    const data = store.get();
    let addedActs = 0;
    let addedItems = 0;

    if (Array.isArray(parsed.activities)) {
      for (const name of parsed.activities) {
        if (typeof name !== 'string' || !name.trim()) continue;
        if (data.activities.some((a) => a.name.toLowerCase() === name.toLowerCase())) continue;
        data.activities.push({ id: uid('a'), name: name.trim(), color: '#8B8B8B' });
        addedActs++;
      }
    }

    if (parsed.days && typeof parsed.days === 'object') {
      for (const [date, items] of Object.entries(parsed.days)) {
        if (!Array.isArray(items)) continue;
        for (const it of items) {
          const act = data.activities.find(
            (a) => a.name.toLowerCase() === String(it.name || '').toLowerCase()
          );
          if (!act) continue;
          if (!data.plan[date]) data.plan[date] = [];
          data.plan[date].push({
            id: uid('p'),
            activityId: act.id,
            spotId: null,
            plannedMins: Number(it.mins) || 60
          });
          addedItems++;
        }
      }
    }

    store.save();
    broadcast();
    return { ok: true, addedActs, addedItems };
  } catch (err) {
    return { ok: false, error: 'JSON invalido: ' + err.message };
  }
});
