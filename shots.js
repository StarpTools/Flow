/* Genera capturas de cada vista con datos de ejemplo.
   Uso: HQ_SHOTS=1 electron .
   Escribe PNGs en ./shots/ y cierra. No se carga en uso normal. */
const fs = require('fs');
const path = require('path');

const SEED = `(async () => {
  const S = window.H.S;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const key = window.H.dateKey;
  const addDays = window.H.addDays;

  // --- Los estantes y sus temas ---------------------------------------
  const gBase = S.data.spotGroups[0];
  await S.mutate('spotGroup:update', { id: gBase.id, name: 'Programación' });
  await S.mutate('spotGroup:add', { name: 'Diseño' });
  const gDiseno = S.data.spotGroups[S.data.spotGroups.length - 1];

  const temas = [
    ['Git y control de versiones', gBase.id, 'Curso de 12 clases. Objetivo: dejar de tenerle miedo al rebase.'],
    ['HTML y CSS', gBase.id, 'Desde cero hasta maquetar una página entera.'],
    ['JavaScript', gBase.id, ''],
    ['Tipografía', gDiseno.id, 'Lo que hace que un texto se lea sin esfuerzo.']
  ];
  for (const [name, groupId, note] of temas) {
    await S.mutate('spot:add', { name, groupId, note });
  }
  const sp = S.data.spots;
  const git = sp.find((s) => s.name.indexOf('Git') === 0);

  // Solo cronometrables: los ítems de registro diario no se agendan.
  const acts = window.H.timedActs(S.data);
  const pick = (i) => acts[i % acts.length];

  // Plan y sesiones de los ultimos 40 dias, con huecos realistas.
  for (let back = 40; back >= 0; back--) {
    const d = addDays(new Date(), -back);
    const k = key(d);
    const dow = (d.getDay() + 6) % 7;

    const sueno = S.data.activities.find((a) => a.kind === 'daily');
    if (sueno && back % 7 !== 3) {
      await S.mutate('daily:set', {
        date: k, activityId: sueno.id,
        value: [7.5, 6.5, 8, 7, 5.5, 7.5, 8][back % 7]
      });
    }

    if (dow === 5 && back !== 0) { await S.mutate('rest:toggle', { date: k }); continue; }
    if (dow === 6 && back !== 0) continue;

    const nTasks = dow < 5 ? 3 : 2;
    for (let t = 0; t < nTasks; t++) {
      const a = pick(back + t);
      const spotId = t === 0 ? sp[(back + t) % sp.length].id : null;
      await S.mutate('plan:add', {
        dates: [k], activityId: a.id, spotId: spotId,
        plannedMins: [45, 60, 90, 120][(back + t) % 4]
      });
    }

    // Hoy queda a medias a proposito: una tarea completa, otra a la mitad,
    // la tercera sin empezar. Es el estado en que la app se ve de verdad.
    if (back === 0) {
      const hoy = S.data.plan[k] || [];
      if (hoy[0]) await S.mutate('session:addManual', {
        date: k, mins: hoy[0].plannedMins, activityId: hoy[0].activityId, spotId: hoy[0].spotId
      });
      if (hoy[1]) await S.mutate('session:addManual', {
        date: k, mins: Math.round(hoy[1].plannedMins * 0.45), activityId: hoy[1].activityId
      });
      continue;
    }

    const items = S.data.plan[k] || [];
    for (const it of items) {
      const r = ((back * 7 + it.plannedMins) % 10) / 10;
      if (r < 0.18) continue;
      const mins = Math.round(it.plannedMins * (r < 0.4 ? 0.55 : r < 0.7 ? 1 : 1.15));
      await S.mutate('session:addManual', {
        date: k, mins: mins, activityId: it.activityId, spotId: it.spotId
      });
    }
  }

  // --- Life ---------------------------------------------------------
  const salud = S.data.areas.find((a) => a.name === 'Salud');
  await S.mutate('life:setDiagnosis', {
    areaId: salud.id,
    text: 'Duermo 5 o 6 horas y las tardes largas las termino fundido. ' +
          'Como fuera casi todos los dias porque no planifico nada, y el gimnasio ' +
          'lleva tres meses cerrado para mi. Lo que estudio despues de la hora 4 ' +
          'no se me queda.'
  });
  const pgs = [
    ['drop', 'Dormir es tiempo que le quito al estudio'],
    ['drop', 'Si no estoy cansado no me esforce lo suficiente'],
    ['build', 'El descanso es parte del trabajo, no lo contrario'],
    ['build', 'Lo que recuerdo mañana decide si la sesion valio la pena']
  ];
  for (const [kind, text] of pgs) await S.mutate('paradigm:add', { areaId: salud.id, kind, text });
  const done = S.data.paradigms.find((p) => p.text.indexOf('Si no estoy cansado') === 0);
  if (done) await S.mutate('paradigm:toggle', { id: done.id });

  const ests = [
    ['Dormir 8h fijas, misma hora todos los dias', 'Huberman - sleep toolkit'],
    ['Cortar el estudio a las 3h y repasar al dia siguiente', 'Make It Stick'],
    ['Sin pantallas la hora antes de dormir', 'Huberman - sleep toolkit'],
    ['Ayuno de 16h', 'Video de YouTube']
  ];
  for (const [text, source] of ests) await S.mutate('strategy:add', { areaId: salud.id, text, source });
  const todas = S.data.strategies.filter((s) => s.areaId === salud.id);
  if (todas[0]) await S.mutate('strategy:setStatus', { id: todas[0].id, status: 'funciona' });
  if (todas[2]) await S.mutate('strategy:setStatus', { id: todas[2].id, status: 'funciona' });
  if (todas[3]) await S.mutate('strategy:setStatus', { id: todas[3].id, status: 'descartada' });

  const trabajo = S.data.areas.find((a) => a.name === 'Trabajo');
  await S.mutate('paradigm:add', {
    areaId: trabajo.id, kind: 'drop', text: 'Leer mas paginas es aprender mas'
  });
  await S.mutate('strategy:add', {
    areaId: trabajo.id, text: 'Sacar tres tarjetas de cada clase, el mismo dia', source: 'Woźniak'
  });

  /* --- La oficina de Git: carpetas, papeles y tarjetas ----------------
     Cada carpeta es de SU tema: las de Git no aparecen en las de Tipografía,
     que es justo el punto de que no se compartan. */
  for (const n of ['Comandos', 'Ramas y merge', 'Deshacer cosas']) {
    await S.mutate('noteType:add', { name: n, spotId: git.id });
  }
  const carp = (n) => (S.data.noteTypes.find(
    (t) => t.name === n && t.spotId === git.id) || {}).id || null;

  // Un papel largo: la clase entera, con sus cajas, sus etiquetas y una
  // imagen enlazada desde el texto.
  await S.mutate('review:add', {
    spotId: git.id, typeId: carp('Deshacer cosas'),
    title: 'Clase 5 — deshacer sin romper nada',
    text: '# Deshacer sin romper nada\\n\\n' +
      '## Los tres niveles\\n\\n' +
      '1. **reset** mueve el puntero de la rama. Reescribe historia.\\n' +
      '2. **revert** crea un commit nuevo que deshace otro. No reescribe nada.\\n' +
      '3. **checkout** de un archivo suelto solo toca ese archivo.\\n\\n' +
      '>Si lo que quieres deshacer ya está publicado, revert. Siempre. ' +
      '#historia compartida#<\\n\\n' +
      '!reset --hard se lleva los cambios sin guardar y no hay papelera. ' +
      'Antes de usarlo, stash. #ojo!\\n\\n' +
      '---\\n\\n' +
      '## Cuando ya la has liado\\n\\n' +
      'reflog guarda todos los sitios donde ha estado HEAD, incluso los que ya ' +
      'no apunta ninguna rama. De ahí se recupera casi todo. Mira el ' +
      '[[esquema de reflog]] para ver por dónde pasa.\\n\\n' +
      '- Encuentra el hash en reflog\\n' +
      '- git reset --hard <hash> vuelve a ese punto\\n' +
      '- Si era otra rama, git branch rescate <hash>'
  });
  const clase = S.data.reviews[S.data.reviews.length - 1];

  // Un esquema de ejemplo, para que el panel de la derecha tenga algo.
  const ESQUEMA =
    'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540">' +
      '<rect width="960" height="540" fill="#ffffff"/>' +
      '<rect width="960" height="62" fill="#f2f3f5"/>' +
      '<text x="32" y="40" font-family="Inter,sans-serif" font-size="20" font-weight="700" fill="#12161f">HEAD, las ramas y el reflog</text>' +
      '<line x1="60" y1="200" x2="900" y2="200" stroke="#c2c8d0" stroke-width="3"/>' +
      '<circle cx="130" cy="200" r="22" fill="#5b5bd6"/>' +
      '<circle cx="330" cy="200" r="22" fill="#5b5bd6"/>' +
      '<circle cx="530" cy="200" r="22" fill="#d8dce2"/>' +
      '<circle cx="730" cy="200" r="22" fill="#d8dce2"/>' +
      '<text x="118" y="258" font-family="Inter,sans-serif" font-size="15" fill="#464f5e">A</text>' +
      '<text x="288" y="258" font-family="Inter,sans-serif" font-size="15" font-weight="600" fill="#5b5bd6">B — HEAD</text>' +
      '<text x="488" y="258" font-family="Inter,sans-serif" font-size="15" fill="#737d8c">C huérfano</text>' +
      '<text x="688" y="258" font-family="Inter,sans-serif" font-size="15" fill="#737d8c">D huérfano</text>' +
      '<rect x="60" y="320" width="840" height="92" rx="8" fill="#fdf3e7" stroke="#b54708"/>' +
      '<text x="84" y="354" font-family="Inter,sans-serif" font-size="14" font-weight="700" fill="#b54708">Tras un reset --hard a B</text>' +
      '<text x="84" y="384" font-family="Inter,sans-serif" font-size="14" fill="#464f5e">C y D dejan de estar en la rama, pero siguen en el reflog hasta que pase el recolector.</text>' +
      '<text x="60" y="470" font-family="Inter,sans-serif" font-size="13" fill="#737d8c">git reflog  →  busca el hash  →  git reset --hard &lt;hash&gt;</text>' +
      '<text x="60" y="500" font-family="Inter,sans-serif" font-size="13" fill="#737d8c">Si era otra rama:  git branch rescate &lt;hash&gt;</text>' +
      '</svg>'
    )));
  // El SVG no es de los formatos que Flow guarda; se pinta a PNG antes.
  const png = await new Promise((res) => {
    const im = new Image();
    im.onload = function () {
      const c = document.createElement('canvas');
      c.width = 960; c.height = 540;
      c.getContext('2d').drawImage(im, 0, 0);
      res(c.toDataURL('image/png'));
    };
    im.src = ESQUEMA;
  });
  const guardada = await window.hq.imagen.pegar(clase.id, 'esquema de reflog', png);
  if (guardada && guardada.data) S.data = guardada.data;

  // Sus tarjetas, en distintas fases de aprendizaje: una recién sacada, una
  // asentándose, una sólida y una que se resiste.
  const tarjetas = [
    ['¿reset o revert sobre algo ya publicado?',
     '**revert**. reset reescribe historia que otros ya tienen bajada.', 'nuevo'],
    ['¿Qué hace git reflog que no hace git log?',
     'Enseña también los commits que ya no apunta ninguna rama.\\n\\n' +
     '!Es por donde se recupera algo después de un reset. #rescate!', 'medio'],
    ['¿Qué se lleva reset --hard?',
     'Los cambios sin guardar del directorio de trabajo. No hay papelera.', 'solido'],
    ['¿Diferencia entre merge y rebase?',
     'merge crea un commit de unión y conserva la historia tal cual. ' +
     'rebase reescribe tus commits encima de la otra rama.', 'dificil']
  ];
  for (const [pregunta, respuesta] of tarjetas) {
    await S.mutate('card:add', { notaId: clase.id, pregunta, respuesta });
  }
  const cs = S.data.reviews.find((r) => r.id === clase.id).tarjetas;
  const fases = tarjetas.map((t) => t[2]);
  for (let i = 0; i < cs.length; i++) {
    const respuestas = {
      nuevo: [],
      medio: ['bien', 'bien'],
      solido: ['bien', 'facil', 'bien', 'facil'],
      dificil: ['fallo', 'duro', 'fallo', 'duro']
    }[fases[i]] || [];
    for (const g of respuestas) {
      await S.mutate('card:grade', { notaId: clase.id, id: cs[i].id, grade: g });
    }
  }

  // Otros papeles, para que las carpetas no salgan con uno solo dentro.
  const otros = [
    ['Comandos', 'Los diez comandos del día a día',
     'add, commit, push, pull, status, log, diff, branch, checkout, merge.\\n\\n' +
     '>El 90% del trabajo son estos diez. El resto se busca cuando hace falta.<'],
    ['Comandos', 'Configuración inicial',
     'user.name, user.email y el editor por defecto. Se hace una vez y se olvida.'],
    ['Ramas y merge', 'Cuándo abrir una rama',
     'Cuando el cambio puede quedarse a medias más de un día. Si es de una tarde, ' +
     'no hace falta. #ramas#']
  ];
  for (const [c, title, text] of otros) {
    await S.mutate('review:add', { spotId: git.id, typeId: carp(c), title, text });
  }
  /* Un papel sin tema: el que se quedó solo al borrarse el tema que lo tenía.
     Va en las capturas a propósito, porque es el caso que hay que ver — los
     apuntes siguen ahí y la oficina tiene una puerta para devolverlos. */
  await S.mutate('review:add', {
    spotId: null, typeId: null,
    title: 'Apuntes de la clase del martes',
    text: 'Se quedó sin tema al reorganizar los estantes. El texto sigue entero.'
  });

  /* El texto sale aparte para que se lea aqui tal cual se escribe en el papel:
     el nombre en LaTeX se convierte al teclear, asi que en el archivo ya hay
     letras de verdad. */
  const TEXTO_ING = [
    '## Esfuerzo normal',
    '',
    'El esfuerzo es la fuerza por unidad de area. Se reparte uniforme solo si',
    'la carga pasa por el centroide de la seccion.',
    '',
    '$$',
    'σ = P/A',
    '$$',
    '',
    'La deformacion unitaria ε no tiene unidades: es cuanto se alarga',
    'la pieza dividido por lo que media, $ε = δ/L$.',
    '',
    '>Mientras no pases del limite elastico, las dos van de la mano por la ley',
    'de Hooke y la pendiente es el modulo de Young. #hooke#<',
    '',
    '$$',
    'σ = E*ε',
    'δ = (P*L)/(A*E)',
    '$$',
    '',
    '!Ojo con el area: en un perno roscado manda el area del nucleo, no la',
    'nominal. Es el fallo tipico y ahi $σ_real$ se dispara.!',
    '',
    '## Esfuerzo cortante',
    '',
    'En una viga el cortante no se reparte igual por toda la seccion:',
    '',
    '$$',
    'τ = (V*Q)/(I*t)',
    '$$',
    '',
    '- τ_max esta en el eje neutro, no en las fibras extremas',
    '- En una seccion rectangular vale 1,5 veces el cortante medio',
    '',
    'Y el radio del circulo de Mohr, que sale de las dos:',
    '',
    '$$',
    'R = √(((σ_x - σ_y)/2)^2 + τ_xy^2)',
    '$$'
  ].join(String.fromCharCode(10));

  /* Un tema de ingenieria, que es donde se ven las formulas. Las letras van
     en Unicode de verdad en el texto, como quedan al teclear su nombre. */
  const gIng = await S.mutate('spotGroup:add', { name: 'Ingenieria' });
  const idIng = S.data.spotGroups[S.data.spotGroups.length - 1].id;
  await S.mutate('spot:add', {
    name: 'Mecanica de Materiales', groupId: idIng,
    note: 'Esfuerzo, deformacion y el circulo de Mohr.'
  });
  const temaIng = S.data.spots[S.data.spots.length - 1];
  await S.mutate('noteType:add', { name: 'Esfuerzo y deformacion', spotId: temaIng.id });
  const carpIng = S.data.noteTypes[S.data.noteTypes.length - 1];
  await S.mutate('review:add', {
    spotId: temaIng.id, typeId: carpIng.id,
    title: 'Esfuerzo normal y deformacion',
    text: TEXTO_ING
  });

  /* Dos eventos. No son plan: no suman horas ni se cumplen a medias, y se ven
     distintos a propósito. Los avisos van desarmados para que una tanda de
     capturas no dispare notificaciones de verdad. */
  await S.mutate('event:add', {
    title: 'Reunión con el cliente', date: key(), time: '16:30', avisarMin: -1
  });
  await S.mutate('event:add', {
    title: 'Entrega del informe', date: key(addDays(new Date(), 3)),
    time: '', avisarMin: -1, note: 'Versión final'
  });

  // Una tarjeta suelta en otro papel, para que Hoy tenga cola de verdad.
  const diez = S.data.reviews.find((r) => r.title.indexOf('Los diez comandos') === 0);
  await S.mutate('card:add', {
    notaId: diez.id, pregunta: '¿Qué enseña git status que no enseña git log?',
    respuesta: 'Lo que tienes ahora mismo sin guardar; log solo enseña lo ya guardado.'
  });

  S.ui.estGrupo = gBase.id;
  S.ui.spotId = null;
  S.ui.areaId = salud.id;
  await wait(200);
  return S.data.sessions.length + ' sesiones, ' +
    S.data.reviews.length + ' papeles, ' +
    S.data.reviews.reduce((a, r) => a + r.tarjetas.length, 0) + ' tarjetas';
})()
`;

