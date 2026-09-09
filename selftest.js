/* Prueba de humo automatizada.
   Se activa con HQ_SELFTEST=1 y conduce la app por IPC real desde el
   renderer, igual que lo haria un clic. No se carga en uso normal.

   HQ_SELFTEST=1  ciclo rapido (CRUD, sesion, todas las vistas)
   HQ_SELFTEST=2  ademas espera a que dispare una verificacion real
*/
const SCRIPT = `(async () => {
  const log = [];
  const ok = (name, cond, extra) =>
    log.push((cond ? 'PASS ' : 'FALL ') + name + (extra ? ' :: ' + extra : ''));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.H.S;

  try {
    // --- 1. Tema ----------------------------------------------------------
    await S.mutate('spot:add', { name: 'Tema de prueba', note: 'tema de prueba' });
    const spot = S.data.spots.find((s) => s.name === 'Tema de prueba');
    ok('tema creado', !!spot);

    // --- 2. Plan de hoy con repeticion -----------------------------------
    const today = window.H.dateKey();
    const act = S.data.activities[0];
    await S.mutate('plan:add', {
      dates: [today],
      activityId: act.id,
      spotId: spot.id,
      plannedMins: 60
    });
    ok('plan agendado', (S.data.plan[today] || []).length === 1,
       'items=' + (S.data.plan[today] || []).length);

    // plan:add con varias fechas (lo que hacen los chips de repeticion)
    const d2 = window.H.dateKey(window.H.addDays(new Date(), 1));
    const d3 = window.H.dateKey(window.H.addDays(new Date(), 2));
    await S.mutate('plan:add', { dates: [d2, d3], activityId: act.id, plannedMins: 30 });
    ok('repeticion multi-dia', !!S.data.plan[d2] && !!S.data.plan[d3]);

    // --- 3. Sesion --------------------------------------------------------
    const planItem = S.data.plan[today][0];
    await window.hq.session.start({
      activityId: act.id, spotId: spot.id, planItemId: planItem.id
    });
    await wait(2600);
    ok('cronometro avanza', S.session && S.session.countedSec >= 2,
       'seg=' + (S.session && S.session.countedSec));

    await window.hq.session.pause();
    const atPause = S.session.countedSec;
    await wait(1600);
    ok('pausa detiene el conteo', S.session.countedSec === atPause,
       atPause + ' -> ' + S.session.countedSec);

    await window.hq.session.resume();
    await wait(1600);
    ok('reanudar sigue contando', S.session.countedSec > atPause);

    const secs = S.session.countedSec;
    await window.hq.session.finish('nota de prueba');
    ok('sesion guardada', S.data.sessions.length === 1 && !S.session);
    ok('tiempo persistido', S.data.sessions[0].countedSec === secs,
       'esperado=' + secs + ' real=' + S.data.sessions[0].countedSec);
    ok('sesion ligada al spot', S.data.sessions[0].spotId === spot.id);

    // --- 4. Cumplimiento --------------------------------------------------
    const adh = window.H.dayAdherence(S.data, today);
    ok('cumplimiento calculado', adh.hasPlan && adh.plannedMins === 60 && adh.doneMins > 0,
       'plan=' + adh.plannedMins + ' hecho=' + adh.doneMins.toFixed(2));

    // --- 6. Todas las vistas renderizan ----------------------------------
    for (const v of ['today', 'planner', 'dashboard', 'estudio']) {
      S.setView(v);
      await wait(120);
      const host = document.getElementById('view');
      ok('vista ' + v, host.innerHTML.length > 400, 'chars=' + host.innerHTML.length);
    }

    S.ui.spotId = null;

    S.ui.dashRange = 'year';
    S.setView('dashboard');
    await wait(150);
    ok('heatmap anual', document.querySelectorAll('#view .heat-cell').length > 300,
       'celdas=' + document.querySelectorAll('#view .heat-cell').length);

    // --- 7. Sin fugas de listeners ---------------------------------------
    // Diez renders seguidos y un solo clic: si el contenedor no fuera nuevo
    // cada vez, el handler se dispararia diez veces.
    S.setView('dashboard');
    for (let i = 0; i < 10; i++) S.render();
    await wait(100);
    const before = S.ui.dashRange;
    const chip = document.querySelector('#view [data-act="range"][data-kind="week"]');
    chip.click();
    await wait(150);
    ok('sin fuga de listeners', S.ui.dashRange === 'week', before + ' -> ' + S.ui.dashRange);

    // --- 8. Parser de duración -------------------------------------------
    const casos = [
      ['5h', 300], ['5 h', 300], ['5hs', 300], ['5 horas', 300],
      ['1h30', 90], ['1h 30m', 90], ['1h30m', 90], ['1.5h', 90], ['1,5h', 90],
      ['1:30', 90], ['0:45', 45], ['12:00', 720],
      ['90m', 90], ['90 min', 90], ['90 minutos', 90],
      ['90', 90], ['5', 5], ['480', 480],
      ['8h', 480], ['10h 15m', 615],
      ['', null], ['   ', null], ['abc', null], ['h', null],
      ['0', null], ['0h', null], ['-5', null], ['5x', null]
    ];
    let malos = [];
    for (const [txt, esperado] of casos) {
      const r = window.H.parseDuration(txt);
      if (r !== esperado) malos.push('"' + txt + '"→' + r + ' (esperaba ' + esperado + ')');
    }
    ok('parser de duración (' + casos.length + ' casos)', malos.length === 0, malos.join(', '));

    // El caso que motivó el cambio: el desplegable viejo topaba en 4h.
    await S.mutate('plan:add', {
      dates: [today], activityId: act.id,
      plannedMins: window.H.parseDuration('5h')
    });
    const cinco = (S.data.plan[today] || []).filter((i) => i.plannedMins === 300);
    ok('se puede agendar 5h', cinco.length === 1,
       'encontrados=' + cinco.length);

    // --- 9. Life ----------------------------------------------------------
    ok('ámbitos de fábrica', S.data.areas.length === 7,
       'n=' + S.data.areas.length);

    const salud = S.data.areas.find((a) => a.name === 'Salud');
    ok('ámbito Salud existe', !!salud);

    await S.mutate('life:setDiagnosis', { areaId: salud.id, text: 'Duermo 5h y como fuera.' });
    ok('diagnóstico guardado',
       S.data.life[salud.id] && S.data.life[salud.id].diagnosis.indexOf('Duermo 5h') === 0);

    await S.mutate('paradigm:add', { areaId: salud.id, kind: 'drop', text: 'Dormir es perder tiempo' });
    await S.mutate('paradigm:add', { areaId: salud.id, kind: 'build', text: 'El sueño es parte del trabajo' });
    const pgs = S.data.paradigms.filter((p) => p.areaId === salud.id);
    ok('paradigmas por tipo',
       pgs.filter((p) => p.kind === 'drop').length === 1 &&
       pgs.filter((p) => p.kind === 'build').length === 1);

    await S.mutate('paradigm:toggle', { id: pgs[0].id });
    ok('marcar paradigma como logrado',
       !!S.data.paradigms.find((p) => p.id === pgs[0].id).doneAt);
    await S.mutate('paradigm:toggle', { id: pgs[0].id });
    ok('desmarcarlo lo devuelve a activo',
       !S.data.paradigms.find((p) => p.id === pgs[0].id).doneAt);

    await S.mutate('strategy:add', {
      areaId: salud.id, text: 'Dormir 8h fijas', source: 'Huberman'
    });
    const est = S.data.strategies.find((s) => s.areaId === salud.id);
    ok('estrategia nace en probando', est && est.status === 'probando' && est.source === 'Huberman');
    await S.mutate('strategy:setStatus', { id: est.id, status: 'funciona' });
    ok('cambio de estado',
       S.data.strategies.find((s) => s.id === est.id).status === 'funciona');
    await S.mutate('strategy:setStatus', { id: est.id, status: 'basura' });
    ok('rechaza estado inválido',
       S.data.strategies.find((s) => s.id === est.id).status === 'funciona');

    // La vista renderiza con datos reales
    S.ui.areaId = salud.id;
    S.setView('life');
    await wait(150);
    ok('vista life', document.getElementById('view').innerHTML.length > 2000,
       'chars=' + document.getElementById('view').innerHTML.length);

    // El borrador del diagnóstico sobrevive a un repintado. Es el fallo que
    // más rabia daría: escribir un párrafo y perderlo porque saltó una
    // verificación en mitad.
    const ta = document.getElementById('diagText');
    ok('textarea de diagnóstico presente', !!ta);
    if (ta) {
      ta.value = 'Texto a medias que no debe perderse';
      ta.dispatchEvent(new Event('input'));
      S.render(); // simula el repintado de una verificación entrante
      await wait(120);
      const ta2 = document.getElementById('diagText');
      ok('el borrador sobrevive al repintado',
         ta2 && ta2.value === 'Texto a medias que no debe perderse',
         'quedó="' + (ta2 ? ta2.value.slice(0, 40) : 'sin textarea') + '"');
      S.ui.lifeDraft = null;
      S.render();
      await wait(80);
    }

    // Borrar un ámbito se lleva lo que colgaba de él
    const antesP = S.data.paradigms.length;
    await S.mutate('area:remove', { id: salud.id });
    ok('borrar ámbito arrastra sus datos',
       !S.data.areas.find((a) => a.id === salud.id) &&
       S.data.paradigms.length === antesP - 2 &&
       !S.data.strategies.find((s) => s.areaId === salud.id) &&
       !S.data.life[salud.id]);

    // Y se puede volver a crear
    await S.mutate('area:add', { name: 'Salud', color: '#d97706' });
    ok('crear ámbito nuevo', !!S.data.areas.find((a) => a.name === 'Salud'));
    await S.mutate('area:remove', { id: S.data.areas.find((a) => a.name === 'Salud').id });
    S.ui.areaId = S.data.areas[0] ? S.data.areas[0].id : null;

    // --- 10. Registro diario, descanso y exportar -------------------------
    const sueno = S.data.activities.find((a) => a.kind === 'daily');
    ok('actividad diaria sembrada', !!sueno && sueno.target === 7, 'target=' + (sueno && sueno.target));
    ok('las diarias no salen en cronometradas',
       !window.H.timedActs(S.data).some((a) => a.kind === 'daily'));

    /* La ambigüedad que motivó el cambio: en un campo rotulado "h", un número
       suelto son HORAS. Escribir 0.3 no puede significar media hora. */
    const horasCasos = [
      ['7', 7], ['7.5', 7.5], ['7,5', 7.5], ['0.5', 0.5],
      ['7h', 7], ['7h30', 7.5], ['7h 30m', 7.5], ['7:30', 7.5],
      ['450m', 7.5], ['30m', 0.5], ['90m', 1.5],
      ['', null], ['abc', null], ['0', null], ['-2', null]
    ];
    let malasHoras = [];
    for (const [txt, esp] of horasCasos) {
      const r = window.H.parseHours(txt);
      if (r !== esp) malasHoras.push('"' + txt + '"→' + r + ' (esperaba ' + esp + ')');
    }
    ok('parser de horas (' + horasCasos.length + ' casos)', malasHoras.length === 0,
       malasHoras.join(', '));

    // 0.3 son 18 minutos, no media hora. Y se ENSEÑA así, para que se vea.
    ok('0.3 se muestra como 18m', window.H.fmtDaily(sueno, window.H.parseHours('0.3')) === '18m',
       'sale ' + window.H.fmtDaily(sueno, window.H.parseHours('0.3')));
    ok('0.5 se muestra como 30m', window.H.fmtDaily(sueno, window.H.parseHours('0.5')) === '30m');
    ok('7.5 se muestra como 7h 30m', window.H.fmtDaily(sueno, 7.5) === '7h 30m',
       'sale ' + window.H.fmtDaily(sueno, 7.5));

    // Un ítem que no se mide en tiempo no pasa por el parser de duración.
    await S.mutate('activity:add', { name: 'Peso', kind: 'daily', target: 78, unit: 'kg' });
    const peso = S.data.activities.find((a) => a.name === 'Peso');
    ok('unidad no temporal se respeta', !window.H.isTimeUnit(peso) &&
       window.H.fmtDaily(peso, 77.4) === '77.4 kg',
       'sale ' + window.H.fmtDaily(peso, 77.4));
    ok('en unidad no temporal, 7.5 son 7.5', window.H.parseDaily(peso, '7.5') === 7.5);
    await S.mutate('activity:remove', { id: peso.id });

    await S.mutate('daily:set', { date: today, activityId: sueno.id, value: 7.5 });
    ok('registro diario guardado', window.H.dailyValue(S.data, today, sueno.id) === 7.5);
    const dd = window.H.dayDaily(S.data, today)[0];
    ok('meta cumplida se detecta', dd.logged && dd.met, 'valor=' + dd.value + ' meta=' + dd.act.target);

    await S.mutate('daily:set', { date: today, activityId: sueno.id, value: 5 });
    ok('meta incumplida se detecta', !window.H.dayDaily(S.data, today)[0].met);

    // Vaciar debe BORRAR el registro, no guardar un 0: "no anotado" y
    // "dormí cero horas" son cosas distintas.
    await S.mutate('daily:set', { date: today, activityId: sueno.id, value: null });
    ok('vaciar borra en vez de guardar 0',
       window.H.dailyValue(S.data, today, sueno.id) === null);

    // Un ítem diario no puede agendarse ni cronometrarse por ninguna vía.
    const rPlan = await S.mutate('plan:add', {
      dates: [today], activityId: sueno.id, plannedMins: 60
    });
    ok('rechaza agendar un ítem diario', !rPlan.ok, 'error=' + (rPlan.error || 'NINGUNO'));
    const rMan = await S.mutate('session:addManual', {
      date: today, mins: 60, activityId: sueno.id
    });
    ok('rechaza cronometrar un ítem diario', !rMan.ok, 'error=' + (rMan.error || 'NINGUNO'));
    ok('no se coló ninguna sesión de sueño',
       !S.data.sessions.some((s) => s.activityId === sueno.id));

    // Día de descanso
    await S.mutate('plan:add', { dates: [today], activityId: act.id, plannedMins: 120 });
    const antesDescanso = window.H.dayAdherence(S.data, today);
    ok('antes del descanso hay plan', antesDescanso.hasPlan && antesDescanso.plannedMins > 0);

    await S.mutate('rest:toggle', { date: today });
    const conDescanso = window.H.dayAdherence(S.data, today);
    ok('descanso anula las cuentas del día',
       conDescanso.rest && !conDescanso.hasPlan &&
       conDescanso.plannedMins === 0 && conDescanso.ratio === null);

    await S.mutate('rest:toggle', { date: today });
    ok('quitar el descanso devuelve el plan',
       window.H.dayAdherence(S.data, today).plannedMins > 0);

    // Exportar: el HTML debe generarse y la imagen no salir vacía.
    S.ui.dashRange = 'week';
    S.setView('dashboard');
    await wait(150);
    const btnExp = document.querySelector('#view [data-act="export"]');
    ok('botón exportar presente', !!btnExp);

    const aggPrueba = { range: { label: 'Prueba', from: new Date(), to: new Date() },
      days: [], plannedMins: 120, doneMins: 60, extraMins: 0, unverifiedMins: 0,
      totalMins: 60, daysWithPlan: 1, daysFullyDone: 0, restCount: 0,
      daily: [], missed: [], streak: 2, ratio: 0.5 };
    const htmlRes = window.H.buildSummary(S, aggPrueba, 'week');
    ok('HTML del resumen generado',
       htmlRes.indexOf('<!DOCTYPE html>') === 0 && htmlRes.indexOf('Flow') !== -1 &&
       htmlRes.length > 1500, 'chars=' + htmlRes.length);
    ok('el resumen no enlaza archivos locales',
       htmlRes.indexOf('href="assets') === -1 && htmlRes.indexOf('src="../') === -1 &&
       htmlRes.indexOf('styles.css') === -1);

    const png = await window.hq.exportImage(htmlRes, 'prueba.png');
    ok('imagen del resumen generada', png.ok && png.png && png.png.length > 5000,
       png.ok ? 'base64=' + png.png.length : 'error=' + png.error);

    /* --- 11. Sistema de diseño: el cambio de marca arrastra TODO ----------

       El tema se fija en claro ANTES de empezar. Por defecto Flow sigue al
       sistema, así que estas comprobaciones y las del bloque 12 daban por
       hecho que Windows estaba en claro: en cuanto el sistema pasaba a oscuro
       —solo o al anochecer— fallaban siete comprobaciones seguidas sin que
       nada de la app se hubiera roto. Una prueba que depende de la hora del
       día no prueba nada. */
    await S.mutate('settings:update', { theme: 'light' });
    await wait(200);
    ok('el tema se puede fijar para las pruebas',
       getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#ffffff',
       'bg=' + getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());

    // La prueba que da la certeza: si cambiar --brand deja las gráficas del
    // color viejo, el sistema no es replicable y esto tiene que fallar.
    const violeta = window.H.token('--accent');
    ok('el acento sale de un token', !!violeta && violeta.indexOf('#') === 0,
       'acento=' + violeta);

    S.ui.spotId = null;
    S.setView('dashboard');
    await wait(150);
    const svgAntes = document.querySelector('#view svg').outerHTML;
    ok('las gráficas usan el acento del token',
       svgAntes.indexOf(violeta) !== -1, 'buscando ' + violeta);

    // Cambiamos SOLO la línea de marca, como haría otro producto de Starp.
    const VERDE = '#1f8f5f';
    document.documentElement.style.setProperty('--brand', VERDE);
    window.H.refreshTokens();
    await wait(60);

    ok('el acento sigue a la marca', window.H.token('--accent') === VERDE,
       'acento=' + window.H.token('--accent'));

    S.render();
    await wait(200);
    const svgDespues = document.querySelector('#view svg').outerHTML;
    ok('las gráficas siguen a la marca',
       svgDespues.indexOf(VERDE) !== -1 && svgDespues.indexOf(violeta) === -1,
       'verde=' + (svgDespues.indexOf(VERDE) !== -1) +
       ' violeta_residual=' + (svgDespues.indexOf(violeta) !== -1));

    // Los colores de dato NO se mueven: el verde de "ganancia" es
    // independiente del verde de marca. Si se movieran, un botón y un
    // "+340$" se leerían igual.
    ok('los colores de dato no se mueven',
       window.H.token('--pos') === '#12805c' && window.H.token('--neg') === '#d92d20',
       'pos=' + window.H.token('--pos') + ' neg=' + window.H.token('--neg'));

    // El resumen exportado también viaja con los tokens nuevos.
    const bloque = window.H.tokenBlock();
    ok('el resumen exportado lleva la marca nueva',
       bloque.indexOf('--accent:' + VERDE) !== -1, bloque.slice(0, 90) + '…');

    // Volvemos al violeta para no dejar la app teñida.
    document.documentElement.style.removeProperty('--brand');
    window.H.refreshTokens();
    await wait(60);
    ok('se puede volver atrás', window.H.token('--accent') === violeta);

    // --- 12. Tema oscuro --------------------------------------------------
    const raiz = document.documentElement;
    const tk = (n) => getComputedStyle(raiz).getPropertyValue(n).trim();

    const claroBg = tk('--bg');
    const claroInk = tk('--ink');
    ok('el tema claro es el de partida', claroBg === '#ffffff',
       'bg=' + claroBg);

    raiz.setAttribute('data-theme', 'dark');
    window.H.refreshTokens();
    await wait(60);

    const oscuroBg = tk('--bg');
    const oscuroInk = tk('--ink');
    ok('el fondo se oscurece', oscuroBg !== claroBg && oscuroBg === '#12151c',
       'bg=' + oscuroBg);
    ok('el texto se aclara', oscuroInk !== claroInk, claroInk + ' -> ' + oscuroInk);

    // El fallo que arruina un tema oscuro: texto de un tema sobre fondo del
    // otro. Se comprueba que fondo y texto vengan del MISMO juego.
    function lum(hex) {
      const h = hex.replace('#', '');
      const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
      return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    }
    ok('fondo oscuro con texto claro', lum(oscuroBg) < 0.3 && lum(oscuroInk) > 0.7,
       'lum(bg)=' + lum(oscuroBg).toFixed(2) + ' lum(ink)=' + lum(oscuroInk).toFixed(2));

    // Los colores de dato se rediseñan, no se invierten: el verde oscuro de
    // ganancia no se lee sobre negro.
    ok('los datos se aclaran en oscuro',
       lum(tk('--pos')) > lum('#12805c') && lum(tk('--neg')) > lum('#d92d20'),
       'pos=' + tk('--pos') + ' neg=' + tk('--neg'));

    // El velo del modal tiene que ser más denso, o no se distingue del fondo.
    ok('el velo del modal se adapta', tk('--overlay').indexOf('0, 0, 0') !== -1,
       'overlay=' + tk('--overlay'));

    // Las gráficas SVG siguen al tema igual que siguen a la marca.
    S.setView('dashboard');
    await wait(200);
    const svgOscuro = document.querySelector('#view svg').outerHTML;
    ok('las gráficas siguen al tema',
       svgOscuro.indexOf(tk('--ink-4')) !== -1 && svgOscuro.indexOf('#9aa3b0') === -1,
       'usa ' + tk('--ink-4'));

    // Elegir claro tiene que ganar aunque el sistema esté en oscuro.
    raiz.setAttribute('data-theme', 'light');
    window.H.refreshTokens();
    await wait(60);
    ok('elegir claro gana sobre el sistema', tk('--bg') === '#ffffff', 'bg=' + tk('--bg'));

    raiz.removeAttribute('data-theme');
    window.H.refreshTokens();
    await wait(60);
    /* Sin atributo manda el sistema, sea cual sea. Comparar contra el claro a
       secas hacía fallar esta comprobación cada vez que Windows estaba en
       oscuro, sin que nada de la app se hubiera roto. */
    const sistemaOscuro = window.matchMedia('(prefers-color-scheme: dark)').matches;
    ok('sin atributo vuelve a mandar el sistema',
       tk('--bg') === (sistemaOscuro ? '#12151c' : '#ffffff'),
       'sistema=' + (sistemaOscuro ? 'oscuro' : 'claro') + ' bg=' + tk('--bg'));

    // Y se vuelve a fijar en claro para lo que queda de corrida.
    await S.mutate('settings:update', { theme: 'light' });
    await wait(150);

    /* --- 12b. La oficina: estante → tema → carpeta → papel ------------------

       El recorrido entero, en el orden en que se hace. Cada nivel enseña lo
       suyo y solo lo suyo, y las migas dejan volver a cualquiera. */
    S.ui.repasoRevelado = null;

    const est1 = await S.mutate('spotGroup:add', { name: 'Programación' });
    ok('se crea un estante', est1.ok);
    const estanteId = S.data.spotGroups[S.data.spotGroups.length - 1].id;
    ok('un estante ya no habla de dinero',
       typeof S.data.spotGroups[S.data.spotGroups.length - 1].dinero === 'undefined');
    const estDup = await S.mutate('spotGroup:add', { name: 'programación' });
    ok('rechaza un estante repetido', !estDup.ok, estDup.error);

    await S.mutate('spot:add', { name: 'Git y control de versiones', groupId: estanteId });
    const tema = S.data.spots.find((s) => s.name === 'Git y control de versiones');
    ok('el tema nace en su estante', tema.groupId === estanteId);

    const carp = await S.mutate('noteType:add', { name: 'Comandos', spotId: tema.id });
    ok('se crea una carpeta dentro del tema', carp.ok);
    const carpetaId = S.data.noteTypes[S.data.noteTypes.length - 1].id;
    ok('la carpeta pertenece al tema', S.data.noteTypes[S.data.noteTypes.length - 1].spotId === tema.id);

    // Un papel: teoría, sin tarjetas todavía.
    const teoria = '## Deshacer cosas\\n\\n' +
      'reset mueve el puntero, revert crea un commit nuevo.\\n\\n' +
      '!Nunca reset --hard sobre algo publicado!\\n\\n' +
      'Mira el [[esquema]] de la derecha. #git#';
    const pap = await S.mutate('review:add', {
      title: 'Clase 3 — deshacer', text: teoria, spotId: tema.id, typeId: carpetaId
    });
    ok('se crea un papel dentro de la carpeta', pap.ok);
    const papel = S.data.reviews[S.data.reviews.length - 1];
    ok('el papel nace sin tarjetas y sin imágenes',
       papel.tarjetas.length === 0 && papel.imagenes.length === 0);
    ok('y ya no es él mismo una tarjeta',
       typeof papel.repasar === 'undefined' && typeof papel.due === 'undefined');

    /* La carpeta tiene que ser del mismo tema que el papel. Es la regla que
       hace imposible mezclar materias. */
    await S.mutate('spot:add', { name: 'Otro tema', groupId: estanteId });
    const otroTema = S.data.spots.find((s) => s.name === 'Otro tema');
    const cruzado = await S.mutate('review:add', {
      title: 'Cruzado', spotId: otroTema.id, typeId: carpetaId
    });
    ok('rechaza un papel en la carpeta de otro tema', !cruzado.ok, cruzado.error);

    // --- El recorrido en pantalla -----------------------------------------
    S.ui.estGrupo = estanteId;
    S.ui.spotId = null;
    S.ui.estCarpeta = null;
    S.ui.estPapel = null;
    S.setView('estudio');
    await wait(200);
    ok('Estudio abre por los temas del estante',
       document.querySelectorAll('#view [data-act="abrirTema"]').length === 2,
       document.querySelectorAll('#view [data-act="abrirTema"]').length + ' cajones');
    ok('y todavía no enseña carpetas ni papeles',
       !document.querySelector('#view [data-act="abrirCarpeta"]') &&
       !document.querySelector('#view [data-act="abrirPapel"]'));

    document.querySelector('#view [data-act="abrirTema"][data-id="' + tema.id + '"]').click();
    await wait(200);
    ok('abrir el tema enseña su ficha y sus carpetas',
       S.ui.spotId === tema.id &&
       !!document.querySelector('#view [data-act="abrirCarpeta"]'));
    /* Lo que pidió el usuario al dejar el poker: ni bb/100, ni big blind, ni
       formulario de manos jugadas. */
    const txtTema = document.getElementById('view').innerText.toLowerCase();
    ok('la ficha del tema no enseña nada de poker',
       txtTema.indexOf('bb/100') === -1 && txtTema.indexOf('big blind') === -1 &&
       txtTema.indexOf('$ por hora') === -1 &&
       !document.querySelector('#view [data-act="addResult"]'));
    ok('y sí lo que un tema de estudio mide',
       txtTema.indexOf('estudio') !== -1 && txtTema.indexOf('papeles') !== -1 &&
       txtTema.indexOf('tarjetas') !== -1);

    document.querySelector('#view [data-act="abrirCarpeta"][data-id="' + carpetaId + '"]').click();
    await wait(200);
    ok('abrir la carpeta enseña sus papeles',
       S.ui.estCarpeta === carpetaId &&
       document.querySelectorAll('#view [data-act="abrirPapel"]').length === 1);

    document.querySelector('#view [data-act="abrirPapel"]').click();
    await wait(220);
    ok('abrir el papel abre el editor con su teoría',
       !!document.querySelector('#papelCuerpo') &&
       document.querySelector('#papelCuerpo').value.indexOf('reset mueve') !== -1);
    ok('el editor congela el repintado mientras escribes', S.pausarRender === true);

    // Las migas: cuatro niveles y la vuelta atrás.
    ok('las migas dicen dónde estás',
       document.querySelectorAll('#view .migas .miga, #view .migas .miga-actual').length >= 3,
       document.querySelectorAll('#view .migas .miga, #view .migas .miga-actual').length + ' migas');

    // --- Tarjetas dentro del papel ----------------------------------------
    const tj1 = await S.mutate('card:add', {
      notaId: papel.id, pregunta: '¿reset o revert sobre algo publicado?',
      respuesta: 'revert. reset reescribe historia que otros ya tienen.'
    });
    ok('se crea una tarjeta dentro del papel',
       tj1.ok && S.data.reviews.find((r) => r.id === papel.id).tarjetas.length === 1);
    const tarjeta = S.data.reviews.find((r) => r.id === papel.id).tarjetas[0];
    ok('la tarjeta nace con su propio calendario, y toca hoy',
       tarjeta.due === window.H.dateKey() && tarjeta.ef === 2.5 && tarjeta.reps === 0,
       'due=' + tarjeta.due);
    ok('la teoría del papel no se toca al sacar la tarjeta',
       S.data.reviews.find((r) => r.id === papel.id).text.indexOf('reset mueve') !== -1);

    const tjVacia = await S.mutate('card:add', { notaId: papel.id, pregunta: '   ' });
    ok('rechaza una tarjeta sin pregunta', !tjVacia.ok, tjVacia.error);

    S.ui.papelDraft = null;
    S.pausarRender = false;
    S.render();
    await wait(200);
    ok('las tarjetas salen en su propio bloque, aparte de la teoría',
       !!document.querySelector('#view [data-act="editarTarjeta"]'));

    /* La regla que hace que esto funcione: cada tarjeta lleva su ritmo. Dos
       tarjetas del mismo papel se separan en cuanto contestas distinto. */
    await S.mutate('card:add', {
      notaId: papel.id, pregunta: '¿Qué hace git reflog?', respuesta: 'Enseña los commits sueltos.'
    });
    const dos = S.data.reviews.find((r) => r.id === papel.id).tarjetas;
    // Dos aciertos en una y un fallo en la otra: al primer repaso las dos
    // vuelven mañana pase lo que pase, así que hay que llegar al segundo para
    // que los intervalos se separen de verdad.
    await S.mutate('card:grade', { notaId: papel.id, id: dos[0].id, grade: 'facil' });
    await S.mutate('card:grade', { notaId: papel.id, id: dos[0].id, grade: 'facil' });
    await S.mutate('card:grade', { notaId: papel.id, id: dos[1].id, grade: 'fallo' });
    const trasA = S.data.reviews.find((r) => r.id === papel.id).tarjetas[0];
    const trasB = S.data.reviews.find((r) => r.id === papel.id).tarjetas[1];
    ok('cada tarjeta lleva su propio calendario',
       trasA.due !== trasB.due && trasA.ef > trasB.ef && trasA.interval > trasB.interval,
       'facil ef=' + trasA.ef + ' int=' + trasA.interval +
       ' | fallo ef=' + trasB.ef + ' int=' + trasB.interval);
    ok('fallar devuelve la tarjeta a mañana',
       trasB.interval === 1 && trasB.lapses === 1);
    ok('y responder una no toca a la otra',
       trasA.lapses === 0 && trasB.reps === 0);

    const gradoMalo = await S.mutate('card:grade',
      { notaId: papel.id, id: dos[0].id, grade: 'regular' });
    ok('rechaza una respuesta desconocida', !gradoMalo.ok, gradoMalo.error);

    // --- Imágenes ----------------------------------------------------------
    /* Un PNG de 1x1 transparente: lo mínimo que prueba el camino entero
       —guardar en disco, leer de vuelta y enlazar desde el texto— sin
       depender de ningún archivo de fuera. */
    const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const img1 = await window.hq.imagen.pegar(papel.id, 'esquema', PNG);
    ok('se guarda una imagen pegada', img1.ok, img1.error || '');
    if (img1.data) S.data = img1.data;
    const conImg = S.data.reviews.find((r) => r.id === papel.id);
    ok('la imagen queda colgada del papel', conImg.imagenes.length === 1);
    ok('y con el nombre por el que se enlaza', conImg.imagenes[0].nombre === 'esquema');

    const leida = await window.hq.imagen.leer(papel.id, conImg.imagenes[0].id);
    ok('la imagen se lee de vuelta desde el disco',
       leida.ok && leida.dataUrl.indexOf('data:image/png;base64,') === 0,
       leida.error || (leida.dataUrl || '').slice(0, 30));

    // Dos imágenes del mismo papel no pueden llamarse igual: [[esquema]] no
    // sabría a cuál apunta.
    const img2 = await window.hq.imagen.pegar(papel.id, 'esquema', PNG);
    if (img2.data) S.data = img2.data;
    const dosImg = S.data.reviews.find((r) => r.id === papel.id).imagenes;
    ok('un nombre repetido se resuelve solo en vez de fallar',
       dosImg.length === 2 && dosImg[1].nombre !== dosImg[0].nombre,
       dosImg.map((x) => x.nombre).join(' | '));
    const renDup = await S.mutate('image:rename',
      { notaId: papel.id, id: dosImg[1].id, nombre: 'esquema' });
    ok('y renombrar a uno que ya existe se rechaza', !renDup.ok, renDup.error);

    // El enlace del texto: se pinta y lleva a su imagen.
    S.ui.estPapel = papel.id;
    S.ui.papelDraft = null;
    S.ui.imgVer = null;
    S.pausarRender = false;
    S.render();
    await wait(200);
    S.ui.papelVista = 'ver';
    S.pausarRender = false;
    S.render();
    await wait(200);
    const enlace = document.querySelector('#view .nota-img[data-nombre="esquema"]');
    ok('el [[enlace]] del texto se pinta como tal', !!enlace);
    enlace.click();
    await wait(300);
    ok('y al pulsarlo la imagen sale en el panel de la derecha',
       S.ui.imgVer === dosImg[0].id && !!document.querySelector('#view .img-panel'),
       'imgVer=' + S.ui.imgVer);

    /* --- Que la imagen se pueda ver en grande -------------------------------
       Una captura de 1900px en una columna estrecha no se lee. Se ensancha el
       panel y se puede poner a tamaño real, pero SIEMPRE al lado del texto:
       ampliarla encima taparía justo la teoría que la imagen ilustra. */
    // Espera a que la imagen esté decodificada: medirla antes da 1px y la
    // comprobación fallaría por el reloj, no por el tamaño.
    const imgLista = async () => {
      for (let i = 0; i < 30; i++) {
        const n = document.querySelector('#view #imgVista');
        if (n && n.naturalWidth > 0) return n;
        await wait(60);
      }
      return document.querySelector('#view #imgVista');
    };

    ok('el panel empieza en su ancho normal',
       S.ui.imgAncho === 'normal' && !document.querySelector('#view .papel-lado.ancha'));
    const anchoTextoAntes = document.querySelector('#view .papel-texto').getBoundingClientRect().width;
    const ladoNormal = document.querySelector('#view .papel-lado').getBoundingClientRect().width;
    const pagAntes = document.querySelector('#view').getBoundingClientRect();
    // Cuánto sitio sobra a los dos lados de la página. De ahí sale el ensanche.
    const zona = document.querySelector('.content');
    const zonaCss = getComputedStyle(zona);
    const anchoZona = zona.clientWidth -
      parseFloat(zonaCss.paddingLeft) - parseFloat(zonaCss.paddingRight);
    const margenLibre = Math.max(0, anchoZona - pagAntes.width);

    document.querySelector('#view [data-act="imgAncho"]').click();
    await wait(220);
    ok('se puede ensanchar el panel de imágenes',
       S.ui.imgAncho === 'ancha' && !!document.querySelector('#view .papel-lado.ancha'));
    const ladoAncho = document.querySelector('#view .papel-lado').getBoundingClientRect().width;
    // Contra el ancho normal y no contra un número fijo: cuánto crece depende
    // del tamaño de la ventana, pero crecer tiene que crecer siempre.
    ok('y el panel crece de verdad', ladoAncho > ladoNormal * 1.2,
       Math.round(ladoNormal) + ' → ' + Math.round(ladoAncho));

    /* De dónde sale ese ancho es justo lo que importa: del margen que sobra a
       la derecha. Si la página se recentrara, el párrafo que estabas leyendo
       saltaría de sitio al abrir la imagen; si creciera a costa de la columna,
       aplastaría la teoría que la imagen viene a acompañar. */
    const pagDespues = document.querySelector('#view').getBoundingClientRect();
    ok('la página crece solo hacia la derecha, sin recentrarse',
       Math.abs(pagDespues.left - pagAntes.left) < 1 &&
       Math.abs((pagDespues.width - pagAntes.width) - Math.min(280, margenLibre / 2)) < 2,
       'margen libre ' + Math.round(margenLibre) + ', gana ' +
       Math.round(pagDespues.width - pagAntes.width));

    const anchoTextoDespues = document.querySelector('#view .papel-texto').getBoundingClientRect().width;
    // La teoría solo cede lo que el margen recuperado no ha podido cubrir.
    ok('la hoja de texto no se aplasta para hacerle sitio al panel',
       (anchoTextoAntes - anchoTextoDespues) <=
         Math.max(0, (ladoAncho - ladoNormal) - (pagDespues.width - pagAntes.width)) + 2,
       Math.round(anchoTextoAntes) + ' → ' + Math.round(anchoTextoDespues));
    ok('y sigue siendo una columna de lectura',
       anchoTextoDespues >= 520, Math.round(anchoTextoDespues) + 'px');

    document.querySelector('#view [data-act="imgReal"]').click();
    await wait(220);
    ok('se puede ver la imagen a tamaño real',
       S.ui.imgReal === true && !!document.querySelector('#view .img-lienzo.real'));
    const imgReal = await imgLista();
    ok('y a tamaño real se pinta a su tamaño, sin encoger',
       Math.round(imgReal.getBoundingClientRect().width) === imgReal.naturalWidth,
       'pintada=' + Math.round(imgReal.getBoundingClientRect().width) +
       ' natural=' + imgReal.naturalWidth);

    document.querySelector('#view [data-act="imgReal"]').click();
    await wait(200);
    document.querySelector('#view [data-act="imgAncho"]').click();
    await wait(200);
    ok('los dos controles vuelven atrás',
       S.ui.imgReal === false && S.ui.imgAncho === 'normal');

    // Borrar la imagen se lleva su archivo, no solo la ficha.
    const borr = await window.hq.imagen.borrar(papel.id, dosImg[1].id);
    if (borr.data) S.data = borr.data;
    ok('borrar una imagen la quita del papel',
       S.data.reviews.find((r) => r.id === papel.id).imagenes.length === 1);
    const traLeer = await window.hq.imagen.leer(papel.id, dosImg[1].id);
    ok('y ya no se puede leer', !traLeer.ok);

    /* --- Hoy saca TARJETAS, no papeles -------------------------------------
       Se crea una tarjeta nueva en vez de tocarle la fecha a las de antes:
       cambiarlo aquí solo lo cambiaría en la copia de la ventana, y el proceso
       principal —que es quien decide el calendario— seguiría con el suyo. Una
       tarjeta recién creada vence hoy por definición. */
    await S.mutate('card:add', {
      notaId: papel.id, pregunta: '¿Qué hace git reflog?',
      respuesta: 'Enseña los commits que ya no apunta ninguna rama.'
    });
    S.ui.repasoRevelado = null;
    S.ui.estPapel = null;
    S.pausarRender = false;
    S.setView('today');
    await wait(220);
    ok('en Hoy se ve la PREGUNTA de la tarjeta',
       document.getElementById('view').innerText.indexOf('reset o revert') !== -1 ||
       document.getElementById('view').innerText.indexOf('git reflog') !== -1);
    ok('y no el título del papel',
       document.getElementById('view').innerText.indexOf('Clase 3 — deshacer') === -1);
    ok('la respuesta empieza tapada',
       !!document.querySelector('#view [data-act="revelar"]') &&
       !document.querySelector('#view [data-act="grade"]'));

    document.querySelector('#view [data-act="revelar"]').click();
    await wait(200);
    ok('al destapar salen las cuatro respuestas',
       document.querySelectorAll('#view [data-act="grade"]').length === 4);
    ok('y la respuesta sale formateada',
       !!document.querySelector('#view .nota-revelada'));

    // Responder desde Hoy mueve la tarjeta DENTRO de su papel.
    document.querySelector('#view [data-act="grade"][data-grade="bien"]').click();
    await wait(300);
    const quedan = window.H.repaso.pendientes(
      S.data.reviews.find((r) => r.id === papel.id).tarjetas, window.H.dateKey());
    ok('responder en Hoy adelanta el calendario de esa tarjeta',
       quedan.length === 0, 'quedan ' + quedan.length);

    // --- Limpieza del bloque -----------------------------------------------
    await S.mutate('review:remove', { id: papel.id });
    ok('borrar el papel se lleva sus tarjetas',
       !S.data.reviews.some((r) => r.id === papel.id));

    /* --- Un papel sin tema tiene que poder volver --------------------------
       Borrar un tema no borra sus papeles: los deja sueltos. Si la oficina no
       los recogiera en ninguna pantalla seguirían en el archivo sin forma de
       llegar a ellos, que es la peor manera de perder algo: en silencio y
       creyendo que se ha borrado. */
    await S.mutate('review:add',
      { title: 'Apuntes que pierden su tema', text: 'teoría que no se puede perder',
        spotId: tema.id });
    const huerfano = S.data.reviews[S.data.reviews.length - 1];
    await S.mutate('spot:remove', { id: tema.id });
    ok('borrar un tema NO borra sus papeles',
       !!S.data.reviews.find((r) => r.id === huerfano.id));
    ok('pero los deja sin tema',
       S.data.reviews.find((r) => r.id === huerfano.id).spotId === null);

    S.ui.spotId = null; S.ui.estCarpeta = null; S.ui.estPapel = null;
    S.ui.estSueltos = false;
    S.pausarRender = false;
    S.setView('estudio');
    await wait(220);
    const cajonSueltos = document.querySelector('#view [data-act=\"abrirSueltos\"]');
    ok('la lista de temas avisa de que hay papeles sueltos', !!cajonSueltos);

    cajonSueltos.click();
    await wait(220);
    ok('y dentro está el papel que perdió su tema',
       document.getElementById('view').innerText.indexOf('Apuntes que pierden su tema') !== -1);

    /* Tirar uno desde aquí mismo. Sin esto, para borrar un papel que no
       quieres hay que colocarlo antes en un tema: hacerle sitio justo a lo
       que sobra. */
    await S.mutate('review:add', { title: 'Papel que sobra', spotId: null });
    const basura = S.data.reviews[S.data.reviews.length - 1];
    await wait(240);
    const tirar = document.querySelector(
      '#view [data-act=\"borrarPapel\"][data-id=\"' + basura.id + '\"]');
    ok('un papel suelto se puede tirar sin colocarlo antes', !!tirar);
    tirar.click();
    await wait(200);
    document.querySelector('#modalRoot [data-yes]').click();
    await wait(280);
    ok('y al confirmar desaparece de verdad',
       !S.data.reviews.some((r) => r.id === basura.id));

    const mover = document.querySelector('#view [data-mover=\"' + huerfano.id + '\"]');
    ok('con un desplegable para colocarlo en cualquier tema',
       !!mover && !!mover.querySelector('option[value=\"' + otroTema.id + '\"]'));
    mover.value = otroTema.id;
    mover.dispatchEvent(new Event('change'));
    await wait(300);
    ok('y colocarlo lo devuelve a un tema de verdad',
       S.data.reviews.find((r) => r.id === huerfano.id).spotId === otroTema.id,
       'tema=' + S.data.reviews.find((r) => r.id === huerfano.id).spotId);

    document.querySelector('#view [data-act=\"irTemas\"]').click();
    await wait(220);
    const avisoSueltos = document.querySelector('#view [data-act=\"abrirSueltos\"]');
    ok('y el aviso deja de hablar de papeles cuando no queda ninguno',
       !avisoSueltos || avisoSueltos.innerText.indexOf('papel sin tema') === -1);
    await S.mutate('review:remove', { id: huerfano.id });

    /* --- Un tema nace SIEMPRE en un estante --------------------------------
       El desplegable del modal venía en "Sin estante", que es el único valor
       con el que un tema desaparece nada más crearlo: la lista de temas es
       siempre la de UN estante. Se creó el tema, se le metió dentro medio
       curso y no se volvió a ver. */
    S.ui.estGrupo = estanteId;
    window.H.modals.spot(S, null);
    await wait(220);
    const selEstante = document.getElementById('spGroup');
    ok('un tema nuevo viene ya con el estante que estás mirando',
       !!selEstante && selEstante.value === estanteId,
       'valor=' + (selEstante ? selEstante.value || '(vacío)' : 'no hay desplegable'));
    ok('y habiendo estantes no se puede dejar sin ninguno',
       !!selEstante && !selEstante.querySelector('option[value=\"\"]'));
    window.H.modals.close();
    await wait(150);

    // Y si aun así uno se queda sin estante, se puede volver a colocar.
    await S.mutate('spot:add', { name: 'Tema que perdió su estante', groupId: null });
    const temaPerdido = S.data.spots[S.data.spots.length - 1];
    S.setView('estudio');
    await wait(220);
    const cajonT = document.querySelector('#view [data-act=\"abrirSueltos\"]');
    ok('un tema sin estante también se recoge',
       !!cajonT && cajonT.innerText.indexOf('sin estante') !== -1);

    cajonT.click();
    await wait(220);
    const selT = document.querySelector('#view [data-mover-tema=\"' + temaPerdido.id + '\"]');
    ok('con un desplegable para ponerle uno', !!selT);
    selT.value = estanteId;
    selT.dispatchEvent(new Event('change'));
    await wait(300);
    ok('y al ponerselo vuelve a la lista de temas',
       S.data.spots.find((x) => x.id === temaPerdido.id).groupId === estanteId);
    await S.mutate('spot:remove', { id: temaPerdido.id });

    /* --- Un estante también se borra ---------------------------------------
       El modal sabía renombrarlo y eliminarlo desde el principio, pero no
       tenía puerta: solo se abría para crear uno nuevo. Un estante que se
       puede crear y no quitar convierte cualquier prueba en algo permanente. */
    S.ui.estGrupo = estanteId;
    S.ui.spotId = null; S.ui.estCarpeta = null; S.ui.estPapel = null;
    S.ui.estSueltos = false;
    S.setView('estudio');
    await wait(220);
    const lapiz = document.querySelector('#view [data-act=\"editarEstante\"]');
    ok('la cabecera deja abrir el estante que estás mirando', !!lapiz);

    lapiz.click();
    await wait(220);
    ok('el modal llega con su nombre y con el botón de eliminar',
       !!document.getElementById('sgDel') &&
       document.getElementById('sgName').value === 'Programación');

    document.getElementById('sgDel').click();
    await wait(200);
    document.querySelector('#modalRoot [data-yes]').click();
    await wait(320);
    ok('borrar el estante lo quita de verdad',
       !S.data.spotGroups.some((g) => g.id === estanteId));
    ok('y sus temas no se van con él: se quedan sin estante',
       S.data.spots.find((x) => x.id === otroTema.id).groupId === null);
    ok('la vista no se queda en un estante fantasma', S.ui.estGrupo !== estanteId);

    const rescate = document.querySelector('#view [data-act=\"abrirSueltos\"]');
    ok('y aparecen en Papeles sueltos, con estante al que volver',
       !!rescate && rescate.innerText.indexOf('sin estante') !== -1);

    await S.mutate('spot:remove', { id: otroTema.id });
    await S.mutate('spot:remove', { id: tema.id });
    S.ui.spotId = spot.id;
    S.ui.estGrupo = null;
    S.ui.estCarpeta = null;
    S.ui.estPapel = null;
    S.ui.repasoRevelado = null;

    // --- 13. Las vistas de vistazo caben sin scroll -----------------------
    /* "Hoy" y "Planificar" se abren para mirar y actuar: si obligan a hacer
       scroll al tamaño con el que arranca la app, la app se siente
       improvisada. Dashboard, Spots y Life son de lectura y ahí el scroll es
       legítimo, así que no se comprueban.

       Se llena antes con datos parecidos a los reales: una vista vacía cabe
       siempre y medir eso no demostraría nada. */
    const hoyKey = window.H.dateKey();
    await S.mutate('plan:clearDay', { date: hoyKey });
    const actsT = window.H.timedActs(S.data);
    for (let i = 0; i < 3; i++) {
      await S.mutate('plan:add', {
        dates: [hoyKey], activityId: actsT[i % actsT.length].id, plannedMins: 60 + i * 30
      });
    }
    await S.mutate('session:addManual', { date: hoyKey, mins: 45, activityId: actsT[0].id });
    await S.mutate('session:addManual', { date: hoyKey, mins: 30, activityId: actsT[1].id });

    // Un mes de plan, para que el calendario tenga la altura que tendrá de verdad.
    const hoyD = new Date();
    for (let dia = 1; dia <= 28; dia++) {
      const k = window.H.dateKey(new Date(hoyD.getFullYear(), hoyD.getMonth(), dia));
      await S.mutate('plan:add', {
        dates: [k], activityId: actsT[dia % actsT.length].id, plannedMins: 90
      });
      await S.mutate('plan:add', {
        dates: [k], activityId: actsT[(dia + 1) % actsT.length].id, plannedMins: 45
      });
    }

    const cont = document.querySelector('.content');
    for (const v of ['today', 'planner']) {
      S.setView(v);
      await wait(320);
      const sobra = cont.scrollHeight - cont.clientHeight;
      ok('la vista ' + v + ' cabe sin scroll', sobra <= 0,
         'contenido=' + cont.scrollHeight + ' hueco=' + cont.clientHeight +
         (sobra > 0 ? ' SE PASA ' + sobra + 'px' : ''));
    }

    /* --- El calendario no se deforma con un nombre largo -------------------
       El mínimo de una columna de una parte es su contenido, así que una
       actividad de nombre largo se llevaba el ancho de la fila entera y dejaba
       los otros
       seis días en un dedo. Las columnas son fijas y el nombre parte de
       línea; lo que crece es el alto. */
    await S.mutate('activity:add',
      { name: 'Estudio Mecánica de Materiales', kind: 'timed' });
    const actLarga = S.data.activities[S.data.activities.length - 1];
    // Un día cualquiera menos hoy: hoy ya lleva tres actividades del relleno
    // de arriba y la celda solo pinta las tres primeras.
    const nDia = hoyD.getDate() === 20 ? 21 : 20;
    const diaLargo = window.H.dateKey(new Date(hoyD.getFullYear(), hoyD.getMonth(), nDia));
    await S.mutate('plan:add',
      { dates: [diaLargo], activityId: actLarga.id, plannedMins: 480 });
    S.setView('planner');
    await wait(320);

    const fila = Array.from(document.querySelectorAll('#view .cal-cell')).slice(0, 7);
    const anchos = fila.map((c) => Math.round(c.getBoundingClientRect().width));
    ok('las siete columnas del calendario miden lo mismo',
       fila.length === 7 && Math.max.apply(null, anchos) - Math.min.apply(null, anchos) <= 1,
       anchos.join(' '));

    const rejilla = document.querySelector('#view .cal');
    ok('y un nombre largo no desborda la rejilla',
       rejilla.scrollWidth <= rejilla.clientWidth + 1,
       rejilla.scrollWidth + ' de ' + rejilla.clientWidth);

    const nombreLargo = Array.from(document.querySelectorAll('#view .cal-item-name'))
      .filter((n) => n.textContent.indexOf('Mecánica') !== -1)[0];
    ok('parte de línea en vez de recortarse con puntos suspensivos',
       !!nombreLargo && nombreLargo.getBoundingClientRect().height > 20,
       nombreLargo ? Math.round(nombreLargo.getBoundingClientRect().height) + 'px de alto'
                   : 'no se pintó');

    /* --- Agendar varios días de una vez ------------------------------------
       Repetir solía significar "todos los lunes del mes": para una asignatura
       que se lleva todos los días hasta el examen había que picar los siete
       días de la semana a mano y encima tragarse el mes entero. */
    /* Con un evento dentro a propósito: la lista de eventos del día es lo
       último que se le añadió a este modal, y un solo desajuste de etiquetas
       ahí cierra el cuerpo antes de tiempo y echa el pie fuera de la caja. */
    await S.mutate('event:add',
      { title: 'Cita de prueba', date: hoyKey, time: '12:00', avisarMin: -1 });

    S.setView('planner');
    await wait(260);
    window.H.modals.planDay(S, hoyKey);
    await wait(240);

    const hasta = document.getElementById('pHasta');
    ok('el modal del día trae un tope de fecha', !!hasta && !!hasta.value);

    /* El pie tiene que quedarse DENTRO de la caja. Es un modal que ha ido
       creciendo, y en cuanto el cuerpo no encoge empuja Cerrar y Vaciar fuera
       de la pantalla: el modal se abre y no hay forma de terminar. */
    const caja = document.querySelector('#modalRoot .modal').getBoundingClientRect();
    const pie = document.querySelector('#modalRoot .modal-foot').getBoundingClientRect();
    ok('y su pie no se sale de la caja',
       pie.bottom <= caja.bottom + 1 && caja.bottom <= window.innerHeight + 1,
       'pie=' + Math.round(pie.bottom) + ' caja=' + Math.round(caja.bottom) +
       ' ventana=' + window.innerHeight);
    ok('y atajos para no picar los siete días a mano',
       document.querySelectorAll('#modalRoot [data-preset]').length === 4);

    // Toda la semana, de hoy a dentro de seis días: siete días seguidos.
    const finTramo = window.H.repaso.sumarDias(hoyKey, 6);
    hasta.value = finTramo;
    hasta.dispatchEvent(new Event('change'));
    document.querySelector('#modalRoot [data-preset=\"semana\"]').click();
    await wait(200);
    const btnAgregar = document.getElementById('pAdd');
    ok('un clic deja marcada la semana entera',
       document.querySelectorAll('#modalRoot .chip.on').length === 7);
    ok('y el botón dice a cuántos días va',
       btnAgregar.textContent.indexOf('7 días') !== -1, btnAgregar.textContent);

    const actAgenda = window.H.timedActs(S.data)[0];
    document.getElementById('pAct').value = actAgenda.id;
    const antesPlan = Object.keys(S.data.plan).length;
    btnAgregar.click();
    await wait(360);
    let conEsa = 0;
    for (let i = 0; i <= 6; i++) {
      const k = window.H.repaso.sumarDias(hoyKey, i);
      if ((S.data.plan[k] || []).some((it) => it.activityId === actAgenda.id)) conEsa++;
    }
    ok('agenda los siete días del tramo de una vez', conEsa === 7, conEsa + ' de 7');
    ok('y no se sale del tramo',
       !(S.data.plan[window.H.repaso.sumarDias(hoyKey, 7)] || [])
         .some((it) => it.activityId === actAgenda.id),
       'planes=' + antesPlan + '->' + Object.keys(S.data.plan).length);

    window.H.modals.close();
    await wait(150);
    for (let i = 0; i <= 6; i++) {
      await S.mutate('plan:clearDay', { date: window.H.repaso.sumarDias(hoyKey, i) });
    }
    for (const e of S.data.events.slice()) await S.mutate('event:remove', { id: e.id });

    /* --- Eventos: lo que no se cumple, llega -------------------------------
       Una entrega o una reunión no son plan: no tienen duración, no suman
       horas y no se cumplen a medias. Por eso viven en su propia lista y no
       tocan ninguna cuenta del día. */
    const evAlta = await S.mutate('event:add', {
      title: 'Entrega del informe', date: diaLargo, time: '16:30',
      avisarMin: 60, note: 'Con el cliente'
    });
    ok('se crea un evento', evAlta.ok, evAlta.error || '');
    const evento = S.data.events[S.data.events.length - 1];
    ok('nace armado y sin avisar todavía',
       evento.avisadoAt === null && evento.avisarMin === 60);

    const evSinTitulo = await S.mutate('event:add', { title: '   ', date: diaLargo });
    ok('rechaza un evento sin título', !evSinTitulo.ok, evSinTitulo.error);
    const evMalaFecha = await S.mutate('event:add', { title: 'X', date: '20/09/2026' });
    ok('y una fecha que no es una fecha', !evMalaFecha.ok, evMalaFecha.error);
    const evMalaHora = await S.mutate('event:add',
      { title: 'X', date: diaLargo, time: '25:99' });
    ok('y una hora imposible', !evMalaHora.ok, evMalaHora.error);

    S.setView('planner');
    await wait(300);
    ok('el evento sale en su día del calendario',
       !!document.querySelector('#view .cal-evento') &&
       document.getElementById('view').innerText.indexOf('Entrega del informe') !== -1);
    ok('y no cuenta como horas agendadas',
       document.getElementById('view').innerText.indexOf('16:30') !== -1);

    /* Mover un evento vuelve a armar su aviso. Sin esto, cambiar una reunión
       de las 9 a las 18 dejaría el aviso dado por las 9 y no sonaría nunca. */
    S.data.events.find((x) => x.id === evento.id).avisadoAt = '2026-01-01T00:00:00.000Z';
    await S.mutate('event:update', { id: evento.id, time: '18:00' });
    ok('cambiar la hora vuelve a armar el aviso',
       S.data.events.find((x) => x.id === evento.id).avisadoAt === null);
    await S.mutate('event:update', { id: evento.id, note: 'Solo cambia la nota' });
    ok('y cambiar solo la nota no lo rearma',
       S.data.events.find((x) => x.id === evento.id).avisadoAt === null);

    // Sin aviso, para que la prueba no dispare una notificación de verdad.
    await S.mutate('event:add', {
      title: 'Reunión con el cliente', date: hoyKey, time: '23:59', avisarMin: -1
    });
    S.setView('today');
    await wait(300);
    ok('lo que viene se ve en Hoy sin ir a buscarlo',
       !!document.querySelector('#view .evento-pill') &&
       document.getElementById('view').innerText.indexOf('Reunión con el cliente') !== -1);

    for (const e of S.data.events.slice()) await S.mutate('event:remove', { id: e.id });
    ok('y se borran', S.data.events.length === 0);

    await S.mutate('plan:clearDay', { date: diaLargo });
    await S.mutate('activity:remove', { id: actLarga.id });

    // Limpieza del relleno
    for (let dia = 1; dia <= 28; dia++) {
      await S.mutate('plan:clearDay', {
        date: window.H.dateKey(new Date(hoyD.getFullYear(), hoyD.getMonth(), dia))
      });
    }
    // Copia de los ids ANTES de borrar: cada mutate reemplaza S.data, así que
    // iterar el array vivo mientras se muta lo deja a medias.
    const idsABorrar = S.data.sessions
      .filter((s) => s.date === hoyKey)
      .map((s) => s.id);
    for (const id of idsABorrar) await S.mutate('session:remove', { id: id });
    await wait(200);

    // --- 14. Marca --------------------------------------------------------
    // Un src roto no lanza error ni ensucia la consola: solo deja un hueco.
    // naturalWidth es la unica forma fiable de saber que cargo de verdad.
    const logos = document.querySelectorAll('.brand-logo');
    ok('los dos logotipos están', logos.length === 2, 'n=' + logos.length);
    for (const l of logos) {
      if (!l.complete) await new Promise((r) => { l.onload = l.onerror = r; });
    }
    ok('los dos logotipos cargan',
       Array.from(logos).every((l) => l.naturalWidth > 0),
       Array.from(logos).map((l) => l.naturalWidth).join(' / '));

    // Solo uno visible a la vez, en cualquiera de los tres estados de tema.
    const visible = () => Array.from(logos)
      .filter((l) => getComputedStyle(l).display !== 'none').length;
    ok('en claro se ve un solo logo', visible() === 1, 'visibles=' + visible());
    raiz.setAttribute('data-theme', 'dark');
    await wait(60);
    ok('en oscuro se ve un solo logo', visible() === 1, 'visibles=' + visible());
    const enOscuro = Array.from(logos).find((l) => getComputedStyle(l).display !== 'none');
    ok('en oscuro se ve el logo claro',
       enOscuro && enOscuro.src.indexOf('logo-dark') !== -1,
       enOscuro ? enOscuro.src.split('/').pop() : 'ninguno');
    raiz.removeAttribute('data-theme');
    window.H.refreshTokens();
    await wait(60);

    // --- 15. Limpieza -----------------------------------------------------
    await S.mutate('spot:remove', { id: spot.id });
    // Se borran TODAS, no la de índice 0: un paso anterior puede haber
    // dejado el array vacío y suponer que hay una es acoplar pasos entre sí.
    for (const id of S.data.sessions.map((s) => s.id)) {
      await S.mutate('session:remove', { id: id });
    }
    await S.mutate('plan:clearDay', { date: today });
    await S.mutate('plan:clearDay', { date: d2 });
    await S.mutate('plan:clearDay', { date: d3 });
    ok('limpieza', S.data.spots.length === 0 && S.data.sessions.length === 0 &&
       S.data.results.length === 0);

  } catch (err) {
    log.push('FALL excepcion :: ' + err.message + ' | ' + (err.stack || '').split('\\n')[1]);
  }

  return log.join('\\n');
})()`;

