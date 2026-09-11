/* Pruebas de la capa de datos, sin abrir ventanas.
   Uso:  node tools/prueba-datos.js

   Van aparte del selftest porque no necesitan interfaz: comprueban que el
   archivo de datos aguanta lo que la vida real le va a tirar encima. */
const fs = require('fs');
const os = require('os');
const path = require('path');

const store = require('../store');

let pasan = 0;
let fallan = 0;

function ok(nombre, cond, extra) {
  if (cond) { pasan++; console.log('PASS ' + nombre + (extra ? ' :: ' + extra : '')); }
  else { fallan++; console.log('FALL ' + nombre + (extra ? ' :: ' + extra : '')); }
}

function carpetaLimpia() {
  const d = path.join(os.tmpdir(), 'flow-prueba-datos-' + Date.now() + '-' + Math.random().toString(36).slice(2));
  fs.mkdirSync(d, { recursive: true });
  return d;
}

function escribir(dir, obj) {
  fs.writeFileSync(path.join(dir, 'flow-data.json'), JSON.stringify(obj), 'utf8');
}

// --- 1. Archivo nuevo -------------------------------------------------------
{
  const dir = carpetaLimpia();
  const d = store.init(dir);
  ok('archivo nuevo arranca con valores de fábrica',
     d.activities.length > 0 && d.areas.length === 7 && d.version === 9);
  ok('el archivo se escribe en disco',
     fs.existsSync(path.join(dir, 'flow-data.json')));
  /* Un archivo nuevo trae un estante y ninguna carpeta. Sembrar carpetas de
     fábrica obligaría a adivinar qué se va a estudiar, y cualquier suposición
     sería la de otra persona. */
  ok('arranca con un estante y sin carpetas',
     d.spotGroups.length === 1 && d.spotGroups[0].name === 'Estudio' &&
     d.noteTypes.length === 0,
     'estantes=' + d.spotGroups.map((g) => g.name).join(',') +
     ' carpetas=' + d.noteTypes.length);
  ok('ningún estante habla ya de dinero',
     d.spotGroups.every((g) => typeof g.dinero === 'undefined'));
}

// --- 2. Basura dentro del archivo -------------------------------------------
{
  const dir = carpetaLimpia();
  escribir(dir, {
    version: 4,
    activities: [
      { id: 'a1', name: 'Buena', kind: 'timed' },
      { id: 'a2' },                                  // sin nombre: inservible
      null                                            // ni siquiera un objeto
    ],
    sessions: [
      { id: 's1', date: '2026-08-23', countedSec: 3000 },  // buena
      { id: 's2', date: '2026-08-23' },                    // SIN countedSec
      { id: 's3', date: '2026-08-23', countedSec: '1800' },// número como texto
      { id: 's4', date: 'ayer', countedSec: 600 },         // fecha inválida
      { date: '2026-08-23', countedSec: 600 }              // sin id
    ],
    results: [{ id: 'r1', date: '2026-08-23', hands: 'muchas', profit: '12.5' }],
    plan: {
      '2026-08-23': [{ id: 'p1', activityId: 'a1', plannedMins: 'una hora' }],
      'no-es-fecha': [{ id: 'p2', activityId: 'a1', plannedMins: 60 }]
    },
    daily: { '2026-08-23': { 'a-sueno': 'ocho' } },
    settings: {}
  });

  const d = store.init(dir);

  ok('descarta las actividades inservibles',
     d.activities.filter((a) => a.id === 'a1').length === 1 &&
     !d.activities.some((a) => !a || !a.name),
     'quedan ' + d.activities.length);

  // Lo importante: ninguna suma puede salir NaN.
  const total = d.sessions.reduce((a, s) => a + s.countedSec / 60, 0);
  ok('los totales NO salen NaN', isFinite(total), 'total=' + total);

  ok('la sesión sin countedSec se repara a 0',
     d.sessions.find((s) => s.id === 's2').countedSec === 0);
  ok('el número como texto se convierte',
     d.sessions.find((s) => s.id === 's3').countedSec === 1800);
  ok('la sesión con fecha inválida se descarta',
     !d.sessions.some((s) => s.id === 's4'));
  ok('la sesión sin id se descarta', d.sessions.length === 3,
     'quedan ' + d.sessions.length);

  ok('los resultados se sanean',
     d.results[0].hands === 0 && d.results[0].profit === 12.5,
     'hands=' + d.results[0].hands + ' profit=' + d.results[0].profit);

  ok('la duración inválida toma el valor por defecto',
     d.plan['2026-08-23'][0].plannedMins === 60);
  ok('la fecha inválida del plan se descarta', !d.plan['no-es-fecha']);
  ok('el valor diario no numérico se descarta', !d.daily['2026-08-23']);

  ok('se informa de lo reparado', Array.isArray(d._saneado) && d._saneado.length > 0,
     d._saneado.join(', '));
}

