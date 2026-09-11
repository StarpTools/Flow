const fs = require('fs');
const path = require('path');
/* Solo para el recuento de palabras de la migración a v8: decide si una nota
   vieja era de verdad una tarjeta o era teoría. Mismo umbral que el aviso del
   editor, y una sola fuente de verdad. */
const notas = require('./app/js/notas.js');

// Persistencia en un único archivo JSON. Escritura atomica: escribimos a un
// temporal y renombramos, para que un corte de luz a mitad de guardado no
// deje el archivo a medias.

let filePath = null;
let data = null;
let writeTimer = null;

/* Los mismos categóricos que --cat-1..10 de la hoja de estilos. Van repetidos
   aquí porque el proceso principal no lee CSS, y un spot necesita su color en
   el momento en que se crea. */
const COLORES = [
  '#5b5bd6', '#12805c', '#d97706', '#0891b2', '#be185d',
  '#7c3aed', '#15803d', '#c2410c', '#0369a1', '#9f1239'
];

const DEFAULTS = {
  version: 9,
  /* kind 'timed' -> se cronometra y se agenda en el calendario.
     kind 'daily' -> dato numérico que anotas una vez al día, sin cronómetro.
                     Dormir no se cronometra: se registra por la mañana. */
  activities: [
    { id: 'a-coach', name: 'Coach', color: '#3ECF8E', kind: 'timed' },
    { id: 'a-anki', name: 'Anki', color: '#6E8AFF', kind: 'timed' },
    { id: 'a-leak', name: 'Leak Finder', color: '#F5A623', kind: 'timed' },
    { id: 'a-hand', name: 'Hand Review', color: '#B07CFF', kind: 'timed' },
    { id: 'a-teoria', name: 'Teoría', color: '#FF7A7A', kind: 'timed' },
    { id: 'a-juego', name: 'Jugar', color: '#41C4E0', kind: 'timed' },
    { id: 'a-sueno', name: 'Dormir', color: '#8B7CD6', kind: 'daily', target: 7, unit: 'h' }
  ],
  /* --- La oficina -------------------------------------------------------

     Estudio se recorre como una oficina, y cada nivel es una colección:

       estante  → spotGroups   (Programación, Diseño…)
       cajón    → spots        el TEMA: "Git y control de versiones"
       carpeta  → noteTypes    el apartado: "Comandos", "Ramas y merge"
       papel    → reviews      la nota, con su teoría, sus imágenes y sus
                               tarjetas dentro

     El estante no se "abre": es un desplegable en la cabecera. Con dos o tres
     estantes, obligar a entrar y salir de ellos son dos clics de peaje en cada
     viaje; el desplegable cambia de estante sin volver al principio. */
  spotGroups: [
    { id: 'sg-estudio', name: 'Estudio' }
  ],

  // { id, name, note, color, groupId, createdAt, archived }
  spots: [],
  // plan['2026-08-23'] = [{ id, activityId, spotId, plannedMins }]
  plan: {},
  sessions: [],
  results: [],

  /* Las CARPETAS de cada tema. Un solo nivel a propósito: una oficina con
     carpetas dentro de carpetas se ordena una vez y no se vuelve a tocar.

     spotId es el tema al que pertenece la carpeta. null = General, para los
     papeles que no son de ningún tema. Las carpetas NO se comparten entre
     temas: dos temas pueden tener los dos una "Ejercicios" y son dos carpetas
     distintas. Renombrar una no toca la otra.

     Un tema nuevo nace sin carpetas: sembrar un curso de diseño con las
     carpetas de otro de programación es exactamente lo que esto evita. */
  noteTypes: [],

  /* Los PAPELES. Cada uno es un documento con tres cosas dentro:

       text       la teoría, en el markdown recortado de app/js/notas.js. Se
                  guarda en texto plano: dentro de diez años esta nota se
                  seguirá leyendo con el bloc de notas de Windows.

       imagenes   [{ id, nombre, archivo }] — los archivos viven sueltos en
                  <datos>/imagenes/. Se enlazan desde el texto con [[nombre]]
                  y salen en el panel de la derecha al hacer clic, sin tapar
                  lo que estabas leyendo.

       tarjetas   [{ id, pregunta, respuesta, ef, reps, interval, lapses, due,
                     ultimoRepaso, historial }]
                  Aquí vive la repetición espaciada. El papel NO es una
                  tarjeta: es el documento, y sus tarjetas cuelgan de él con
                  un calendario cada una.

     Por qué separadas de la teoría: un resumen de clase entero no se puede
     puntuar de 0 a 5 —siempre recuerdas una parte— y su dificultad acaba
     siendo la del hecho más difícil, así que lo que ya sabes vuelve al ritmo
     de lo que no. Una tarjeta, una cosa, contestable en diez segundos.

     { id, title, text, typeId, spotId, imagenes, tarjetas,
       createdAt, updatedAt } */
  reviews: [],

  /* Eventos. Un evento NO es plan: el plan son horas que cumples o no, y un
     evento es un punto en el tiempo que simplemente llega — una entrega, una
     reunión. Por eso no entra en ninguna cuenta de cumplimiento.

     { id, date:'2026-09-15', time:'16:00'|'', title, note,
       avisarMin, avisadoAt } */
  events: [],

  // daily['2026-08-23']['a-sueno'] = 7.5
  daily: {},
  // restDays['2026-08-29'] = true. Un día de descanso elegido no es un hueco:
  // queda fuera de todas las cuentas de cumplimiento a propósito.
  restDays: {},

  // --- Life -----------------------------------------------------------
  // Ámbitos de vida. Editables: los siete de fábrica son un punto de
  // partida, no una camisa de fuerza.
  areas: [
    { id: 'ar-trabajo', name: 'Trabajo', color: '#5b5bd6' },
    { id: 'ar-personal', name: 'Vida personal', color: '#0891b2' },
    { id: 'ar-familia', name: 'Familia', color: '#12805c' },
    { id: 'ar-salud', name: 'Salud', color: '#d97706' },
    { id: 'ar-pareja', name: 'Novia / Esposa', color: '#be185d' },
    { id: 'ar-lectura', name: 'Lectura', color: '#7c3aed' },
    { id: 'ar-hijos', name: 'Hijos / Mascotas', color: '#c2410c' }
  ],
  // life[areaId] = { diagnosis, updatedAt }
  life: {},
  // { id, areaId, kind: 'drop' | 'build', text, createdAt, doneAt }
  paradigms: [],
  // { id, areaId, text, source, status: 'probando'|'funciona'|'descartada', ... }
  strategies: [],
  settings: {
    checkinMinMin: 10,
    checkinMaxMin: 20,
    checkinGraceSec: 120,
    widgetEnabled: true,
    // 'system' | 'light' | 'dark'
    theme: 'system',
    /* Carpeta donde dejar una copia completa — datos e imágenes — fuera de
       %APPDATA%. Un USB, Drive, otro disco: cualquier sitio que no se muera
       con este. Los respaldos de al lado del archivo no protegen de que se
       pierda la carpeta entera, que es el fallo que se lo lleva todo. */
    carpetaRespaldo: null,
    // Cuando se hizo la ultima copia completa, para no repetirla cada arranque.
    ultimaCopiaExterna: null,
    /* Flow se abre solo al iniciar sesión, escondido en el widget. Es lo que
       convierte los avisos de los eventos en avisos de verdad: si dependen de
       que te acuerdes de abrir la app, el día que importa no está abierta. */
    arrancarConWindows: false,
    // { x, y, width, height } del último cierre. null = calcular por pantalla.
    windowBounds: null
  }
};