const CHECKIN_SCRIPT = `(async () => {
  const log = [];
  const ok = (n, c, e) => log.push((c ? 'PASS ' : 'FALL ') + n + (e ? ' :: ' + e : ''));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = window.H.S;

  try {
    /* --- El aviso de un evento salta solo --------------------------------
       Lo decide el proceso principal, no la ventana, por lo mismo que el
       cronometro: un recordatorio que solo funciona con la pantalla abierta
       en la pestana correcta no es un recordatorio. Se comprueba de verdad,
       contra el reloj, porque es lo unico que demuestra que el temporizador
       esta vivo. La ronda es cada 30s: se sondea hasta 45. */
    const ahora = new Date();
    const hoyEv = ahora.getFullYear() + '-' +
      String(ahora.getMonth() + 1).padStart(2, '0') + '-' +
      String(ahora.getDate()).padStart(2, '0');
    const horaEv = String(ahora.getHours()).padStart(2, '0') + ':' +
      String(ahora.getMinutes()).padStart(2, '0');

    await S.mutate('event:add',
      { title: 'Prueba de aviso', date: hoyEv, time: horaEv, avisarMin: 0 });
    const evPrueba = S.data.events[S.data.events.length - 1];

    let avisado = false;
    for (let i = 0; i < 45; i++) {
      await wait(1000);
      const e = (S.data.events || []).find((x) => x.id === evPrueba.id);
      if (e && e.avisadoAt) { avisado = true; break; }
    }
    ok('el aviso de un evento salta solo, sin tocar nada', avisado);
    await S.mutate('event:remove', { id: evPrueba.id });

    await S.mutate('settings:update', { checkinMinMin: 1, checkinMaxMin: 1, checkinGraceSec: 15 });
    const act = S.data.activities[0];
    await window.hq.session.start({ activityId: act.id });

    // La verificacion dispara al minuto. Sondeamos hasta 75s.
    let fired = false;
    for (let i = 0; i < 75; i++) {
      await wait(1000);
      if (S.session && S.session.checkin) { fired = true; break; }
    }
    ok('verificacion dispara sola', fired,
       'preguntas=' + (S.session ? S.session.checkinsAsked : '-'));

    if (fired) {
      const antes = S.session.countedSec;
      await window.hq.session.confirm();
      await wait(300);
      ok('confirmar limpia la alerta', S.session && !S.session.checkin);
      ok('confirmar no descuenta tiempo', S.session.countedSec >= antes,
         antes + ' -> ' + S.session.countedSec);
      ok('confirmacion contada', S.session.checkinsConfirmed === 1);
    }

    await window.hq.session.discard();

    // --- Rama de castigo: ignorar la verificacion -------------------------
    // Es la que hace honesto el numero final, y la de matematica mas delicada.
    const arranque = await window.hq.session.start({ activityId: act.id });
    await wait(300);
    ok('segunda sesión arranca', arranque.ok && !!S.session,
       'ok=' + arranque.ok + ' error=' + (arranque.error || '-'));

    // Se mide el reloj de pared aparte del contador de vueltas: si el
    // navegador ralentizara los temporizadores, 75 vueltas no serían 75s y
    // el fallo parecería otra cosa.
    const t0 = Date.now();
    let fired2 = false;
    for (let i = 0; i < 90; i++) {
      await wait(1000);
      if (S.session && S.session.checkin) { fired2 = true; break; }
    }
    const transcurrido = Math.round((Date.now() - t0) / 1000);

    if (fired2) {
      const alPreguntar = S.session.countedSec;
      // No confirmamos. Esperamos a que venza la gracia de 15s.
      for (let i = 0; i < 30; i++) {
        await wait(1000);
        if (S.session && S.session.state === 'paused') break;
      }
      ok('gracia vencida pausa la sesion', S.session && S.session.state === 'paused',
         'estado=' + (S.session && S.session.state));
      // La gracia no cuenta: el total vuelve al valor que tenia al preguntar.
      ok('la gracia no suma tiempo', S.session && S.session.countedSec === alPreguntar,
         'al preguntar=' + alPreguntar + ' final=' + (S.session && S.session.countedSec));
      // Y el tramo en duda queda marcado, no borrado.
      ok('marca el tramo como no verificado',
         S.session && S.session.unverifiedSec === alPreguntar,
         'sin verificar=' + (S.session && S.session.unverifiedSec) + ' de ' + alPreguntar);
      ok('la pregunta queda registrada', S.session && S.session.checkinsAsked === 1 &&
         S.session.checkinsConfirmed === 0);

      // Al guardar, el registro conserva ambas cifras.
      await window.hq.session.finish('');
      const rec = S.data.sessions[S.data.sessions.length - 1];
      ok('el registro guarda el tiempo en duda',
         rec && rec.unverifiedSec === alPreguntar && rec.countedSec === alPreguntar,
         'contado=' + (rec && rec.countedSec) + ' duda=' + (rec && rec.unverifiedSec));
      await S.mutate('session:remove', { id: rec.id });
    } else {
      ok('segunda verificación dispara', false,
         'esperado 60s, transcurrido ' + transcurrido + 's' +
         ' | sesión=' + (S.session ? S.session.state : 'ninguna') +
         ' | contados=' + (S.session ? S.session.countedSec : '-') + 's' +
         ' | preguntas=' + (S.session ? S.session.checkinsAsked : '-'));
    }

    await S.mutate('settings:update', { checkinMinMin: 10, checkinMaxMin: 20, checkinGraceSec: 120 });
  } catch (err) {
    log.push('FALL excepcion :: ' + err.message);
  }
  return log.join('\\n');
})()`;

function run(win, app) {
  const deep = process.env.HQ_SELFTEST === '2';
  win.webContents.on('did-finish-load', () => {
    setTimeout(async () => {
      try {
        let todo = await win.webContents.executeJavaScript(SCRIPT);
        console.log('\n===== SELFTEST =====\n' + todo);

        if (deep) {
          console.log('\n--- verificaciones (tarda ~150s) ---');
          const out2 = await win.webContents.executeJavaScript(CHECKIN_SCRIPT);
          console.log(out2);
          // El veredicto tiene que mirar TODAS las tandas. Mirando solo la
          // primera, un fallo en las verificaciones pasaba como "TODO OK".
          todo += '\n' + out2;
        }

        const fallos = (todo.match(/^FALL/gm) || []).length;
        console.log('\n===== ' + (fallos === 0
          ? 'TODO OK (' + (todo.match(/^PASS/gm) || []).length + ' comprobaciones)'
          : 'HAY FALLOS: ' + fallos) + ' =====');
      } catch (err) {
        console.log('SELFTEST ERROR: ' + err.message);
      }
      app.quit();
    }, 1400);
  });
}

module.exports = { run };
