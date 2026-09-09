/* Repetición espaciada — SM-2 (Piotr Woźniak, SuperMemo 1987).

   La idea: repasar justo antes de olvidar. Cada acierto aleja el siguiente
   repaso; cada fallo lo acerca. Con los años eso convierte veinte minutos al
   día en memoria que no se cae.

   Aquí solo vive la matemática: funciones puras, sin interfaz y sin datos.
   Por eso se puede probar desde node sin abrir una ventana, y por eso las
   pruebas de tools/prueba-repaso.js valen algo.

   Estado de cada concepto:
     ef        factor de facilidad. Empieza en 2.5 y baja si te cuesta.
               Nunca por debajo de 1.3: con menos, los intervalos no crecerían
               nunca y el concepto se repetiría a diario para siempre.
     interval  días hasta el próximo repaso
     reps      aciertos SEGUIDOS. Un fallo lo devuelve a cero.
     lapses    veces que lo has fallado en total. Es la señal de que un
               concepto está mal formulado o es demasiado grande. */
(function (raiz) {
  'use strict';

  const R = {};

  R.EF_INICIAL = 2.5;
  R.EF_MINIMO = 1.3;

  /* Las cuatro respuestas, con su equivalencia en la escala 0-5 de SM-2.
     Cuatro y no seis porque nadie distingue de verdad entre seis grados de
     "cómo de bien me acordaba", y pedir esa precisión solo hace más lento
     el repaso. */
  R.GRADOS = [
    { id: 'fallo',  q: 1, texto: 'No me acordaba', ayuda: 'Vuelve mañana' },
    { id: 'duro',   q: 3, texto: 'Me costó',       ayuda: 'Intervalo más corto' },
    { id: 'bien',   q: 4, texto: 'Bien',           ayuda: 'Intervalo normal' },
    { id: 'facil',  q: 5, texto: 'Fácil',          ayuda: 'Intervalo más largo' }
  ];

  R.gradoPorId = function (id) {
    return R.GRADOS.filter(function (g) { return g.id === id; })[0] || null;
  };

  /* Nuevo factor de facilidad tras una respuesta.
     Fórmula original de SM-2:
       EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
     Que da: q=5 → +0.10 · q=4 → 0 · q=3 → −0.14 · q=1 → −0.54 */
  R.nuevoEF = function (ef, q) {
    const d = 5 - q;
    const siguiente = ef + (0.1 - d * (0.08 + d * 0.02));
    return Math.max(R.EF_MINIMO, Math.round(siguiente * 1000) / 1000);
  };

  /* Aplica una respuesta y devuelve el estado nuevo. No modifica el que
     recibe: devolver un objeto nuevo hace imposible el fallo de "lo cambié
     a medias y se guardó así". */
  R.responder = function (item, gradoId, hoyKey) {
    const g = R.gradoPorId(gradoId);
    if (!g) return null;

    const ef = R.nuevoEF(typeof item.ef === 'number' ? item.ef : R.EF_INICIAL, g.q);
    const repsPrevias = typeof item.reps === 'number' ? item.reps : 0;
    const previo = typeof item.interval === 'number' ? item.interval : 0;

    let reps, interval;

    if (g.q < 3) {
      /* Fallo: se reaprende. Las repeticiones vuelven a cero y el concepto
         reaparece mañana. El EF sí conserva el castigo, así que un concepto
         que fallas muchas veces crecerá más despacio para siempre. */
      reps = 0;
      interval = 1;
    } else {
      reps = repsPrevias + 1;
      if (reps === 1) interval = 1;
      else if (reps === 2) interval = 6;
      else interval = Math.round(previo * ef);
      // Con EF bajo, redondear puede dejar el intervalo igual o menor que el
      // anterior y el concepto se estancaría. Siempre tiene que avanzar.
      if (interval <= previo) interval = previo + 1;
    }

    // Tope de dos años: más allá, un repaso deja de ser un repaso.
    interval = Math.min(interval, 730);

    return {
      ef: ef,
      reps: reps,
      interval: interval,
      lapses: (item.lapses || 0) + (g.q < 3 ? 1 : 0),
      due: R.sumarDias(hoyKey, interval),
      ultimoRepaso: hoyKey,
      historial: (item.historial || []).concat([{
        fecha: hoyKey, grado: gradoId, intervalo: interval, ef: ef
      }])
    };
  };

  // Estado de un concepto recién creado: se repasa hoy mismo.
  R.nuevo = function (hoyKey) {
    return {
      ef: R.EF_INICIAL,
      reps: 0,
      interval: 0,
      lapses: 0,
      due: hoyKey,
      ultimoRepaso: null,
      historial: []
    };
  };

  /* Suma días a una fecha 'AAAA-MM-DD' en hora local.
     Con Date(cadena) JavaScript interpreta UTC y en España o América eso
     desplaza un día entero. Se construye la fecha por partes a propósito. */
  R.sumarDias = function (key, dias) {
    const p = key.split('-');
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    d.setDate(d.getDate() + dias);
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  };

  R.vence = function (item, hoyKey) {
    return !item.due || item.due <= hoyKey;
  };

  /* Una nota puede vivir en el bloc sin entrar en la rotación.

     Existe porque el bloc guarda dos cosas distintas: lógicas cortas, que son
     tarjetas de verdad, y textos largos —el resumen de una clase, un
     conversatorio entero— que son material de consulta. Preguntarte un
     resumen de ochocientas palabras cada seis días no fija nada, y además
     entierra en la cola las tarjetas que sí valían. Por defecto sí se repasa:
     quien quiera guardar sin repasar lo dice. */
  R.enRepaso = function (item) {
    return !!item && item.repasar !== false;
  };

  // Días de retraso. Negativo = todavía no toca.
  R.diasDeRetraso = function (item, hoyKey) {
    if (!item.due) return 0;
    const a = new Date(hoyKey.split('-').join('/'));
    const b = new Date(item.due.split('-').join('/'));
    return Math.round((a - b) / 86400000);
  };

  /* Los que tocan hoy, primero los más atrasados. Un concepto con tres
     semanas de retraso está más cerca de olvidarse que el de ayer. */
  R.pendientes = function (items, hoyKey) {
    return items
      .filter(function (i) { return R.enRepaso(i) && R.vence(i, hoyKey); })
      .sort(function (a, b) {
        return R.diasDeRetraso(b, hoyKey) - R.diasDeRetraso(a, hoyKey);
      });
  };

  /* Qué tan asentado está un concepto, de 0 a 1. No es SM-2: es una lectura
     para la interfaz, para poder decir "esto ya lo tienes" sin hacer que el
     usuario interprete un intervalo en días. */
  R.solidez = function (item) {
    const dias = item.interval || 0;
    if (dias >= 180) return 1;
    return Math.min(1, Math.round((dias / 180) * 100) / 100);
  };

  R.etiquetaSolidez = function (item) {
    const d = item.interval || 0;
    if (!item.reps) return 'sin empezar';
    if (d < 7) return 'reciente';
    if (d < 30) return 'asentándose';
    if (d < 120) return 'sólido';
    return 'memorizado';
  };

  if (raiz.H) raiz.H.repaso = R;
  if (typeof module !== 'undefined' && module.exports) module.exports = R;
})(typeof window !== 'undefined' ? window : globalThis);