/* Respaldos rotativos. Se hace UNA copia al abrir la app, antes de tocar
   nada, y se conservan las cinco últimas.

   Por qué al abrir y no al cerrar: si algo va mal durante la sesión (un fallo,
   un borrado por error, una versión con un bug), la copia de esta mañana está
   intacta. Una copia hecha al cerrar ya tendría el estropicio dentro. */
/* Cuantas copias se conservan, y de que forma.

   Contar archivos a secas no protege: abrir Flow cinco veces seguidas
   gastaba las cinco plazas en el mismo dia — en un caso real, tres copias
   identicas hechas en 17 segundos — y la profundidad entera se iba con ello.
   Lo que hace falta es tiempo cubierto, no numero de archivos: las ultimas
   pase lo que pase, y ademas una por dia de la ultima semana. */
const COPIAS_RECIENTES = 3;
const DIAS_GUARDADOS = 7;

const PREFIJO_RESPALDO = 'flow-data.respaldo-';

// El sello va en hora LOCAL: es la que lees tu al elegir cual restaurar, y la
// que agrupa bien por dia (en UTC, una copia de las 20:00 cae al dia siguiente).
function selloLocal(d) {
  const n = (x) => String(x).padStart(2, '0');
  return d.getFullYear() + '-' + n(d.getMonth() + 1) + '-' + n(d.getDate()) +
    '-' + n(d.getHours()) + '-' + n(d.getMinutes()) + '-' + n(d.getSeconds());
}

function listaRespaldos(dir) {
  return fs.readdirSync(dir)
    .filter((f) => f.indexOf(PREFIJO_RESPALDO) === 0 && f.slice(-5) === '.json')
    .sort();
}