/* --- 2b. El bloc: subir de v4 a v5 -------------------------------------------

   Aquí está lo que no se puede fallar. En v4 una nota era una línea suelta en
   `text`; en v5 `title` es el anverso de la tarjeta y `text` el reverso. Si la
   conversión se equivoca, meses de conceptos se quedan sin título — y una nota
   sin título el saneado la tira. Se prueba con un archivo de v4 de verdad. */
{
  const dir = carpetaLimpia();
  escribir(dir, {
    version: 4,
    activities: [{ id: 'a1', name: 'X', kind: 'timed' }],
    reviews: [
      // Tal cual las guardaba v4: sin title, sin typeId, sin repasar.
      { id: 'rv1', spotId: 's1', text: 'El check-raise no funciona vs reg tight',
        ef: 2.36, reps: 4, interval: 38, lapses: 1, due: '2026-09-30',
        historial: [{ fecha: '2026-08-01', grado: 'bien' }] },
      { id: 'rv2', text: '' },                      // vacía: inservible
      { id: 'rv3', text: 'Otra buena' }
    ],
    settings: {}
  });

  const d = store.init(dir);
  const rv1 = d.reviews.find((r) => r.id === 'rv1');

  ok('la nota de v4 conserva su texto como título',
     !!rv1 && rv1.title === 'El check-raise no funciona vs reg tight', rv1 && rv1.title);
  ok('y nace con el cuerpo vacío, no con el título duplicado',
     !!rv1 && rv1.text === '', JSON.stringify(rv1 && rv1.text));

  /* Lo más caro de romper: el calendario. Un EF o un intervalo perdidos en la
     migración no se notan hoy, se notan dentro de seis meses.

     En v8 el calendario ya no vive en el papel: vive en su tarjeta. Que llegue
     entero hasta ahí, cruzando cuatro migraciones seguidas, es lo que esta
     comprobación defiende. */
  ok('la nota de v4 acaba siendo un papel con UNA tarjeta',
     rv1.tarjetas.length === 1, 'tarjetas=' + rv1.tarjetas.length);
  const tj1 = rv1.tarjetas[0];
  ok('la migración no toca el calendario del repaso',
     tj1.ef === 2.36 && tj1.interval === 38 && tj1.due === '2026-09-30' &&
     tj1.historial.length === 1,
     'ef=' + tj1.ef + ' int=' + tj1.interval + ' due=' + tj1.due);
  ok('la pregunta de la tarjeta es el título que tenía la nota',
     tj1.pregunta === 'El check-raise no funciona vs reg tight', tj1.pregunta);

  ok('y queda sin clasificar, no colgando de una carpeta inventada',
     rv1.typeId === null, JSON.stringify(rv1.typeId));
  ok('la nota vacía de v4 se descarta', !d.reviews.some((r) => r.id === 'rv2'),
     'quedan ' + d.reviews.length);
  ok('el archivo queda marcado como v9', d.version === 9, 'version=' + d.version);
}

// --- 2c. El bloc aguanta basura ---------------------------------------------
{
  const dir = carpetaLimpia();
  escribir(dir, {
    version: 5,
    activities: [{ id: 'a1', name: 'X', kind: 'timed' }],
    noteTypes: [
      { id: 'nt1', name: 'Preflop', color: '#123456' },
      { id: 'nt2', name: 'Sin color', color: 'azul' },   // color inválido
      { id: 'nt3' },                                      // sin nombre
      null
    ],
    reviews: [
      { id: 'rv1', title: 'Buena', text: 'cuerpo', typeId: 'nt1' },
      { id: 'rv2', title: 'Huérfana', typeId: 'nt-borrado' }, // apunta a un tipo que no existe
      { id: 'rv3', title: 'Sin cuerpo', text: 12345 },        // cuerpo que no es texto
      { id: 'rv4', title: '   ' },                            // título en blanco
      { id: 'rv5', title: 'Solo consulta', repasar: false }
    ],
    settings: {}
  });

  const d = store.init(dir);

  ok('el apartado sin nombre se descarta',
     d.noteTypes.length === 2, 'quedan ' + d.noteTypes.length);
  ok('un color inválido se repara en vez de tirar el apartado',
     /^#[0-9a-f]{6}$/i.test(d.noteTypes.find((t) => t.id === 'nt2').color),
     d.noteTypes.find((t) => t.id === 'nt2').color);

  /* Una nota que apunta a un apartado borrado quedaría invisible: ni en su
     apartado, que ya no existe, ni en "sin clasificar". Vuelve a la raíz. */
  ok('la nota de un apartado inexistente vuelve a sin clasificar',
     d.reviews.find((r) => r.id === 'rv2').typeId === null);
  ok('un cuerpo que no es texto se repara a vacío',
     d.reviews.find((r) => r.id === 'rv3').text === '');
  ok('la nota sin título se descarta', !d.reviews.some((r) => r.id === 'rv4'),
     'quedan ' + d.reviews.length);
  // El material de consulta se queda como papel sin tarjetas y con su texto.
  ok('la nota de solo consulta se queda sin tarjetas',
     d.reviews.find((r) => r.id === 'rv5').tarjetas.length === 0);
}