function run(win, app) {
  const dir = path.join(__dirname, 'shots');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir);

  win.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        const seeded = await win.webContents.executeJavaScript(SEED);
        console.log('Datos de ejemplo: ' + seeded);

        /* ¿Cabe cada vista sin scroll al tamaño con el que abre la app?
           Se mide con datos reales dentro: una vista vacía siempre cabe, y
           medir eso no dice nada. */
        const medida = await win.webContents.executeJavaScript(
          '(async () => { const S = window.H.S; const out = [];' +
          'for (const v of ["today","planner","dashboard","spots","life"]) {' +
          '  S.setView(v); await new Promise(r => setTimeout(r, 320));' +
          '  const c = document.querySelector(".content");' +
          '  out.push({ vista: v, alto: c.scrollHeight, visible: c.clientHeight,' +
          '             sobra: Math.max(0, c.scrollHeight - c.clientHeight) });' +
          '}' +
          'return JSON.stringify({ ventana: [window.outerWidth, window.outerHeight],' +
          ' vistas: out }); })()'
        );
        const m = JSON.parse(medida);
        console.log('\n--- ¿cabe sin scroll? ventana ' + m.ventana.join('x') + ' ---');
        m.vistas.forEach(function (v) {
          console.log('  ' + v.vista.padEnd(10) +
            'contenido ' + String(v.alto).padStart(4) +
            '  hueco ' + String(v.visible).padStart(4) +
            (v.sobra ? '   SE PASA ' + v.sobra + 'px' : '   cabe'));
        });
        console.log('');

        /* Las capturas recorren la oficina en el mismo orden en que se usa:
           estante → tema → carpeta → papel. */
        const irGit = 'H.S.ui.estGrupo=H.S.data.spotGroups[0].id;' +
          'H.S.ui.spotId=(H.S.data.spots.find(s=>s.name.indexOf("Git")===0)||{}).id;';
        const irPapel = irGit +
          'H.S.ui.estCarpeta=(H.S.data.noteTypes.find(t=>t.name==="Deshacer cosas")||{}).id;' +
          'H.S.ui.estPapel=(H.S.data.reviews.find(r=>r.title.indexOf("Clase 5")===0)||{}).id;' +
          'H.S.ui.papelDraft=null;';

        const shots = [
          ['today', 'H.S.setView("today")'],
          ['planner', 'H.S.setView("planner")'],
          ['dashboard-semana', 'H.S.ui.dashRange="week";H.S.setView("dashboard")'],
          ['dashboard-anio', 'H.S.ui.dashRange="year";H.S.setView("dashboard")'],
          // Nivel 1: los temas del estante.
          ['estudio-temas',
           'H.S.ui.estGrupo=H.S.data.spotGroups[0].id;H.S.ui.spotId=null;' +
           'H.S.ui.estCarpeta=null;H.S.ui.estPapel=null;H.S.setView("estudio")'],
          // Nivel 2: la ficha del tema y sus carpetas.
          ['estudio-tema', irGit + 'H.S.ui.estCarpeta=null;H.S.ui.estPapel=null;' +
           'H.S.setView("estudio")'],
          // Nivel 3: los papeles de una carpeta.
          ['estudio-carpeta', irGit +
           'H.S.ui.estCarpeta=(H.S.data.noteTypes.find(t=>t.name==="Deshacer cosas")||{}).id;' +
           'H.S.ui.estPapel=null;H.S.ui.estBusca="";H.S.setView("estudio")'],
          // El papel: teoría a la izquierda, imágenes a la derecha, tarjetas debajo.
          ['estudio-papel', irPapel + 'H.S.ui.papelVista="escribir";' +
           'H.S.ui.imgVer=null;H.S.setView("estudio")'],
          // El mismo papel formateado, con la imagen abierta en su panel.
          ['estudio-papel-vista', irPapel + 'H.S.ui.papelVista="ver";H.S.ui.imgAncho="normal";' +
           'H.S.ui.imgVer=(H.S.data.reviews.find(r=>r.title.indexOf("Clase 5")===0)' +
           '||{imagenes:[]}).imagenes[0].id;H.S.setView("estudio")'],
          // El panel ensanchado: para capturas de pantalla de verdad.
          ['estudio-papel-ancha', irPapel + 'H.S.ui.papelVista="ver";H.S.ui.imgAncho="ancha";' +
           'H.S.ui.imgVer=(H.S.data.reviews.find(r=>r.title.indexOf("Clase 5")===0)' +
           '||{imagenes:[]}).imagenes[0].id;H.S.setView("estudio")'],
          // Formulas y letras griegas, que es media carrera de ingenieria.
          ['estudio-formulas',
           'H.S.ui.estGrupo=(H.S.data.spotGroups.find(g=>g.name.indexOf("Ingenieria")===0)||{}).id;' +
           'H.S.ui.spotId=(H.S.data.spots.find(s=>s.name.indexOf("Mecanica")===0)||{}).id;' +
           'H.S.ui.estCarpeta=(H.S.data.noteTypes.find(t=>t.name.indexOf("Esfuerzo")===0)||{}).id;' +
           'H.S.ui.estPapel=(H.S.data.reviews.find(r=>r.title.indexOf("Esfuerzo normal")===0)||{}).id;' +
           'H.S.ui.papelDraft=null;H.S.ui.papelVista="ver";H.S.ui.imgVer=null;' +
           'H.S.setView("estudio")'],
          // La puerta de vuelta: los papeles que se quedaron sin tema.
          ['estudio-sueltos',
           'H.S.ui.spotId=null;H.S.ui.estCarpeta=null;H.S.ui.estPapel=null;' +
           'H.S.ui.estSueltos=true;H.S.setView("estudio")'],
          ['life', 'H.S.ui.estPapel=null;H.S.ui.imgAncho="normal";' +
           'H.S.ui.estSueltos=false;H.S.setView("life")'],
          // Las estrategias quedan bajo el pliegue: hay que bajar para verlas.
          ['life-estrategias',
           'H.S.setView("life");document.querySelector(".content").scrollTop=99999']
        ];

        /* En claro, pase lo que pase. Si no se fija, una máquina con Windows
           en oscuro devuelve toda la tanda en oscuro y las capturas dejan de
           ser comparables entre corridas. */
        await win.webContents.executeJavaScript(
          'document.documentElement.setAttribute("data-theme","light");' +
          'window.H.refreshTokens();'
        );

        for (const [name, js] of shots) {
          // Se resetea el scroll ANTES de correr el script de cada toma, para
          // que una toma que baja no contamine la siguiente.
          await win.webContents.executeJavaScript(
            'document.querySelector(".content").scrollTop=0;' + js);
          await new Promise((r) => setTimeout(r, 700));
          const img = await win.webContents.capturePage();
          fs.writeFileSync(path.join(dir, name + '.png'), img.toPNG());
          console.log('  shots/' + name + '.png');
        }

        /* Tema oscuro, en las vistas donde más se nota: la de uso diario y
           las que están llenas de color de dato. */
        await win.webContents.executeJavaScript(
          'document.documentElement.setAttribute("data-theme","dark");' +
          'window.H.refreshTokens();'
        );
        for (const [nombre, js] of [
          ['oscuro-hoy', 'H.S.setView("today")'],
          ['oscuro-dashboard', 'H.S.ui.dashRange="week";H.S.setView("dashboard")'],
          ['oscuro-anio', 'H.S.ui.dashRange="year";H.S.setView("dashboard")'],
          ['oscuro-estudio',
           'H.S.ui.spotId=null;H.S.ui.estCarpeta=null;H.S.ui.estPapel=null;' +
           'H.S.setView("estudio")'],
          ['oscuro-planner', 'H.S.setView("planner")']
        ]) {
          await win.webContents.executeJavaScript(
            'document.querySelector(".content").scrollTop=0;' + js);
          await new Promise((r) => setTimeout(r, 700));
          fs.writeFileSync(path.join(dir, nombre + '.png'),
            (await win.webContents.capturePage()).toPNG());
          console.log('  shots/' + nombre + '.png');
        }
        await win.webContents.executeJavaScript(
          'document.documentElement.setAttribute("data-theme","light");' +
          'window.H.refreshTokens(); H.S.render();'
        );
        await new Promise((r) => setTimeout(r, 400));

        /* Prueba visual del sistema: la misma pantalla con la marca cambiada.
           Se toca SOLO --brand; si algo se quedara violeta, se vería aquí. */
        for (const [nombre, brand] of [['verde', '#1f8f5f'], ['azul', '#2563eb']]) {
          await win.webContents.executeJavaScript(
            'document.documentElement.style.setProperty("--brand", "' + brand + '");' +
            'window.H.refreshTokens(); H.S.ui.dashRange="week"; H.S.setView("dashboard");' +
            'document.querySelector(".content").scrollTop=0;'
          );
          await new Promise((r) => setTimeout(r, 800));
          fs.writeFileSync(path.join(dir, 'marca-' + nombre + '.png'),
            (await win.webContents.capturePage()).toPNG());
          console.log('  shots/marca-' + nombre + '.png');
        }
        await win.webContents.executeJavaScript(
          'document.documentElement.style.removeProperty("--brand");' +
          'window.H.refreshTokens(); H.S.render();'
        );
        await new Promise((r) => setTimeout(r, 400));

        // El resumen exportable, generado por la ruta real de la app.
        const resumen = await win.webContents.executeJavaScript(
          '(async () => { const S = window.H.S;' +
          'S.ui.dashRange = "week"; S.setView("dashboard");' +
          'await new Promise(r => setTimeout(r, 300));' +
          'const btn = document.querySelector("#view [data-act=\\"export\\"]");' +
          'if (!btn) return JSON.stringify({ok:false, error:"sin boton"});' +
          'btn.click();' +
          'await new Promise(r => setTimeout(r, 3500));' +
          'const img = document.querySelector("#expBody img");' +
          'const msg = document.querySelector("#expMsg");' +
          'const out = JSON.stringify({ok: !!img, largo: img ? img.src.length : 0,' +
          ' msg: msg ? msg.innerText : "", src: img ? img.src : ""});' +
          'window.H.modals.close(); return out; })()'
        );
        const parsed = JSON.parse(resumen);
        console.log('  resumen: ' + JSON.stringify({ ok: parsed.ok, msg: parsed.msg }));
        if (parsed.ok && parsed.src) {
          const b64 = parsed.src.replace(/^data:image\/png;base64,/, '');
          fs.writeFileSync(path.join(dir, 'export-resumen.png'), Buffer.from(b64, 'base64'));
          console.log('  shots/export-resumen.png');
        }

        // Modal de actividades: es donde se cortaba el valor de la meta.
        await win.webContents.executeJavaScript(
          'H.S.setView("planner"); H.modals.activities(H.S)');
        await new Promise((r) => setTimeout(r, 700));
        fs.writeFileSync(path.join(dir, 'modal-actividades.png'),
          (await win.webContents.capturePage()).toPNG());
        console.log('  shots/modal-actividades.png');
        await win.webContents.executeJavaScript('H.modals.close()');
        await new Promise((r) => setTimeout(r, 300));

        // Las copias de seguridad: la pantalla a la que se viene cuando algo
        // ha salido mal, asi que conviene verla de vez en cuando.
        await win.webContents.executeJavaScript('H.modals.respaldos(H.S)');
        await new Promise((r) => setTimeout(r, 900));
        fs.writeFileSync(path.join(dir, 'modal-copias.png'),
          (await win.webContents.capturePage()).toPNG());
        console.log('  shots/modal-copias.png');
        await win.webContents.executeJavaScript('H.modals.close()');
        await new Promise((r) => setTimeout(r, 300));

        // El widget, en su propia ventana
        const { BrowserWindow } = require('electron');
        const wid = BrowserWindow.getAllWindows().find((w) =>
          w !== win && w.webContents.getURL().indexOf('widget.html') !== -1);
        if (wid) {
          const marca = await wid.webContents.executeJavaScript(
            '(() => { const i = document.querySelector(".w-mark");' +
            'return JSON.stringify({hay: !!i, cargada: i ? i.naturalWidth > 0 : null,' +
            'texto: document.getElementById("w").innerText.replace(/\\n/g, " | ")}); })()'
          );
          console.log('  widget: ' + marca);
          fs.writeFileSync(path.join(dir, 'widget.png'), (await wid.webContents.capturePage()).toPNG());
          console.log('  shots/widget.png');
        } else {
          console.log('  widget: NO ENCONTRADO');
        }

        // Modal de planificacion, que es la pieza estrella
        await win.webContents.executeJavaScript(
          'H.S.setView("planner");H.modals.planDay(H.S, H.dateKey())'
        );
        await new Promise((r) => setTimeout(r, 700));
        fs.writeFileSync(
          path.join(dir, 'modal-planificar.png'),
          (await win.webContents.capturePage()).toPNG()
        );
        console.log('  shots/modal-planificar.png');
      } catch (err) {
        console.log('SHOTS ERROR: ' + err.message + '\n' + err.stack);
      }
      app.quit();
    }, 1400);
  });
}

module.exports = { run };