/* Que copias se quedan: las COPIAS_RECIENTES ultimas, y la mas nueva de cada
   uno de los ultimos DIAS_GUARDADOS dias. Lo demas sobra. */
function cualesSeQuedan(nombres) {
  const quedan = new Set(nombres.slice(-COPIAS_RECIENTES));
  const porDia = new Map();
  for (const f of nombres) porDia.set(f.slice(PREFIJO_RESPALDO.length, PREFIJO_RESPALDO.length + 10), f);
  for (const f of [...porDia.values()].slice(-DIAS_GUARDADOS)) quedan.add(f);
  return quedan;
}

function respaldar() {
  if (!fs.existsSync(filePath)) return;
  try {
    const dir = path.dirname(filePath);
    const previas = listaRespaldos(dir);

    /* Si nada ha cambiado desde la ultima copia, no se hace otra. Abrir y
       cerrar la app tres veces no puede costar tres plazas del historial. */
    const ultima = previas[previas.length - 1];
    if (ultima) {
      try {
        const a = fs.statSync(filePath);
        const b = fs.statSync(path.join(dir, ultima));
        if (a.size === b.size &&
            fs.readFileSync(filePath).equals(fs.readFileSync(path.join(dir, ultima)))) {
          return;
        }
      } catch (_) { /* si no se puede comparar, se copia igual */ }
    }

    /* El sello llega al segundo, y dos copias del mismo segundo compartirian
       nombre: la segunda pisaria a la primera sin decir nada. Pasa en cuanto
       algo abre el almacen dos veces seguidas — restaurar, por ejemplo, que
       respalda justo antes de pisar. */
    let nombre = PREFIJO_RESPALDO + selloLocal(new Date());
    for (let n = 2; fs.existsSync(path.join(dir, nombre + '.json')); n++) {
      nombre = PREFIJO_RESPALDO + selloLocal(new Date()) + '-' + n;
    }
    fs.copyFileSync(filePath, path.join(dir, nombre + '.json'));

    const quedan = cualesSeQuedan(listaRespaldos(dir));
    for (const f of listaRespaldos(dir)) {
      if (!quedan.has(f)) { try { fs.unlinkSync(path.join(dir, f)); } catch (_) {} }
    }
  } catch (err) {
    // Un respaldo que falla no puede impedir que la app arranque.
    console.error('No se pudo respaldar:', err.message);
  }
}

/* Las copias que hay, con lo que hace falta para elegir una sin abrirla.
   Lee cada archivo: son pocos y pequenos, y adivinar por el nombre cuantos
   papeles lleva dentro no se puede. */
function respaldos() {
  if (!filePath) return [];
  const dir = path.dirname(filePath);
  let nombres = [];
  try { nombres = listaRespaldos(dir); } catch (_) { return []; }

  return nombres.reverse().map((f) => {
    const ruta = path.join(dir, f);
    const out = { archivo: f, ruta: ruta, bytes: 0, papeles: null, guardado: null };
    try {
      out.bytes = fs.statSync(ruta).size;
      const d = JSON.parse(fs.readFileSync(ruta, 'utf8'));
      out.papeles = Array.isArray(d.reviews) ? d.reviews.length : null;
      out.imagenes = (d.reviews || []).reduce((n, r) => n + ((r.imagenes || []).length), 0);
      out.guardado = (d.settings && d.settings.ultimoGuardado) || null;
    } catch (_) { /* una copia ilegible se lista igual, para poder verla */ }
    return out;
  });
}

/* Restaurar una copia. Antes de pisar nada se guarda lo que hay ahora: si la
   copia elegida no era la que creias, la de ahora sigue estando. */