/* --- 2e. De v5 a v6: los apartados dejan de ser globales ---------------------

   En v5 un apartado se veía desde todos los spots, así que "Preflop" salía en
   el bloc de unos apuntes de git. En v6 cada ámbito tiene los suyos. La
   migración copia cada apartado global a cada spot y reapunta las notas a la
   copia de SU spot: si se equivoca, una nota clasificada durante meses se
   queda sin apartado o —peor— clasificada en el apartado de otro mundo. */
{
  const dir = carpetaLimpia();
  escribir(dir, {
    version: 5,
    activities: [{ id: 'a1', name: 'X', kind: 'timed' }],
    spots: [
      { id: 'sp-poker', name: '3-bet pot OOP', archived: false },
      { id: 'sp-git', name: 'Git', archived: false }
    ],
    // Tal cual los guardaba v5: sin spotId, visibles desde todas partes.
    noteTypes: [
      { id: 'nt-pre', name: 'Preflop', color: '#5b5bd6' },
      { id: 'nt-post', name: 'Postflop', color: '#12805c' }
    ],
    reviews: [
      { id: 'rv-poker', title: 'Del spot de poker', spotId: 'sp-poker', typeId: 'nt-post' },
      { id: 'rv-git', title: 'De git', spotId: 'sp-git', typeId: 'nt-post' },
      { id: 'rv-suelta', title: 'De ningún spot', typeId: 'nt-pre' }
    ],
    settings: {}
  });

  const d = store.init(dir);
  const del = (spotId) => d.noteTypes.filter((t) => (t.spotId || null) === spotId);

  ok('cada spot recibe su copia de los apartados globales',
     del('sp-poker').length === 2 && del('sp-git').length === 2 && del(null).length === 2,
     'poker=' + del('sp-poker').length + ' git=' + del('sp-git').length +
     ' general=' + del(null).length);

  const rvPoker = d.reviews.find((r) => r.id === 'rv-poker');
  const rvGit = d.reviews.find((r) => r.id === 'rv-git');
  const rvSuelta = d.reviews.find((r) => r.id === 'rv-suelta');

  ok('ninguna nota pierde su clasificación en la migración',
     !!rvPoker.typeId && !!rvGit.typeId && !!rvSuelta.typeId,
     [rvPoker.typeId, rvGit.typeId, rvSuelta.typeId].join(' / '));

  const tipoDe = (r) => d.noteTypes.find((t) => t.id === r.typeId);
  ok('cada nota apunta al apartado de SU ámbito',
     tipoDe(rvPoker).spotId === 'sp-poker' &&
     tipoDe(rvGit).spotId === 'sp-git' &&
     (tipoDe(rvSuelta).spotId || null) === null,
     'poker=' + tipoDe(rvPoker).spotId + ' git=' + tipoDe(rvGit).spotId);

  ok('y conserva el nombre del apartado que tenía',
     tipoDe(rvPoker).name === 'Postflop' && tipoDe(rvGit).name === 'Postflop' &&
     tipoDe(rvSuelta).name === 'Preflop');

  /* Lo que hace que estén de verdad separados: las dos notas estaban en el
     mismo "Postflop" y ahora están en dos apartados distintos. Renombrar el de
     git no puede tocar el de poker. */
  ok('los dos "Postflop" son apartados distintos',
     rvPoker.typeId !== rvGit.typeId, rvPoker.typeId + ' vs ' + rvGit.typeId);
}

