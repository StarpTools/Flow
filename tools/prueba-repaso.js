/* Pruebas del algoritmo de repetición espaciada.
   Uso:  node tools/prueba-repaso.js

   Se prueban aparte y sin interfaz porque esto es matemática pura: si los
   intervalos crecen mal, el daño no se ve hoy — se ve dentro de seis meses,
   cuando descubres que llevas medio año repasando lo que ya sabías o que se
   te olvidó lo que la app daba por aprendido. */
const R = require('../app/js/repaso.js');

let pasan = 0, fallan = 0;
function ok(nombre, cond, extra) {
  if (cond) { pasan++; console.log('PASS ' + nombre + (extra ? ' :: ' + extra : '')); }
  else { fallan++; console.log('FALL ' + nombre + (extra ? ' :: ' + extra : '')); }
}

const HOY = '2026-08-23';

// --- Fechas -----------------------------------------------------------------
ok('sumar días cruza el fin de mes', R.sumarDias('2026-08-30', 5) === '2026-09-04',
   R.sumarDias('2026-08-30', 5));
ok('sumar días cruza el fin de año', R.sumarDias('2026-12-30', 3) === '2027-01-02',
   R.sumarDias('2026-12-30', 3));
ok('sumar días respeta el año bisiesto', R.sumarDias('2028-02-28', 1) === '2028-02-29',
   R.sumarDias('2028-02-28', 1));
// El fallo clásico: Date('2026-08-23') se interpreta como UTC y en España
// resta un día. Si esto falla, todos los repasos caen un día antes.
ok('sumar 0 días no mueve la fecha', R.sumarDias(HOY, 0) === HOY, R.sumarDias(HOY, 0));

// --- Factor de facilidad ----------------------------------------------------
ok('"fácil" sube el EF', R.nuevoEF(2.5, 5) === 2.6, String(R.nuevoEF(2.5, 5)));
ok('"bien" deja el EF igual', R.nuevoEF(2.5, 4) === 2.5, String(R.nuevoEF(2.5, 4)));
ok('"me costó" baja el EF', Math.abs(R.nuevoEF(2.5, 3) - 2.36) < 0.001, String(R.nuevoEF(2.5, 3)));
ok('"no me acordaba" hunde el EF', Math.abs(R.nuevoEF(2.5, 1) - 1.96) < 0.001, String(R.nuevoEF(2.5, 1)));
ok('el EF nunca baja de 1.3', R.nuevoEF(1.3, 1) === 1.3, String(R.nuevoEF(1.3, 1)));

// --- La curva: acertar siempre ----------------------------------------------
{
  let it = R.nuevo(HOY);
  let hoy = HOY;
  const curva = [];
  for (let i = 0; i < 8; i++) {
    it = R.responder(it, 'bien', hoy);
    curva.push(it.interval);
    hoy = it.due;
  }
  ok('la curva arranca 1 → 6 días', curva[0] === 1 && curva[1] === 6, curva.slice(0, 2).join(', '));
  ok('los intervalos siempre crecen',
     curva.every(function (v, i) { return i === 0 || v > curva[i - 1]; }),
     curva.join(' → '));
  ok('a los 8 aciertos pasa del año', curva[7] > 365, curva[7] + ' días');
}

// --- Fallar reinicia, pero deja cicatriz ------------------------------------
{
  let it = R.nuevo(HOY);
  it = R.responder(it, 'bien', HOY);
  it = R.responder(it, 'bien', it.due);
  it = R.responder(it, 'bien', it.due);
  const antes = { interval: it.interval, ef: it.ef };

  const tras = R.responder(it, 'fallo', it.due);
  ok('fallar devuelve el repaso a mañana', tras.interval === 1, tras.interval + ' día(s)');
  ok('fallar reinicia las repeticiones', tras.reps === 0);
  ok('fallar cuenta como lapsus', tras.lapses === 1);
  ok('fallar deja el EF más bajo para siempre', tras.ef < antes.ef,
     antes.ef + ' → ' + tras.ef);

  // Un concepto que se falla mucho crece MÁS DESPACIO que uno fácil. Es el
  // punto entero del método: no todos los conceptos cuestan lo mismo.
  let dificil = R.nuevo(HOY), facil = R.nuevo(HOY);
  let h1 = HOY, h2 = HOY;
  for (let i = 0; i < 5; i++) {
    dificil = R.responder(dificil, i === 0 ? 'fallo' : 'duro', h1); h1 = dificil.due;
    facil = R.responder(facil, 'facil', h2); h2 = facil.due;
  }
  ok('lo difícil se repasa más que lo fácil', dificil.interval < facil.interval,
     'difícil=' + dificil.interval + 'd  fácil=' + facil.interval + 'd');
}