function restaurar(ruta) {
  if (!filePath) return { ok: false, error: 'El almacen no esta abierto' };
  try {
    const crudo = fs.readFileSync(ruta, 'utf8');
    JSON.parse(crudo);        // que sea legible ANTES de tocar el archivo vivo
    respaldar();
    fs.writeFileSync(filePath + '.tmp', crudo, 'utf8');
    fs.renameSync(filePath + '.tmp', filePath);
    data = migrate(JSON.parse(crudo));
    flush();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/* Retroceso: el archivo que acabamos de cargar es ANTERIOR a lo ultimo que
   Flow guardo. Pasa cuando algo de fuera lo sustituye por una copia vieja —
   un restaurador, un sincronizador, o copiar un respaldo a mano por el
   Explorador. La app no puede impedirlo, pero callarselo es lo peor: cargaria
   tan tranquila y seguirias trabajando sobre el archivo equivocado. */
function detectarRetroceso() {
  const mio = (data.settings && data.settings.ultimoGuardado) || null;
  let masNuevo = null;
  for (const r of respaldos()) {
    if (r.guardado && (!masNuevo || r.guardado > masNuevo.guardado)) masNuevo = r;
  }
  if (!masNuevo) return null;
  if (mio && mio >= masNuevo.guardado) return null;
  return { ahora: mio, copia: masNuevo.guardado, archivo: masNuevo.archivo };
}

function init(userDataPath) {
  filePath = path.join(userDataPath, 'flow-data.json');
  respaldar();
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    data = migrate(JSON.parse(raw));
  } catch (err) {
    if (err.code !== 'ENOENT') {
      // El archivo existe pero esta corrupto. Lo apartamos en vez de borrarlo:
      // los datos de meses de trabajo no se tiran a la basura en silencio.
      const backup = filePath + '.corrupto-' + Date.now();
      try {
        fs.renameSync(filePath, backup);
        console.error('Datos ilegibles. Copia preservada en:', backup);
      } catch (_) {}
    }
    data = JSON.parse(JSON.stringify(DEFAULTS));
    flush();
  }
  data._retroceso = detectarRetroceso();
  return data;
}

/* --- Saneado al cargar ----------------------------------------------------

   Un registro mal formado no se ve: se propaga. Una sesión sin countedSec
   convierte en NaN todos los totales de la app, y rastrear de dónde salió ese
   NaN es de lo más caro que hay. Por eso se valida CADA registro al abrir el
   archivo, una sola vez, en vez de defenderse en los cien sitios que lo leen.

   La regla es: arreglar cuando se puede, descartar solo lo inservible. Perder
   un registro es malo; mostrar cuentas falsas durante meses es peor. */

function num(v, porDefecto) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && isFinite(n) ? n : porDefecto;
}