/* --- 2f. La regla que hace imposible mezclar --------------------------------
   Una nota solo puede estar en un apartado de su propio ámbito. Se comprueba
   al cargar porque el archivo se puede editar a mano o venir de una versión
   vieja, y una nota clasificada en el apartado de otro spot aparecería en un
   ámbito al que no pertenece. */
{
  const dir = carpetaLimpia();
  escribir(dir, {
    version: 6,
    activities: [{ id: 'a1', name: 'X', kind: 'timed' }],
    spots: [{ id: 'sp-a', name: 'A', archived: false }, { id: 'sp-b', name: 'B', archived: false }],
    noteTypes: [
      { id: 'nt-a', name: 'De A', color: '#5b5bd6', spotId: 'sp-a' },
      { id: 'nt-b', name: 'De B', color: '#12805c', spotId: 'sp-b' },
      { id: 'nt-huerfano', name: 'De un spot borrado', color: '#12805c', spotId: 'sp-fantasma' }
    ],
    reviews: [
      { id: 'rv-ok', title: 'Bien puesta', spotId: 'sp-a', typeId: 'nt-a' },
      { id: 'rv-cruzada', title: 'Cruzada', spotId: 'sp-a', typeId: 'nt-b' },
      { id: 'rv-fantasma', title: 'De un spot que ya no está', spotId: 'sp-fantasma' }
    ],
    settings: {}
  });

  const d = store.init(dir);

  ok('una nota en el apartado de su ámbito se respeta',
     d.reviews.find((r) => r.id === 'rv-ok').typeId === 'nt-a');
  ok('una nota clasificada en el apartado de OTRO ámbito se descuelga',
     d.reviews.find((r) => r.id === 'rv-cruzada').typeId === null,
     JSON.stringify(d.reviews.find((r) => r.id === 'rv-cruzada').typeId));

  // Nada se borra: se recoge en General, donde se puede ver y recolocar.
  ok('la nota de un spot borrado se recoge en General, no se pierde',
     !!d.reviews.find((r) => r.id === 'rv-fantasma') &&
     d.reviews.find((r) => r.id === 'rv-fantasma').spotId === null,
     'quedan ' + d.reviews.length + ' notas');
  ok('el apartado de un spot borrado también se recoge en General',
     (d.noteTypes.find((t) => t.id === 'nt-huerfano').spotId || null) === null);
}

/* --- 2g. De v6 a v7: los spots se agrupan -----------------------------------

   Todo lo que ya existía entra en "Poker" con dinero puesto. Subir de versión
   no puede cambiar ni una cifra de lo que ya estabas mirando: mover un curso a
   un grupo sin dinero es una decisión del usuario, no una adivinanza de la app
   a partir del nombre del spot. */
{
  const dir = carpetaLimpia();
  escribir(dir, {
    version: 6,
    activities: [{ id: 'a1', name: 'X', kind: 'timed' }],
    spots: [
      { id: 'sp1', name: '3-bet pot OOP', archived: false },
      { id: 'sp2', name: 'Programación', archived: false }
    ],
    settings: {}
  });

  const d = store.init(dir);
  ok('un archivo de v6 recibe un estante de fábrica',
     d.spotGroups.length === 1, JSON.stringify(d.spotGroups));
  ok('y todos los temas que ya existían entran en él',
     d.spots.every((s) => s.groupId === d.spotGroups[0].id),
     d.spots.map((s) => s.name + '→' + s.groupId).join(' | '));
  ok('el archivo queda marcado como v9', d.version === 9, 'version=' + d.version);
}

// --- 2h. Los grupos aguantan basura -----------------------------------------
{
  const dir = carpetaLimpia();
  escribir(dir, {
    version: 7,
    activities: [{ id: 'a1', name: 'X', kind: 'timed' }],
    spotGroups: [
      { id: 'sg1', name: 'Poker', dinero: true },
      { id: 'sg2', name: 'Programación', dinero: false },
      { id: 'sg3' },                                  // sin nombre
      null
    ],
    spots: [
      { id: 'sp1', name: 'Con grupo', groupId: 'sg2', archived: false },
      { id: 'sp2', name: 'Grupo fantasma', groupId: 'sg-borrado', archived: false },
      // groupId explícito a null, no ausente: en un archivo de v7 un spot
      // siempre trae la clave, y que falte es la señal de que viene de antes.
      { id: 'sp3', name: 'Sin grupo', groupId: null, archived: false }
    ],
    settings: {}
  });

  const d = store.init(dir);
  ok('el grupo sin nombre se descarta', d.spotGroups.length === 2,
     'quedan ' + d.spotGroups.length);
  ok('el interruptor de dinero se limpia de los estantes viejos',
     d.spotGroups.every((g) => typeof g.dinero === 'undefined'),
     JSON.stringify(d.spotGroups));
  ok('el spot conserva su grupo',
     d.spots.find((s) => s.id === 'sp1').groupId === 'sg2');

  /* Un spot que apunta a un grupo borrado no puede quedarse fuera de la lista:
     se queda sin grupo, que es como estaba antes de que existieran. */
  ok('un spot de un grupo inexistente se queda sin grupo, no desaparece',
     !!d.spots.find((s) => s.id === 'sp2') &&
     d.spots.find((s) => s.id === 'sp2').groupId === null,
     'quedan ' + d.spots.length + ' spots');
  ok('un spot que no quiere grupo se queda sin grupo',
     d.spots.find((s) => s.id === 'sp3').groupId === null);
}