// --- Estancamiento: el fallo silencioso -------------------------------------
{
  // Con EF en el mínimo, redondear interval*1.3 podía devolver el mismo
  // número y el concepto se repetiría cada N días para siempre sin avanzar.
  let it = { ef: 1.3, reps: 5, interval: 3, lapses: 4, due: HOY, historial: [] };
  const tras = R.responder(it, 'bien', HOY);
  ok('nunca se estanca con EF mínimo', tras.interval > it.interval,
     it.interval + ' → ' + tras.interval);
}

// --- Tope --------------------------------------------------------------------
{
  let it = { ef: 2.8, reps: 12, interval: 700, lapses: 0, due: HOY, historial: [] };
  const tras = R.responder(it, 'facil', HOY);
  ok('el intervalo tiene tope de 2 años', tras.interval <= 730, tras.interval + ' días');
}

// --- Vencimiento y orden -----------------------------------------------------
{
  const items = [
    { id: 'a', due: '2026-08-23' },              // hoy
    { id: 'b', due: '2026-08-10' },              // 13 días de retraso
    { id: 'c', due: '2026-09-01' },              // futuro
    { id: 'd', due: '2026-08-22' }               // ayer
  ];
  const p = R.pendientes(items, HOY);
  ok('solo salen los que ya vencieron', p.length === 3 && !p.some((i) => i.id === 'c'),
     p.map((i) => i.id).join(','));
  ok('primero el más atrasado', p[0].id === 'b', p.map((i) => i.id).join(' → '));
  ok('un concepto nuevo vence hoy', R.vence(R.nuevo(HOY), HOY));
}

/* --- Notas que no entran en la rotación --------------------------------------
   Un resumen de clase vive en el bloc pero no es una tarjeta. Si se colara en
   la cola, enterraría las lógicas cortas que sí valían el repaso. */
{
  const items = [
    { id: 'a', due: '2026-08-01' },
    { id: 'b', due: '2026-08-01', repasar: false },
    { id: 'c', due: '2026-08-01', repasar: true }
  ];
  const p = R.pendientes(items, HOY);
  ok('una nota con repasar=false no entra en la cola',
     p.length === 2 && !p.some((i) => i.id === 'b'), p.map((i) => i.id).join(','));
  ok('sin el campo, la nota sí se repasa', R.enRepaso({ id: 'x' }));
  ok('repasar=false la deja fuera', !R.enRepaso({ repasar: false }));
  // Sacarla de la rotación no borra su calendario: al volver a activarla
  // retoma donde estaba en vez de empezar de cero.
  ok('seguir vencida no depende de repasar', R.vence({ due: '2026-08-01', repasar: false }, HOY));
}

// --- Historial ---------------------------------------------------------------
{
  let it = R.nuevo(HOY);
  it = R.responder(it, 'bien', HOY);
  it = R.responder(it, 'duro', it.due);
  ok('se guarda el historial', it.historial.length === 2,
     it.historial.map((h) => h.grado).join(', '));
  ok('el historial guarda el intervalo de cada repaso',
     it.historial.every((h) => typeof h.intervalo === 'number'));
}

// --- No modifica lo que recibe ----------------------------------------------
{
  const original = R.nuevo(HOY);
  const copia = JSON.parse(JSON.stringify(original));
  R.responder(original, 'bien', HOY);
  ok('responder no altera el objeto recibido',
     JSON.stringify(original) === JSON.stringify(copia));
}

// --- Entradas inválidas ------------------------------------------------------
ok('un grado inexistente devuelve null', R.responder(R.nuevo(HOY), 'inventado', HOY) === null);

console.log('\n===== ' + (fallan === 0
  ? 'TODO OK (' + pasan + ' comprobaciones)'
  : 'HAY FALLOS: ' + fallan + ' de ' + (pasan + fallan)) + ' =====');
process.exit(fallan === 0 ? 0 : 1);