function esFecha(s) {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function sanear(d) {
  const parte = [];
  const contar = (arr, nombre, fn) => {
    const antes = arr.length;
    const out = arr.filter(fn);
    if (out.length !== antes) parte.push(antes - out.length + ' ' + nombre);
    return out;
  };

  d.activities = contar(d.activities, 'actividades', (a) => a && a.id && a.name);
  d.activities.forEach((a) => {
    // Las de antes de v4 no traen kind: son todas cronometradas.
    a.kind = a.kind === 'daily' ? 'daily' : 'timed';
    if (a.kind === 'daily') a.target = Math.max(0.01, num(a.target, 1));
  });

  d.spotGroups = contar(d.spotGroups, 'estantes', (g) => g && g.id && g.name);
  d.spotGroups.forEach((g) => {
    g.name = String(g.name).slice(0, 60);
    // `dinero` murió con el poker: ya no hay dos clases de tema.
    delete g.dinero;
  });
  const gruposVivos = d.spotGroups.map((g) => g.id);

  d.spots = contar(d.spots, 'temas', (s) => s && s.id && s.name);
  d.spots.forEach((s, i) => {
    // Un estante borrado deja al tema sin estante, no invisible.
    if (!s.groupId || gruposVivos.indexOf(s.groupId) === -1) s.groupId = null;
    // Sin color no hay señal visual de en qué tema estás escribiendo, que es
    // justo lo que evita volver a mezclar apuntes de dos materias distintas.
    if (typeof s.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(s.color)) {
      s.color = COLORES[i % COLORES.length];
    }
  });
  d.areas = contar(d.areas, 'ámbitos', (a) => a && a.id && a.name);

  // Sin fecha o sin id una sesión no se puede ni mostrar ni borrar.
  d.sessions = contar(d.sessions, 'sesiones', (s) => s && s.id && esFecha(s.date));
  d.sessions.forEach((s) => {
    s.countedSec = Math.max(0, num(s.countedSec, 0));
    s.unverifiedSec = Math.min(s.countedSec, Math.max(0, num(s.unverifiedSec, 0)));
    s.checkinsAsked = Math.max(0, num(s.checkinsAsked, 0));
    s.checkinsConfirmed = Math.max(0, num(s.checkinsConfirmed, 0));
  });

  d.results = contar(d.results, 'resultados', (r) => r && r.id && esFecha(r.date));
  d.results.forEach((r) => {
    r.hands = Math.max(0, num(r.hands, 0));
    r.profit = num(r.profit, 0);
  });

  const spotsVivos = d.spots.map((s) => s.id);

  d.noteTypes = contar(d.noteTypes, 'tipos de lógica', (t) => t && t.id && t.name);
  d.noteTypes.forEach((t) => {
    t.name = String(t.name).slice(0, 60);
    if (typeof t.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(t.color)) t.color = '#5b5bd6';
    // Una carpeta de un tema que ya no existe se queda sin tema, y la pantalla
    // de papeles sueltos la enseña para poder borrarla.
    if (!t.spotId || spotsVivos.indexOf(t.spotId) === -1) t.spotId = null;
  });

  /* Las notas son las más delicadas de sanear: un intervalo o un EF corrupto
     no se ve hoy, se ve dentro de meses cuando una lógica deja de aparecer o
     aparece a diario para siempre.

     Se descarta por el título, no por el cuerpo: una nota sin cuerpo es una
     tarjeta legítima (título = la pregunta), pero una sin título no se puede
     ni mostrar en la lista ni preguntar en Hoy. */
  d.reviews = contar(d.reviews, 'notas',
    (r) => r && r.id && typeof r.title === 'string' && r.title.trim());
  d.reviews.forEach((r) => {
    if (typeof r.text !== 'string') r.text = '';

    // Un papel de un tema borrado se queda sin tema, y lo recoge la pantalla de
    // papeles sueltos. Ahí se vuelve a colocar; sin ella sería irrecuperable.
    if (!r.spotId || spotsVivos.indexOf(r.spotId) === -1) r.spotId = null;

    /* El apartado tiene que ser del MISMO ámbito que la nota. Es la regla que
       hace imposible mezclar: si no se comprueba aquí, un archivo editado a
       mano o una versión vieja puede dejar una nota de git clasificada en un
       apartado de un spot de poker, y esa nota aparecería en los dos sitios. */
    if (r.typeId) {
      const t = d.noteTypes.find((x) => x.id === r.typeId);
      if (!t || (t.spotId || null) !== r.spotId) r.typeId = null;
    } else {
      r.typeId = null;
    }
    /* Las imágenes del papel. El archivo vive suelto en disco, en la carpeta
       de datos: meter capturas dentro del JSON lo haría crecer a decenas de
       megas y cada guardado tendría que reescribirlas todas.

       `nombre` es por lo que se enlazan desde el texto con [[nombre]]. Dos
       imágenes del mismo papel no pueden llamarse igual, o el enlace no
       sabría a cuál apunta. */
    if (!Array.isArray(r.imagenes)) r.imagenes = [];
    const nombresImg = [];
    r.imagenes = r.imagenes.filter((im) => {
      if (!im || !im.id || typeof im.archivo !== 'string' || !im.archivo) return false;
      im.nombre = String(im.nombre || im.id).slice(0, 60).trim() || im.id;
      if (nombresImg.indexOf(im.nombre.toLowerCase()) !== -1) return false;
      nombresImg.push(im.nombre.toLowerCase());
      return true;
    });

    /* Las tarjetas del papel. Aquí vive AHORA la repetición espaciada: el
       papel es el documento y cada tarjeta tiene su propio calendario.

       Es lo delicado de sanear: un intervalo o un EF corrupto no se ve hoy,
       se ve dentro de meses cuando una tarjeta deja de aparecer o aparece a
       diario para siempre. */
    if (!Array.isArray(r.tarjetas)) r.tarjetas = [];
    r.tarjetas = r.tarjetas.filter(
      (c) => c && c.id && typeof c.pregunta === 'string' && c.pregunta.trim());
    r.tarjetas.forEach((c) => {
      if (typeof c.respuesta !== 'string') c.respuesta = '';
      c.ef = Math.min(4, Math.max(1.3, num(c.ef, 2.5)));
      c.reps = Math.max(0, Math.round(num(c.reps, 0)));
      c.interval = Math.min(730, Math.max(0, Math.round(num(c.interval, 0))));
      c.lapses = Math.max(0, Math.round(num(c.lapses, 0)));
      // Sin fecha de vencimiento válida, toca hoy: es mejor un repaso de más
      // que una tarjeta que desaparece en silencio.
      if (!esFecha(c.due)) c.due = null;
      if (!Array.isArray(c.historial)) c.historial = [];
      c.historial = c.historial.filter((h) => h && esFecha(h.fecha));
    });

    // Restos del modelo viejo, cuando el papel era él mismo una tarjeta.
    delete r.repasar;
    delete r.sourceId;
    delete r.ef; delete r.reps; delete r.interval; delete r.lapses;
    delete r.due; delete r.ultimoRepaso; delete r.historial;
  });

  d.paradigms = contar(d.paradigms, 'paradigmas', (p) => p && p.id && typeof p.text === 'string');
  d.strategies = contar(d.strategies, 'estrategias', (s) => s && s.id && typeof s.text === 'string');
  d.strategies.forEach((s) => {
    if (['probando', 'funciona', 'descartada'].indexOf(s.status) === -1) s.status = 'probando';
  });

  /* Eventos. Se descarta por fecha y título, que es lo único sin lo que un
     evento no se puede ni pintar ni avisar. La hora sí puede faltar: es un
     evento de todo el día, y entonces el aviso se calcula desde las 9:00. */
  d.events = contar(d.events, 'eventos',
    (e) => e && e.id && esFecha(e.date) && typeof e.title === 'string' && e.title.trim());
  d.events.forEach((e) => {
    e.title = String(e.title).trim().slice(0, 120);
    e.note = typeof e.note === 'string' ? e.note.slice(0, 500) : '';
    // 'HH:MM' o nada. Una hora a medias avisaría a una hora inventada.
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(e.time || '')) e.time = '';
    // Minutos de antelación. -1 = sin aviso; el tope es una semana.
    e.avisarMin = Math.min(10080, Math.max(-1, Math.round(num(e.avisarMin, 0))));
    if (typeof e.avisadoAt !== 'string') e.avisadoAt = null;
  });

  // plan: fuera las fechas inválidas y los ítems sin duración utilizable.
  let planFuera = 0;
  for (const key of Object.keys(d.plan)) {
    if (!esFecha(key) || !Array.isArray(d.plan[key])) {
      delete d.plan[key];
      planFuera++;
      continue;
    }
    const antes = d.plan[key].length;
    d.plan[key] = d.plan[key].filter((i) => i && i.id && i.activityId);
    d.plan[key].forEach((i) => { i.plannedMins = Math.max(1, num(i.plannedMins, 60)); });
    planFuera += antes - d.plan[key].length;
    if (!d.plan[key].length) delete d.plan[key];
  }
  if (planFuera) parte.push(planFuera + ' tareas agendadas');

  // daily: valores no numéricos fuera, que envenenarían las medias.
  for (const key of Object.keys(d.daily)) {
    if (!esFecha(key) || typeof d.daily[key] !== 'object') { delete d.daily[key]; continue; }
    for (const actId of Object.keys(d.daily[key])) {
      const v = num(d.daily[key][actId], null);
      if (v === null || v < 0) delete d.daily[key][actId];
      else d.daily[key][actId] = v;
    }
    if (!Object.keys(d.daily[key]).length) delete d.daily[key];
  }

  for (const key of Object.keys(d.restDays)) {
    if (!esFecha(key)) delete d.restDays[key];
  }

  return parte;
}