/* --- 2i. De v7 a v8: el papel deja de ser una tarjeta -----------------------

   Hasta v7 cada nota era a la vez documento y tarjeta. En v8 el papel guarda la
   teoría y sus tarjetas cuelgan de él, cada una con su calendario. Si esta
   conversión se equivoca, meses de repasos se van por el desagüe sin que se
   note hasta dentro de medio año. */
{
  const dir = carpetaLimpia();
  escribir(dir, {
    version: 7,
    activities: [{ id: 'a1', name: 'X', kind: 'timed' }],
    spotGroups: [{ id: 'sg1', name: 'Programación', dinero: false }],
    spots: [{ id: 'sp1', name: 'Git', groupId: 'sg1', archived: false }],
    reviews: [
      // Una clase larga, de solo consulta, con dos tarjetas sacadas de ella.
      { id: 'clase', title: 'Clase 12 de agosto', spotId: 'sp1', repasar: false,
        text: 'palabra '.repeat(300) },
      { id: 'saca1', title: '¿Qué hace git reflog?', text: 'Los commits sueltos.',
        spotId: 'sp1', sourceId: 'clase', repasar: true,
        ef: 2.36, reps: 4, interval: 38, lapses: 1, due: '2026-11-30',
        historial: [{ fecha: '2026-08-01', grado: 'bien' }] },
      { id: 'saca2', title: '¿merge o rebase?', text: 'Depende.',
        spotId: 'sp1', sourceId: 'clase', repasar: true,
        ef: 2.5, reps: 1, interval: 1, lapses: 0, due: '2026-09-09', historial: [] },
      // Una lógica corta suelta: el papel ERA la tarjeta.
      { id: 'corta', title: '¿Qué es un detached HEAD?', text: 'Estás en un commit.',
        spotId: 'sp1', repasar: true,
        ef: 2.6, reps: 3, interval: 15, lapses: 0, due: '2026-10-01', historial: [] }
    ],
    settings: {}
  });

  const d = store.init(dir);
  const clase = d.reviews.find((r) => r.id === 'clase');
  const corta = d.reviews.find((r) => r.id === 'corta');

  /* Las tarjetas sacadas vuelven a su papel de origen. Eran eso desde el
     principio; el modelo viejo no sabía guardarlas dentro. */
  ok('las tarjetas sacadas vuelven al papel del que salieron',
     !!clase && clase.tarjetas.length === 2,
     clase ? 'tarjetas=' + clase.tarjetas.length : 'sin clase');
  ok('y dejan de existir como papeles sueltos',
     !d.reviews.some((r) => r.id === 'saca1' || r.id === 'saca2'),
     'papeles=' + d.reviews.map((r) => r.id).join(','));

  const reflog = clase.tarjetas.find((c) => c.pregunta.indexOf('reflog') !== -1);
  ok('la tarjeta conserva pregunta y respuesta',
     reflog.pregunta === '¿Qué hace git reflog?' &&
     reflog.respuesta === 'Los commits sueltos.',
     JSON.stringify(reflog.pregunta));
  ok('y su calendario entero',
     reflog.ef === 2.36 && reflog.reps === 4 && reflog.interval === 38 &&
     reflog.lapses === 1 && reflog.due === '2026-11-30' &&
     reflog.historial.length === 1,
     'ef=' + reflog.ef + ' int=' + reflog.interval + ' due=' + reflog.due);

  // La clase era material de consulta: su teoría se queda donde estaba.
  ok('la teoría del papel largo no se toca',
     clase.text.indexOf('palabra') === 0 && clase.text.length > 1000,
     'largo=' + clase.text.length);

  /* Una lógica corta se convierte en papel con una tarjeta, y el cuerpo se
     vacía porque se ha MUDADO a la tarjeta, no porque se tire. */
  ok('una lógica corta se convierte en papel con una tarjeta',
     corta.tarjetas.length === 1 &&
     corta.tarjetas[0].respuesta === 'Estás en un commit.',
     JSON.stringify(corta.tarjetas[0] && corta.tarjetas[0].respuesta));
  ok('y su cuerpo se vacía porque el contenido se mudó, no se perdió',
     corta.text === '', JSON.stringify(corta.text));
  ok('conservando también su calendario',
     corta.tarjetas[0].ef === 2.6 && corta.tarjetas[0].due === '2026-10-01');

  // No queda ni rastro del modelo viejo en ningún papel.
  ok('los papeles pierden los campos del modelo viejo',
     d.reviews.every((r) => typeof r.repasar === 'undefined' &&
       typeof r.sourceId === 'undefined' && typeof r.due === 'undefined' &&
       typeof r.ef === 'undefined'));
  ok('y todos tienen sus dos listas nuevas',
     d.reviews.every((r) => Array.isArray(r.tarjetas) && Array.isArray(r.imagenes)));
  ok('el archivo queda marcado como v9', d.version === 9, 'version=' + d.version);
}

