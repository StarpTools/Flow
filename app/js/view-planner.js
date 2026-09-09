/* Vista Planificar: calendario mensual generado dinamicamente.
   Conserva la mejor idea del Poker HQ v1: los chips de repetición semanal,
   que dejan un mes entero planificado en unos segundos. */
(function (H) {
  'use strict';

  H.views = H.views || {};

  function monthCells(S) {
    const d = S.data;
    const { y, m } = S.ui.planMonth;
    const todayKey = H.dateKey();

    const first = new Date(y, m, 1);
    const lead = H.dowMon(first);
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    let html = H.DOW.map(function (n) {
      return '<div class="cal-head">' + n + '</div>';
    }).join('');

    for (let i = 0; i < lead; i++) html += '<div class="cal-cell empty-cell"></div>';

    for (let day = 1; day <= daysInMonth; day++) {
      const key =
        y + '-' + String(m + 1).padStart(2, '0') + '-' + String(day).padStart(2, '0');
      const items = d.plan[key] || [];
      const planned = items.reduce(function (s, i) {
        return s + i.plannedMins;
      }, 0);

      const esDescanso = H.isRest(d, key);

      /* Los eventos van arriba del todo del día y con otro aspecto: no son
         plan. Una entrega no se cumple a medias ni suma horas — llega. */
      const evs = (d.events || []).filter(function (e) { return e.date === key; });
      const evsHtml = evs.map(function (e) {
        return '<div class="cal-evento">' +
          (e.time ? '<span class="cal-evento-hora">' + e.time + '</span>' : '') +
          '<span>' + H.esc(e.title) + '</span></div>';
      }).join('');

      let cls = 'cal-cell';
      if (esDescanso) cls += ' rest';
      else if (key < todayKey) cls += ' past';
      else if (key === todayKey) cls += ' today';
      if (esDescanso && key === todayKey) cls += ' today';

      // Un día de descanso no enseña plan ni barra: no hay nada que cumplir.
      if (esDescanso) {
        html +=
          '<button class="' + cls + '" data-act="openDay" data-date="' + key + '">' +
          '<div class="cal-num">' + day + '</div>' + evsHtml +
          '<div class="cal-items" style="justify-content:center;align-items:center">' +
          '<span class="micro" style="font-weight:600">Descanso</span></div></button>';
        continue;
      }

      const shown = items.slice(0, 3);
      const rest = items.length - shown.length;

      let inner =
        '<div class="cal-num">' + day + '</div>' + evsHtml + '<div class="cal-items">' +
        shown
          .map(function (it) {
            return (
              '<div class="cal-item">' +
              '<span class="dot" style="background:' + H.actColor(d, it.activityId) + '"></span>' +
              '<span class="cal-item-name">' + H.esc(H.actName(d, it.activityId)) + '</span>' +
              '<span class="cal-item-time">' + H.hm(it.plannedMins) + '</span></div>'
            );
          })
          .join('') +
        (rest > 0 ? '<div class="cal-item"><span class="cal-item-time">+' + rest + ' más</span></div>' : '') +
        '</div>';

      if (planned > 0) {
        const adh = H.dayAdherence(d, key);
        const showBar = key <= todayKey;
        inner +=
          '<div class="cal-foot">' +
          (showBar
            ? '<div class="cal-bar"><i style="width:' +
              Math.round((adh.ratio || 0) * 100) + '%"></i></div>'
            : '') +
          '<span class="cal-total">' + H.hm(planned) + '</span></div>';
      }

      html += '<button class="' + cls + '" data-act="openDay" data-date="' + key + '">' + inner + '</button>';
    }

    const trail = (7 - ((lead + daysInMonth) % 7)) % 7;
    for (let i = 0; i < trail; i++) html += '<div class="cal-cell empty-cell"></div>';

    return html;
  }

  H.views.planner = {
    html: function (S) {
      const d = S.data;
      const { y, m } = S.ui.planMonth;

      // Resumen del mes visible
      const prefix = y + '-' + String(m + 1).padStart(2, '0');
      let plannedMins = 0;
      Object.keys(d.plan).forEach(function (k) {
        if (k.indexOf(prefix) === 0) {
          plannedMins += d.plan[k].reduce(function (s, i) {
            return s + i.plannedMins;
          }, 0);
        }
      });
      const doneMins = H.minutesOf(
        d.sessions.filter(function (s) {
          return s.date.indexOf(prefix) === 0;
        })
      );
      const plannedDays = Object.keys(d.plan).filter(function (k) {
        return k.indexOf(prefix) === 0;
      }).length;

      return (
        '<div class="page-head">' +
        '<div><h1>' + H.MONTHS[m] + ' ' + y + '</h1>' +
        '<div class="micro" style="margin-top:2px">' + plannedDays + ' días con plan · ' +
        H.hm(plannedMins) + ' agendadas · ' + H.hm(doneMins) + ' registradas</div></div>' +
        '<div class="row tight">' +
        '<button class="btn sm" data-act="prevMonth">←</button>' +
        '<button class="btn sm" data-act="thisMonth">Hoy</button>' +
        '<button class="btn sm" data-act="nextMonth">→</button>' +
        '<button class="btn sm" data-act="nuevoEvento">+ Evento</button>' +
        '<button class="btn sm" data-act="manageActs">Actividades</button>' +
        '</div></div>' +
        '<div class="cal">' + monthCells(S) + '</div>' +
        '<div class="micro" style="margin-top:10px">' +
        'Haz clic en un día para agendar. La barra verde bajo cada día pasado muestra ' +
        'cuánto del plan cumpliste realmente. Con “+ Evento” apuntas lo que no se ' +
        'cumple sino que llega: una entrega, una reunión — y te avisa.</div>'
      );
    },

    bind: function (root, S) {
      H.delegate(root, function (act, ds) {
        switch (act) {
          case 'nuevoEvento': {
            /* Cae en hoy si hoy está en el mes que miras, y si no en el día 1:
               apuntar una entrega de noviembre desde noviembre y que el modal
               proponga hoy es proponer justo la fecha equivocada. */
            const pm = S.ui.planMonth;
            const mes = pm.y + '-' + String(pm.m + 1).padStart(2, '0');
            const hoyK = H.dateKey();
            H.modals.evento(S, null, hoyK.indexOf(mes) === 0 ? hoyK : mes + '-01');
            break;
          }
          case 'prevMonth': {
            const p = S.ui.planMonth;
            const nd = new Date(p.y, p.m - 1, 1);
            S.ui.planMonth = { y: nd.getFullYear(), m: nd.getMonth() };
            S.render();
            break;
          }
          case 'nextMonth': {
            const p = S.ui.planMonth;
            const nd = new Date(p.y, p.m + 1, 1);
            S.ui.planMonth = { y: nd.getFullYear(), m: nd.getMonth() };
            S.render();
            break;
          }
          case 'thisMonth': {
            const now = new Date();
            S.ui.planMonth = { y: now.getFullYear(), m: now.getMonth() };
            S.render();
            break;
          }
          case 'openDay':
            H.modals.planDay(S, ds.date);
            break;
          case 'manageActs':
            H.modals.activities(S);
            break;
        }
      });
    }
  };
})(window.H);