function migrate(loaded) {
  const out = Object.assign({}, JSON.parse(JSON.stringify(DEFAULTS)), loaded);
  out.settings = Object.assign({}, DEFAULTS.settings, loaded.settings || {});
  if (!Array.isArray(out.activities)) out.activities = DEFAULTS.activities.slice();
  if (!Array.isArray(out.spots)) out.spots = [];
  if (!Array.isArray(out.sessions)) out.sessions = [];
  if (!Array.isArray(out.results)) out.results = [];
  if (!out.plan || typeof out.plan !== 'object') out.plan = {};

  // Life llegó después: un archivo guardado antes no trae estos campos.
  // Los ámbitos de fábrica solo se siembran si nunca hubo ninguno, para no
  // resucitar los que el usuario haya borrado a propósito.
  if (!Array.isArray(out.areas)) out.areas = DEFAULTS.areas.slice();
  if (!out.life || typeof out.life !== 'object') out.life = {};
  if (!Array.isArray(out.paradigms)) out.paradigms = [];
  if (!Array.isArray(out.strategies)) out.strategies = [];

  /* v9: los eventos. El disparador es estructural, como siempre: no tener la
     lista. Un archivo de cualquier versión anterior entra aquí una sola vez. */
  if (!Array.isArray(out.events)) out.events = [];

  if (!out.daily || typeof out.daily !== 'object') out.daily = {};
  if (!out.restDays || typeof out.restDays !== 'object') out.restDays = {};
  if (!Array.isArray(out.reviews)) out.reviews = [];

  /* El bloc llegó en v5. Los tipos de fábrica entran solos porque un archivo
     de v4 no trae la clave; si el usuario los borra todos, el archivo guarda
     una lista vacía y esa lista vacía gana — borrarlos tiene que ser posible. */
  // Copia profunda, no slice(): slice comparte los objetos con DEFAULTS y
  // cualquier cambio posterior los dejaría contaminados para todo el proceso.
  if (!Array.isArray(out.noteTypes)) {
    out.noteTypes = JSON.parse(JSON.stringify(DEFAULTS.noteTypes));
  }

  /* v7: los spots se agrupan, y el grupo decide si el spot lleva dinero.

     Todos los spots que ya existían entran en "Poker" con dinero puesto: es
     exactamente lo que la app enseñaba antes, así que subir de versión no
     cambia ni una cifra de lo que ya estabas mirando. Mover un curso a un
     grupo sin dinero es una decisión tuya, no una adivinanza de la app a
     partir del nombre del spot. */
  if (!Array.isArray(out.spotGroups)) {
    out.spotGroups = JSON.parse(JSON.stringify(DEFAULTS.spotGroups));
  }

  /* El disparador son los SPOTS sin la clave groupId, no que falte la lista de
     grupos: DEFAULTS ya trae la lista, así que la clave nunca falta y ese
     "¿existe?" no se cumpliría jamás. Un spot sin groupId, en cambio, solo
     puede venir de una versión anterior a la v7. */
  const previos = out.spots.filter((s) => s && typeof s.groupId === 'undefined');
  if (previos.length) {
    let poker = out.spotGroups.filter((g) => g && g.id && g.dinero !== false)[0];
    if (!poker) {
      poker = { id: 'sg-poker', name: 'Poker', dinero: true };
      out.spotGroups.push(poker);
    }
    previos.forEach((s) => { s.groupId = poker.id; });
  }

  /* Hasta v4 una nota era una línea suelta en `text`. Ahora `title` es el
     anverso de la tarjeta y `text` el reverso, así que la línea de antes pasa
     a ser el título y el cuerpo nace vacío: es exactamente lo que se veía en
     Hoy antes del cambio, ni una tarjeta se comporta distinto.

     La condición es "no tiene title", no un número de versión: así vale
     también para un archivo que se quedó a medias entre dos versiones. */
  out.reviews.forEach((r) => {
    if (r && typeof r.title !== 'string') {
      r.title = typeof r.text === 'string' ? r.text : '';
      r.text = '';
    }
  });

  /* v6: los apartados dejan de ser globales y pasan a ser de cada ámbito.

     Hasta v5 un apartado se veía desde todos los spots, así que "Preflop"
     aparecía en el bloc de unos apuntes de git y "Rebase" en el de un spot de
     3-bet. Ahora cada spot tiene los suyos y no comparte ninguno.

     La migración copia cada apartado global a cada spot y reapunta las notas a
     la copia de SU spot. Se copia en vez de repartir porque repartir obligaría
     a decidir a qué spot "pertenece" un Postflop que usan tres, y la respuesta
     honesta es que a los tres. Las copias nacen iguales y a partir de ahí cada
     una va por su lado.

     El disparador es que exista un apartado sin la clave spotId, no un número
     de versión: así vale también para un archivo que se quedó a medias. */
  if (out.noteTypes.some((t) => t && typeof t.spotId === 'undefined')) {
    const globales = out.noteTypes.filter((t) => t && typeof t.spotId === 'undefined');
    globales.forEach((t) => { t.spotId = null; });

    // copias[spotId][idGlobal] = idDeLaCopia
    const copias = {};
    for (const sp of out.spots) {
      // El saneado todavía no ha pasado: la lista puede traer basura.
      if (!sp || !sp.id) continue;
      copias[sp.id] = {};
      for (const t of globales) {
        const nuevo = {
          id: 'nt' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          name: t.name,
          color: t.color,
          spotId: sp.id
        };
        copias[sp.id][t.id] = nuevo.id;
        out.noteTypes.push(nuevo);
      }
    }

    for (const r of out.reviews) {
      if (!r || !r.spotId || !r.typeId) continue;
      const mapa = copias[r.spotId];
      if (mapa && mapa[r.typeId]) r.typeId = mapa[r.typeId];
    }
  }

  /* El saneado va AQUÍ, antes que cualquier recorrido.

     Iba al final y era un error grave: si el archivo traía un null dentro de
     activities, el bucle de abajo reventaba con "cannot read kind of null",
     migrate lanzaba, y init lo interpretaba como archivo ilegible — apartaba
     el archivo entero y arrancaba de cero. Un solo registro malo te borraba
     meses de trabajo. Lo detectó tools/prueba-datos.js. */
  /* v8: el papel deja de ser una tarjeta y pasa a ser un documento con las
     suyas dentro.

     Hasta v7 cada nota era a la vez el documento y la tarjeta: su título era
     la pregunta y su cuerpo la respuesta. Eso obligaba a que un resumen de
     clase entero se puntuara como si fuera una tarjeta, que es justo lo que no
     funciona. Ahora el papel guarda la teoría y lleva sus tarjetas aparte.

     Dos conversiones, y ninguna pierde un solo calendario:

       1. Una nota sacada de otra (tenía sourceId) vuelve a su origen como
          tarjeta. Es literalmente lo que era: una tarjeta de ese papel que el
          modelo viejo no sabía guardar dentro.

       2. Cualquier otra nota que estuviera en repaso se convierte en un papel
          con UNA tarjeta: pregunta = su título, respuesta = su cuerpo. El
          cuerpo se vacía porque se ha mudado a la tarjeta, no porque se tire.

     Una nota que estaba fuera de la rotación (repasar:false) era material de
     consulta y se queda como papel sin tarjetas, con su texto intacto.

     El disparador es que una nota NO tenga lista de tarjetas, no un número de
     versión ni la clave `repasar`: `repasar` no existía antes de v5, así que
     un archivo de v4 se habría quedado sin convertir y sus notas habrían
     perdido el repaso en silencio. Sin `tarjetas` solo puede ser anterior a
     v8, venga de donde venga. */
  const preV8 = out.reviews.filter((r) => r && r.id && !Array.isArray(r.tarjetas));
  if (preV8.length) {
    const porId = {};
    for (const r of out.reviews) if (r && r.id) porId[r.id] = r;

    const tarjetaDesde = (r) => ({
      id: 'tj' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      pregunta: r.title,
      respuesta: typeof r.text === 'string' ? r.text : '',
      ef: r.ef, reps: r.reps, interval: r.interval, lapses: r.lapses,
      due: r.due, ultimoRepaso: r.ultimoRepaso || null,
      historial: Array.isArray(r.historial) ? r.historial : []
    });

    const absorbidas = [];
    for (const r of preV8) {
      const origen = r.sourceId && porId[r.sourceId];
      if (!origen || origen === r) continue;
      if (!Array.isArray(origen.tarjetas)) origen.tarjetas = [];
      origen.tarjetas.push(tarjetaDesde(r));
      absorbidas.push(r.id);
    }
    out.reviews = out.reviews.filter((r) => absorbidas.indexOf(r.id) === -1);

    for (const r of preV8) {
      if (absorbidas.indexOf(r.id) !== -1) continue;
      if (!Array.isArray(r.tarjetas)) r.tarjetas = [];
      if (r.repasar === false) continue;   // material de consulta: se queda igual

      r.tarjetas.push(tarjetaDesde(r));

      /* El cuerpo se vacía SOLO si la nota era de verdad una tarjeta, o sea
         corta. Un resumen de clase que estuviera en repaso —el caso del que ya
         avisaba el editor— es teoría: se queda donde está y además genera su
         tarjeta, aunque el texto salga repetido. Vaciarlo dejaría el papel en
         blanco y la clase entera escondida dentro de una tarjeta. */
      if (notas.palabras(r.text) <= notas.PALABRAS_MAX_TARJETA) r.text = '';
    }
  }

  const reparado = sanear(out);
  if (reparado.length) {
    console.warn('Datos saneados al abrir: se descartaron ' + reparado.join(', '));
  }
  out._saneado = reparado;

  /* "Dormir" se siembra UNA vez en archivos que vienen de v3. El flag evita
     resucitarla si el usuario la borra a propósito: sembrar en cada arranque
     sería imposible de quitar. */
  if (!out.settings.seededDaily) {
    if (!out.activities.some(function (a) { return a.kind === 'daily'; })) {
      out.activities.push({
        id: 'a-sueno', name: 'Dormir', color: '#8B7CD6',
        kind: 'daily', target: 7, unit: 'h'
      });
    }
    out.settings.seededDaily = true;
  }

  out.version = 9;
  return out;
}

function get() {
  return data;
}

// Guardado diferido: muchas mutaciones seguidas producen una sola escritura.
function save() {
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(flush, 300);
}

/* Último error de guardado. Se expone para que la interfaz pueda avisar:
   seguir trabajando una hora creyendo que se guarda, cuando no se guarda, es
   la peor forma de perder datos que hay. */
let errorGuardado = null;

function flush() {
  if (!filePath || !data) return true;
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  const tmp = filePath + '.tmp';
  try {
    /* La fecha del ultimo guardado viaja DENTRO del archivo. Es lo que
       permite darse cuenta de que el que hay en disco ha retrocedido: la del
       sistema de archivos la conserva cualquier copia y no dice nada. */
    data.settings.ultimoGuardado = new Date().toISOString();
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmp, filePath);
    errorGuardado = null;
    return true;
  } catch (err) {
    console.error('No se pudo guardar:', err);
    errorGuardado = { mensaje: err.message, cuando: new Date().toISOString() };
    return false;
  }
}

function getError() {
  return errorGuardado;
}

function getFilePath() {
  return filePath;
}

module.exports = {
  init, get, save, flush, getFilePath, getError, COLORES,
  respaldos, restaurar, respaldar, cualesSeQuedan
};