/* --- 2k. De v8 a v9: los eventos --------------------------------------------

   Un archivo anterior no trae la lista, y sin ella el calendario reventaría al
   leer events.filter. Y un evento a medias no puede quedarse: un aviso con una
   hora inventada es peor que ningún aviso. */
{
  const dir = carpetaLimpia();
  escribir(dir, {
    version: 8,
    activities: [{ id: 'a1', name: 'X', kind: 'timed' }],
    reviews: []
  });
  const d = store.init(dir);
  ok('un archivo sin eventos recibe la lista vacía', Array.isArray(d.events) && d.events.length === 0);
  ok('y queda marcado como v9', d.version === 9, 'version=' + d.version);
}

{
  const dir = carpetaLimpia();
  escribir(dir, {
    version: 9,
    activities: [{ id: 'a1', name: 'X', kind: 'timed' }],
    reviews: [],
    events: [
      { id: 'ev1', date: '2026-09-20', time: '16:30', title: 'Entrega', avisarMin: 60 },
      // Hora imposible: se queda como evento de todo el día, no se tira.
      { id: 'ev2', date: '2026-09-21', time: '99:99', title: 'Reunión', avisarMin: 3 },
      // Antelación absurda: se recorta a una semana.
      { id: 'ev3', date: '2026-09-22', time: '', title: 'Examen', avisarMin: 999999 },
      // Sin fecha usable o sin título no se puede ni pintar ni avisar.
      { id: 'ev4', date: 'mañana', title: 'Sin fecha' },
      { id: 'ev5', date: '2026-09-23', title: '   ' }
    ]
  });
  const d = store.init(dir);
  const id = (x) => d.events.find((e) => e.id === x);
  ok('un evento bien formado se conserva entero',
     !!id('ev1') && id('ev1').time === '16:30' && id('ev1').avisarMin === 60);
  ok('una hora imposible lo deja de todo el día, no lo borra',
     !!id('ev2') && id('ev2').time === '', 'time=' + (id('ev2') || {}).time);
  ok('una antelación absurda se recorta a una semana',
     !!id('ev3') && id('ev3').avisarMin === 10080, 'min=' + (id('ev3') || {}).avisarMin);
  ok('sin fecha usable se descarta', !id('ev4'));
  ok('sin título también', !id('ev5'));
  ok('y el resto sobrevive', d.events.length === 3, 'quedan ' + d.events.length);
}

/* --- 2j. Un papel largo que SÍ estaba en repaso -----------------------------
   Es el caso del que ya avisaba el editor: teoría metida en la rotación. No se
   puede vaciar su cuerpo —dejaría el papel en blanco y la clase escondida
   dentro de una tarjeta— pero tampoco se puede perder su calendario. */
{
  const dir = carpetaLimpia();
  escribir(dir, {
    version: 7,
    activities: [{ id: 'a1', name: 'X', kind: 'timed' }],
    reviews: [
      { id: 'largo', title: 'Clase entera', text: 'palabra '.repeat(300),
        repasar: true, ef: 2.1, reps: 2, interval: 6, lapses: 3,
        due: '2026-10-15', historial: [] }
    ],
    settings: {}
  });

  const d = store.init(dir);
  const largo = d.reviews[0];
  ok('un papel largo en repaso conserva su teoría',
     largo.text.length > 1000, 'largo=' + largo.text.length);
  ok('y aun así conserva su calendario en una tarjeta',
     largo.tarjetas.length === 1 && largo.tarjetas[0].due === '2026-10-15' &&
     largo.tarjetas[0].lapses === 3,
     'tarjetas=' + largo.tarjetas.length);
}

// --- 2k. Las imágenes del papel ---------------------------------------------
{
  const dir = carpetaLimpia();
  escribir(dir, {
    version: 8,
    activities: [{ id: 'a1', name: 'X', kind: 'timed' }],
    reviews: [{
      id: 'p1', title: 'Con imágenes', text: '', tarjetas: [],
      imagenes: [
        { id: 'i1', nombre: 'diagrama', archivo: 'i1.png' },
        { id: 'i2', nombre: 'Diagrama', archivo: 'i2.png' },  // nombre repetido
        { id: 'i3', archivo: 'i3.png' },                      // sin nombre
        { id: 'i4' },                                          // sin archivo
        null
      ]
    }],
    settings: {}
  });

  const d = store.init(dir);
  const im = d.reviews[0].imagenes;
  /* Dos imágenes del mismo papel no pueden llamarse igual: [[diagrama]] no
     sabría a cuál de las dos apunta, y el enlace es lo único que las hace
     útiles. */
  ok('un nombre de imagen repetido se descarta',
     !im.some((x) => x.id === 'i2'), im.map((x) => x.nombre).join(','));
  ok('una imagen sin archivo se descarta', !im.some((x) => x.id === 'i4'));
  ok('una imagen sin nombre recibe uno',
     !!im.find((x) => x.id === 'i3') && !!im.find((x) => x.id === 'i3').nombre);
  ok('la buena sobrevive', !!im.find((x) => x.id === 'i1' && x.nombre === 'diagrama'),
     'quedan ' + im.length);
}

