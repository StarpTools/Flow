/* Utilidades compartidas. Namespace global H para evitar modulos ES
   (file:// + type=module choca con la politica de origen de Chromium). */
window.H = window.H || {};

(function (H) {
  'use strict';

  // --- Fechas -------------------------------------------------------------
  // Todo en hora local. Nada de UTC: si son las 23:30 del lunes para ti,
  // la sesión es del lunes.

  H.dateKey = function (d) {
    const dt = d ? new Date(d) : new Date();
    return (
      dt.getFullYear() +
      '-' +
      String(dt.getMonth() + 1).padStart(2, '0') +
      '-' +
      String(dt.getDate()).padStart(2, '0')
    );
  };

  H.parseKey = function (key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };

  H.addDays = function (date, n) {
    const d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  };

  H.MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  H.DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  // Lunes = 0 ... Domingo = 6
  H.dowMon = function (date) {
    return (date.getDay() + 6) % 7;
  };

  H.startOfWeek = function (date) {
    return H.addDays(date, -H.dowMon(date));
  };

  H.longDate = function (date) {
    const s = date.toLocaleDateString('es-ES', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
    return s.charAt(0).toUpperCase() + s.slice(1);
  };

  H.shortDate = function (key) {
    const d = H.parseKey(key);
    return d.getDate() + ' ' + H.MONTHS[d.getMonth()].slice(0, 3).toLowerCase();
  };

  // --- Formato ------------------------------------------------------------

  H.hm = function (mins) {
    const m = Math.max(0, Math.round(mins));
    const h = Math.floor(m / 60);
    const r = m % 60;
    if (h && r) return h + 'h ' + r + 'm';
    if (h) return h + 'h';
    return r + 'm';
  };

  H.hms = function (sec) {
    const s = Math.max(0, Math.floor(sec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return (
      String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0')
    );
  };

  H.money = function (n) {
    const v = Number(n) || 0;
    const sign = v < 0 ? '-' : v > 0 ? '+' : '';
    return sign + '$' + Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
  };

  H.pct = function (n) {
    return (Math.round(n * 10) / 10).toFixed(1) + '%';
  };

  /* Lee una duración escrita a mano y devuelve minutos, o null si no se
     entiende. Un desplegable cerrado obliga a que alguien adivine de antemano
     todas las duraciones posibles, y siempre falta la que necesitas.

     Acepta:  5h · 1h30 · 1h 30m · 1.5h · 1:30 · 90m · 90
     Un número suelto son SIEMPRE minutos. Es ambiguo por naturaleza, así que
     la regla es fija y el campo muestra al instante cómo lo interpretó. */
  H.parseDuration = function (txt) {
    if (txt == null) return null;
    const s = String(txt).toLowerCase().trim().replace(',', '.');
    if (!s) return null;

    // 1:30
    let m = s.match(/^(\d+)\s*:\s*(\d{1,2})$/);
    if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);

    // 5h · 1h30 · 1h 30m · 1.5h · 2 horas 15
    m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:s|r|rs|ora|oras)?\.?\s*(?:(\d+)\s*m?(?:in|ins|inuto|inutos)?\.?)?$/);
    if (m) {
      const mins = Math.round(parseFloat(m[1]) * 60 + (m[2] ? parseInt(m[2], 10) : 0));
      return mins > 0 ? mins : null;
    }

    // 90m · 90 min · 90 minutos
    m = s.match(/^(\d+)\s*m(?:in|ins|inuto|inutos)?\.?$/);
    if (m) {
      const mins = parseInt(m[1], 10);
      return mins > 0 ? mins : null;
    }

    // Número suelto = minutos
    m = s.match(/^(\d+(?:\.\d+)?)$/);
    if (m) {
      const mins = Math.round(parseFloat(m[1]));
      return mins > 0 ? mins : null;
    }

    return null;
  };

  /* Horas escritas a mano, para campos rotulados en horas.

     Se diferencia de parseDuration en UNA cosa, y es deliberada: un número
     suelto aquí son HORAS, no minutos. En el planificador escribes "90" y
     quieres 90 minutos; en "dormir" escribes "7" y quieres 7 horas, no siete
     minutos. El rótulo del campo dice "h", así que el número suelto lo sigue.

     Con unidad explícita no hay ambigüedad y se delega en parseDuration:
       7 → 7h · 7.5 → 7h 30m · 7h30 → 7h 30m · 450m → 7h 30m · 7:30 → 7h 30m */
  H.parseHours = function (txt) {
    if (txt == null) return null;
    const s = String(txt).toLowerCase().trim().replace(',', '.');
    if (!s) return null;

    if (/^\d+(\.\d+)?$/.test(s)) {
      const h = parseFloat(s);
      return h > 0 ? h : null;
    }
    const mins = H.parseDuration(s);
    return mins === null ? null : mins / 60;
  };

  // ¿El ítem diario se mide en tiempo? Dormir sí; peso o pasos no.
  H.isTimeUnit = function (act) {
    return (act.unit || 'h') === 'h';
  };

  // Valor de un ítem diario tal y como se enseña.
  H.fmtDaily = function (act, v) {
    if (v === null || v === undefined) return '—';
    if (H.isTimeUnit(act)) return H.hm(v * 60);
    return (Math.round(v * 100) / 100) + (act.unit ? ' ' + act.unit : '');
  };

  // Lo escrito por el usuario, convertido a la unidad guardada.
  H.parseDaily = function (act, txt) {
    if (H.isTimeUnit(act)) return H.parseHours(txt);
    const n = parseFloat(String(txt == null ? '' : txt).replace(',', '.'));
    return isFinite(n) && n > 0 ? n : null;
  };

  /* "1 tarea" / "3 tareas". Escribir siempre el plural se ve descuidado en
     cuanto el contador cae a uno, que es justo cuando más lo miras. */
  H.plural = function (n, singular, plural) {
    return n + ' ' + (n === 1 ? singular : plural || singular + 's');
  };

  // --- DOM ----------------------------------------------------------------

  H.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  H.el = function (id) {
    return document.getElementById(id);
  };

  // --- Tokens de diseño ---------------------------------------------------
  /* Un atributo SVG (fill="...") NO entiende var(--accent): las variables CSS
     solo funcionan en propiedades, no en atributos de presentación. Por eso
     todo lo que se dibuja como SVG generado tiene que resolver el token a su
     valor real antes de escribirlo.

     Sin esto, cambiar el color de marca cambiaría los botones y dejaría las
     gráficas del color viejo. */
  const tokenCache = {};

  H.token = function (nombre) {
    if (tokenCache[nombre] === undefined) {
      const v = getComputedStyle(document.documentElement)
        .getPropertyValue(nombre)
        .trim();
      tokenCache[nombre] = v || null;
    }
    return tokenCache[nombre];
  };

  // Tras cambiar de tema hay que tirar la caché o las gráficas se quedan atrás.
  H.refreshTokens = function () {
    Object.keys(tokenCache).forEach(function (k) {
      delete tokenCache[k];
    });
    H.PALETTE = leerPaleta();
  };

  /* Volcado de los tokens semánticos con su valor ya resuelto. Lo usa el
     resumen exportable, que se renderiza en una ventana aislada y no puede
     enlazar la hoja de estilos de la app. */
  H.SEMANTIC_TOKENS = [
    'bg', 'bg-subtle', 'bg-sunken', 'bg-hover', 'bg-inverse',
    'border', 'border-strong', 'border-hair',
    'ink', 'ink-2', 'ink-3', 'ink-4', 'ink-on-accent',
    'accent', 'accent-hover', 'accent-soft', 'accent-border',
    'pos', 'pos-soft', 'neg', 'neg-soft', 'warn', 'warn-soft',
    'r-sm', 'r-md', 'r-lg', 'font'
  ];

  H.tokenBlock = function () {
    return ':root{' +
      H.SEMANTIC_TOKENS.map(function (n) {
        return '--' + n + ':' + (H.token('--' + n) || 'initial');
      }).join(';') +
      '}';
  };

  function leerPaleta() {
    const out = [];
    for (let i = 1; i <= 10; i++) {
      const c = H.token('--cat-' + i);
      if (c) out.push(c);
    }
    // Si los tokens no están (hoja de estilos sin cargar), el acento sirve
    // de reserva. Nunca un hex escrito a mano.
    return out.length ? out : [H.token('--accent') || 'currentColor'];
  }

  H.on = function (root, selector, event, handler) {
    root.querySelectorAll(selector).forEach(function (node) {
      node.addEventListener(event, handler);
    });
  };

  // Delegacion por atributo data-act, para no re-enlazar en cada render.
  H.delegate = function (root, handler) {
    root.addEventListener('click', function (e) {
      const target = e.target.closest('[data-act]');
      if (!target || !root.contains(target)) return;
      handler(target.dataset.act, target.dataset, e);
    });
  };

  // --- Consultas sobre los datos -----------------------------------------

  H.actById = function (data, id) {
    return data.activities.find(function (a) {
      return a.id === id;
    });
  };

  H.actName = function (data, id) {
    const a = H.actById(data, id);
    return a ? a.name : 'Sin actividad';
  };

  H.actColor = function (data, id) {
    const a = H.actById(data, id);
    return a ? a.color : H.token('--ink-4');
  };

  H.spotById = function (data, id) {
    return data.spots.find(function (s) {
      return s.id === id;
    });
  };

  H.spotName = function (data, id) {
    const s = H.spotById(data, id);
    return s ? s.name : null;
  };

  H.sessionsOn = function (data, key) {
    return data.sessions.filter(function (s) {
      return s.date === key;
    });
  };

  H.sessionsBetween = function (data, fromKey, toKey) {
    return data.sessions.filter(function (s) {
      return s.date >= fromKey && s.date <= toKey;
    });
  };

  H.minutesOf = function (sessions) {
    return sessions.reduce(function (sum, s) {
      return sum + s.countedSec / 60;
    }, 0);
  };

  /* Minutos que quedaron en duda: tramos donde no respondiste a tiempo la
     verificación. El tiempo no se pierde, pero se reporta aparte para que el
     total certificado signifique algo. */
  H.unverifiedMinutesOf = function (sessions) {
    return sessions.reduce(function (sum, s) {
      return sum + (s.unverifiedSec || 0) / 60;
    }, 0);
  };

  // --- Registro diario y días de descanso ---------------------------------

  H.timedActs = function (data) {
    return data.activities.filter(function (a) {
      return a.kind !== 'daily';
    });
  };

  H.dailyActs = function (data) {
    return data.activities.filter(function (a) {
      return a.kind === 'daily';
    });
  };

  // null = no anotado. Distinto de 0, que sería "dormí cero horas".
  H.dailyValue = function (data, key, actId) {
    const d = data.daily[key];
    return d && typeof d[actId] === 'number' ? d[actId] : null;
  };

  H.isRest = function (data, key) {
    return !!data.restDays[key];
  };

  /* Cumplimiento de los ítems diarios de una fecha. Van aparte del
     cumplimiento del plan: dormir 7h no es tiempo de trabajo y mezclarlo
     inflaría las horas registradas. */
  H.dayDaily = function (data, key) {
    return H.dailyActs(data).map(function (a) {
      const v = H.dailyValue(data, key, a.id);
      return {
        act: a,
        value: v,
        logged: v !== null,
        met: v !== null && v >= (a.target || 0)
      };
    });
  };

  /* Cumplimiento de un día.
     Compara lo planificado con lo realmente registrado, actividad por
     actividad. Un día sin plan no cuenta como incumplido: cuenta como día
     sin plan, que es distinto. */
  H.dayAdherence = function (data, key) {
    const sessions = H.sessionsOn(data, key);

    /* Un día marcado como descanso queda fuera de todas las cuentas, aunque
       tenga cosas agendadas. Decidiste no trabajar: medirte contra un plan
       que anulaste a propósito convertiría el descanso en un fallo. */
    if (H.isRest(data, key)) {
      return {
        rest: true, hasPlan: false, items: [],
        plannedMins: 0, doneMins: 0,
        extraMins: H.minutesOf(sessions),
        totalMins: H.minutesOf(sessions),
        ratio: null, completed: 0, missed: []
      };
    }

    const plan = data.plan[key] || [];

    const doneByAct = {};
    sessions.forEach(function (s) {
      const k = s.activityId || 'null';
      doneByAct[k] = (doneByAct[k] || 0) + s.countedSec / 60;
    });

    const items = plan.map(function (item) {
      const available = doneByAct[item.activityId] || 0;
      const used = Math.min(available, item.plannedMins);
      doneByAct[item.activityId] = available - used;
      return {
        item: item,
        doneMins: used,
        ratio: item.plannedMins ? used / item.plannedMins : 0
      };
    });

    const plannedMins = plan.reduce(function (s, i) {
      return s + i.plannedMins;
    }, 0);
    const doneMins = items.reduce(function (s, i) {
      return s + i.doneMins;
    }, 0);
    const extraMins = H.minutesOf(sessions) - doneMins;

    return {
      rest: false,
      hasPlan: plan.length > 0,
      items: items,
      plannedMins: plannedMins,
      doneMins: doneMins,
      extraMins: Math.max(0, extraMins),
      totalMins: H.minutesOf(sessions),
      ratio: plannedMins ? Math.min(1, doneMins / plannedMins) : null,
      completed: items.filter(function (i) {
        return i.ratio >= 0.999;
      }).length,
      missed: items.filter(function (i) {
        return i.ratio < 0.999;
      })
    };
  };

  // Se lee de los tokens --cat-1..10, no se duplica aquí.
  H.PALETTE = leerPaleta();
})(window.H);