// --- 2d. Borrar todos los apartados es una decisión, no un accidente --------
{
  const dir = carpetaLimpia();
  escribir(dir, {
    version: 5,
    activities: [{ id: 'a1', name: 'X', kind: 'timed' }],
    noteTypes: [],
    settings: {}
  });
  const d = store.init(dir);
  ok('los apartados borrados no resucitan al abrir', d.noteTypes.length === 0,
     d.noteTypes.length + ' apartados');
}

// --- 3. Archivo ilegible ----------------------------------------------------
{
  const dir = carpetaLimpia();
  fs.writeFileSync(path.join(dir, 'flow-data.json'), '{ esto no es json', 'utf8');
  const d = store.init(dir);
  ok('un archivo ilegible no impide arrancar', d.activities.length > 0);
  const apartados = fs.readdirSync(dir).filter((f) => f.indexOf('.corrupto-') !== -1);
  ok('el archivo ilegible se aparta, no se borra', apartados.length === 1,
     apartados.join(''));
}

// --- 4. Respaldos -----------------------------------------------------------
{
  const dir = carpetaLimpia();
  escribir(dir, { version: 4, activities: [{ id: 'a1', name: 'X', kind: 'timed' }], settings: {} });

  for (let i = 0; i < 8; i++) {
    store.init(dir);
    // El nombre del respaldo lleva el segundo: hay que separar las corridas.
    const t = Date.now() + i * 1100;
    const nuevos = fs.readdirSync(dir).filter((f) => f.indexOf('flow-data.respaldo-') === 0);
    if (nuevos.length) {
      const ultimo = nuevos.sort().pop();
      fs.renameSync(path.join(dir, ultimo),
        path.join(dir, 'flow-data.respaldo-' + new Date(t).toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json'));
    }
  }

  const copias = fs.readdirSync(dir).filter((f) => f.indexOf('flow-data.respaldo-') === 0);
  ok('se conservan respaldos', copias.length > 0, copias.length + ' copias');
  ok('no se acumulan sin límite', copias.length <= 5, copias.length + ' copias (máximo 5)');
}

// --- 5. Escritura fallida ---------------------------------------------------
{
  const dir = carpetaLimpia();
  store.init(dir);
  ok('sin errores al arrancar', store.getError() === null);

  // Se sustituye el archivo por una CARPETA: renombrar encima falla.
  const destino = path.join(dir, 'flow-data.json');
  fs.unlinkSync(destino);
  fs.mkdirSync(destino);

  const bien = store.flush();
  ok('un guardado fallido se detecta', bien === false);
  ok('el fallo queda registrado para avisar',
     store.getError() !== null && typeof store.getError().mensaje === 'string',
     store.getError() ? store.getError().mensaje.slice(0, 48) : 'sin mensaje');
}
/* --- La capa de proteccion contra perder datos ------------------------------

   Un archivo con anos de apuntes dentro. Lo que se prueba aqui no es que la
   app funcione: es que cuando algo va mal, lo escrito siga estando. */

/* 3a. La rotacion cubre tiempo, no numero de archivos.

   Contando archivos, abrir Flow cinco veces seguidas gastaba las cinco plazas
   en el mismo minuto y se llevaba por delante la profundidad entera. Paso de
   verdad: tres copias identicas hechas en 17 segundos. */
{
  const nombres = [];
  for (const dia of ['01','02','03','04','05','06','07','08','09','10']) {
    nombres.push('flow-data.respaldo-2026-09-' + dia + '-10-00-00.json');
  }
  nombres.push('flow-data.respaldo-2026-09-10-10-05-00.json');
  nombres.push('flow-data.respaldo-2026-09-10-10-06-00.json');

  const quedan = store.cualesSeQuedan(nombres);
  ok('la rotacion guarda una copia por dia y las ultimas', quedan.size === 9, quedan.size);
  ok('y el dia mas viejo cabe dentro de la semana',
     quedan.has('flow-data.respaldo-2026-09-04-10-00-00.json') &&
     !quedan.has('flow-data.respaldo-2026-09-03-10-00-00.json'));
  ok('las tres ultimas se quedan pase lo que pase',
     quedan.has('flow-data.respaldo-2026-09-10-10-06-00.json') &&
     quedan.has('flow-data.respaldo-2026-09-10-10-05-00.json'));
}

/* 3b. Abrir la app sin tocar nada no gasta una copia. */
{
  const dir = carpetaLimpia();
  store.init(dir);
  store.get().reviews.push({ id: 'r1', title: 'Clase 1', text: 'algo', typeId: null,
    spotId: null, imagenes: [], tarjetas: [], createdAt: '', updatedAt: '' });
  store.flush();

  const copias = () => fs.readdirSync(dir).filter((f) => f.indexOf('flow-data.respaldo-') === 0);

  store.init(dir);
  const tras1 = copias().length;
  ok('al abrir con datos nuevos se hace una copia', tras1 === 1, tras1);

  store.init(dir);
  store.init(dir);
  ok('abrir tres veces sin cambiar nada NO gasta tres copias',
     copias().length === 1, copias().length + ' copias');

  store.get().reviews.push({ id: 'r2', title: 'Clase 2', text: 'mas', typeId: null,
    spotId: null, imagenes: [], tarjetas: [], createdAt: '', updatedAt: '' });
  store.flush();
  store.init(dir);
  ok('pero si cambia algo, si', copias().length === 2, copias().length + ' copias');
}

/* 3c. Cada guardado deja su fecha DENTRO del archivo. Es lo unico que
   sobrevive a una copia: la fecha del sistema de archivos la conserva
   cualquier copiador y no dice nada de cuando se escribio el contenido. */
{
  const dir = carpetaLimpia();
  store.init(dir);
  store.flush();
  const d = JSON.parse(fs.readFileSync(path.join(dir, 'flow-data.json'), 'utf8'));
  ok('el archivo guarda cuando se guardo',
     typeof d.settings.ultimoGuardado === 'string' && d.settings.ultimoGuardado.length > 10,
     d.settings.ultimoGuardado);
}

/* 3d. El retroceso: alguien sustituye el archivo por una copia vieja.

   Ha pasado dos veces. La app cargaba tan tranquila y se seguia trabajando
   sobre un archivo al que le faltaban dias. */
{
  const dir = carpetaLimpia();
  const archivo = path.join(dir, 'flow-data.json');

  store.init(dir);
  store.get().reviews.push({ id: 'viejo', title: 'Lo de antes', text: 'x', typeId: null,
    spotId: null, imagenes: [], tarjetas: [], createdAt: '', updatedAt: '' });
  store.flush();
  const copiaVieja = fs.readFileSync(archivo);      // el archivo de "hace dias"

  // Pasa el tiempo y se trabaja: mas papeles, otro guardado.
  store.init(dir);
  store.get().reviews.push({ id: 'nuevo', title: 'Lo de ayer', text: 'y', typeId: null,
    spotId: null, imagenes: [], tarjetas: [], createdAt: '', updatedAt: '' });
  store.get().settings.ultimoGuardado = '2030-01-01T00:00:00.000Z';
  fs.writeFileSync(archivo, JSON.stringify(store.get(), null, 2), 'utf8');

  // Al abrir se respalda ESE archivo, el bueno.
  store.init(dir);

  // Y ahora alguien pega encima la copia vieja.
  fs.writeFileSync(archivo, copiaVieja);
  const d = store.init(dir);

  ok('se detecta que el archivo abierto es anterior al ultimo guardado',
     !!d._retroceso, JSON.stringify(d._retroceso));
  ok('y el aviso dice de cuando es la copia buena',
     d._retroceso && d._retroceso.copia === '2030-01-01T00:00:00.000Z',
     d._retroceso && d._retroceso.copia);
}

/* 3e. Restaurar desde dentro de la app, sin copiar archivos a mano por el
   Explorador — que es la maniobra que ya ha destruido datos dos veces. */
{
  const dir = carpetaLimpia();
  store.init(dir);
  store.get().reviews.push({ id: 'a', title: 'Con mis apuntes', text: 'largo', typeId: null,
    spotId: null, imagenes: [], tarjetas: [], createdAt: '', updatedAt: '' });
  store.flush();
  store.init(dir);                       // deja una copia con ese papel dentro

  // Se borra todo por error y se guarda el estropicio.
  store.get().reviews = [];
  store.flush();
  ok('el papel ya no esta', store.get().reviews.length === 0);

  const copias = store.respaldos();
  ok('la copia se puede listar con lo que lleva dentro',
     copias.length >= 1 && copias[0].papeles === 1,
     copias.length + ' copias, la primera con ' + (copias[0] || {}).papeles);

  const antes = fs.readdirSync(dir).filter((f) => f.indexOf('flow-data.respaldo-') === 0).length;
  const res = store.restaurar(copias[0].ruta);
  ok('restaurar devuelve el papel', res.ok && store.get().reviews.length === 1,
     JSON.stringify(res));
  ok('y antes de pisar nada guarda lo que habia',
     fs.readdirSync(dir).filter((f) => f.indexOf('flow-data.respaldo-') === 0).length > antes);

  const mala = store.restaurar(path.join(dir, 'no-existe.json'));
  ok('restaurar algo que no se puede leer no toca el archivo vivo',
     !mala.ok && store.get().reviews.length === 1);
}


console.log('\n===== ' + (fallan === 0
  ? 'TODO OK (' + pasan + ' comprobaciones)'
  : 'HAY FALLOS: ' + fallan + ' de ' + (pasan + fallan)) + ' =====');
process.exit(fallan === 0 ? 0 : 1);
