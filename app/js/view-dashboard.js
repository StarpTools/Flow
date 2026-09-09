/* Dashboard: que hiciste y que no, por semana, mes y año. */
(function (H) {
  'use strict';

  H.views = H.views || {};

  function rangeOf(kind) {
    const now = new Date();
    if (kind === 'week') {
      const from = H.startOfWeek(now);
      return { from: from, to: H.addDays(from, 6), label: 'Esta semana' };
    }
    if (kind === 'month') {
      return {
        from: new Date(now.getFullYear(), now.getMonth(), 1),
        to: new Date(now.getFullYear(), now.getMonth() + 1, 0),
        label: H.MONTHS[now.getMonth()] + ' ' + now.getFullYear()
      };
    }
    return {
      from: new Date(now.getFullYear(), 0, 1),
      to: new Date(now.getFullYear(), 11, 31),
      label: String(now.getFullYear())
    };
  }

  function eachDay(from, to, fn) {
    const end = H.dateKey(to);
    let cur = new Date(from);
    let guard = 0;
    while (H.dateKey(cur) <= end && guard++ < 400) {
      fn(H.dateKey(cur), new Date(cur));
      cur = H.addDays(cur, 1);
    }
  }

  function collect(S, kind) {
    const d = S.data;
    const r = rangeOf(kind);
    const todayKey = H.dateKey();

    const days = [];
    let plannedMins = 0;
    let doneMins = 0;
    let extraMins = 0;
    let unverifiedMins = 0;
    let daysWithPlan = 0;
    let daysFullyDone = 0;
    let restCount = 0;
    const missed = [];
    // Cumplimiento de los ítems diarios, por actividad.
    const dailyTally = {};

    eachDay(r.from, r.to, function (key, date) {
      const adh = H.dayAdherence(d, key);
      days.push({ key: key, date: date, adh: adh, future: key > todayKey });

      plannedMins += adh.plannedMins;
      doneMins += adh.doneMins;
      extraMins += adh.extraMins;
      unverifiedMins += H.unverifiedMinutesOf(H.sessionsOn(d, key));

      if (adh.rest && key <= todayKey) restCount++;

      if (adh.hasPlan && key <= todayKey) {
        daysWithPlan++;
        if (adh.ratio >= 0.999) daysFullyDone++;
        adh.missed.forEach(function (m) {
          missed.push({ key: key, item: m.item, doneMins: m.doneMins });
        });
      }

      // Los ítems diarios se cuentan también en días de descanso: dormir
      // cuenta el sábado igual que el martes.
      if (key <= todayKey) {
        H.dayDaily(d, key).forEach(function (it) {
          const t = dailyTally[it.act.id] || (dailyTally[it.act.id] = {
            act: it.act, logged: 0, met: 0, suma: 0
          });
          if (it.logged) {
            t.logged++;
            t.suma += it.value;
            if (it.met) t.met++;
          }
        });
      }
    });

    // Racha: días consecutivos hacia atras desde hoy con plan cumplido al 100%.
    // Un día sin plan no rompe la racha (descansar no es fallar), pero tampoco
    // la alarga.
    let streak = 0;
    let cur = new Date();
    for (let i = 0; i < 400; i++) {
      const key = H.dateKey(cur);
      const adh = H.dayAdherence(d, key);
      if (adh.hasPlan) {
        if (adh.ratio >= 0.999) streak++;
        else break;
      }
      cur = H.addDays(cur, -1);
    }

    return {
      range: r,
      days: days,
      plannedMins: plannedMins,
      doneMins: doneMins,
      extraMins: extraMins,
      unverifiedMins: unverifiedMins,
      totalMins: doneMins + extraMins,
      daysWithPlan: daysWithPlan,
      daysFullyDone: daysFullyDone,
      restCount: restCount,
      daily: Object.keys(dailyTally).map(function (k) { return dailyTally[k]; }),
      missed: missed,
      streak: streak,
      ratio: plannedMins ? doneMins / plannedMins : null
    };
  }

  function byActivity(S, agg) {
    const d = S.data;
    const keys = {};
    agg.days.forEach(function (day) {
      H.sessionsOn(d, day.key).forEach(function (s) {
        const k = s.activityId || 'null';
        keys[k] = (keys[k] || 0) + s.countedSec / 60;
      });
    });
    return Object.keys(keys)
      // Defensa por si un archivo viejo trae horas colgadas de un ítem que
      // hoy es de registro diario: no deben contar como tiempo de trabajo.
      .filter(function (id) {
        const a = H.actById(d, id);
        return !a || a.kind !== 'daily';
      })
      .map(function (id) {
        return {
          label: H.actName(d, id),
          value: Math.round(keys[id]),
          color: H.actColor(d, id)
        };
      })
      .sort(function (a, b) {
        return b.value - a.value;
      });
  }

  function timeline(S, agg, kind) {
    if (kind === 'year') {
      const d = S.data;
      const byMonth = new Array(12).fill(0);
      agg.days.forEach(function (day) {
        byMonth[day.date.getMonth()] += H.minutesOf(H.sessionsOn(d, day.key));
      });
      const nowM = new Date().getMonth();
      return H.charts.columns({
        items: byMonth.map(function (v, i) {
          return {
            label: H.MONTHS[i].slice(0, 3),
            value: Math.round(v / 60),
            muted: i > nowM
          };
        }),
        valueFormat: function (v) {
          return v + 'h';
        },
        height: 170
      });
    }

    const d = S.data;
    const todayKey = H.dateKey();
    return H.charts.columns({
      items: agg.days.map(function (day) {
        return {
          label:
            kind === 'week'
              ? H.DOW[H.dowMon(day.date)]
              : String(day.date.getDate()),
          value: Math.round(H.minutesOf(H.sessionsOn(d, day.key))),
          muted: day.key > todayKey
        };
      }),
      valueFormat: function (v) {
        return H.hm(v);
      },
      height: 170
    });
  }

  function heatmap(S) {
    const d = S.data;
    const year = new Date().getFullYear();
    const todayKey = H.dateKey();

    // Arrancamos en el lunes de la semana del 1 de enero.
    const start = H.startOfWeek(new Date(year, 0, 1));
    const cols = [];
    let cur = new Date(start);

    for (let w = 0; w < 53; w++) {
      const col = [];
      for (let dow = 0; dow < 7; dow++) {
        const key = H.dateKey(cur);
        const inYear = cur.getFullYear() === year;
        const mins = inYear ? H.minutesOf(H.sessionsOn(d, key)) : -1;
        col.push({ key: key, mins: mins, future: key > todayKey });
        cur = H.addDays(cur, 1);
      }
      cols.push(col);
    }

    const shades = ['--heat-0', '--heat-1', '--heat-2', '--heat-3', '--heat-4']
      .map(function (t) { return H.token(t); });
    function shade(mins) {
      if (mins <= 0) return shades[0];
      if (mins < 45) return shades[1];
      if (mins < 120) return shades[2];
      if (mins < 240) return shades[3];
      return shades[4];
    }

    const grid = cols
      .map(function (col) {
        return (
          '<div class="heat-col">' +
          col
            .map(function (c) {
              if (c.mins < 0) return '<div class="heat-cell" style="background:transparent"></div>';
              return (
                '<div class="heat-cell" style="background:' + shade(c.mins) +
                (c.future ? ';opacity:.4' : '') + '" title="' +
                H.esc(H.shortDate(c.key) + ' · ' + H.hm(c.mins)) + '"></div>'
              );
            })
            .join('') +
          '</div>'
        );
      })
      .join('');

    return (
      '<div class="heat">' + grid + '</div>' +
      '<div class="heat-legend" style="margin-top:8px;justify-content:flex-end">Menos' +
      shades
        .map(function (s) {
          return '<span class="heat-cell" style="background:' + s + '"></span>';
        })
        .join('') +
      'Mas</div>'
    );
  }

  function missedTable(S, agg) {
    const d = S.data;
    if (!agg.missed.length) {
      return (
        '<div class="empty"><strong>Nada pendiente</strong>' +
        'Cumpliste todo lo que planificaste en este periodo.</div>'
      );
    }

    const rows = agg.missed
      .slice()
      .reverse()
      .slice(0, 40)
      .map(function (m) {
        const falta = m.item.plannedMins - m.doneMins;
        const nunca = m.doneMins <= 0;
        return (
          '<tr>' +
          '<td>' + H.esc(H.shortDate(m.key)) + '</td>' +
          '<td><span class="dot" style="display:inline-block;background:' +
          H.actColor(d, m.item.activityId) + ';margin-right:6px"></span>' +
          H.esc(H.actName(d, m.item.activityId)) + '</td>' +
          '<td class="r">' + H.hm(m.doneMins) + ' / ' + H.hm(m.item.plannedMins) + '</td>' +
          '<td class="r"><span class="' + (nunca ? 'neg' : 'muted') + '" style="font-weight:600">' +
          (nunca ? 'No se hizo' : '−' + H.hm(falta)) + '</span></td>' +
          '</tr>'
        );
      })
      .join('');

    return (
      '<table><thead><tr><th>Día</th><th>Actividad</th>' +
      '<th class="r">Hecho / Plan</th><th class="r">Falta</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      (agg.missed.length > 40
        ? '<div class="micro" style="padding:8px 14px">Mostrando 40 de ' + agg.missed.length + '.</div>'
        : '')
    );
  }

  H.views.dashboard = {
    html: function (S) {
      const kind = S.ui.dashRange;
      const agg = collect(S, kind);
      const acts = byActivity(S, agg);

      const tab = function (k, label) {
        return (
          '<button class="chip' + (kind === k ? ' on' : '') +
          '" data-act="range" data-kind="' + k + '">' + label + '</button>'
        );
      };

      const ratioTxt = agg.ratio === null ? '—' : Math.round(agg.ratio * 100) + '%';

      return (
        '<div class="page-head">' +
        '<div><h1>Dashboard</h1>' +
        '<div class="micro" style="margin-top:2px">' + H.esc(agg.range.label) + '</div></div>' +
        '<div class="row tight center">' +
        tab('week', 'Semana') + tab('month', 'Mes') + tab('year', 'Año') +
        '<button class="btn sm" data-act="export" style="margin-left:6px">Exportar</button>' +
        '</div></div>' +

        '<div class="grid g4" style="margin-bottom:12px">' +
        '<div class="stat"><div class="stat-label">Tiempo certificado</div>' +
        '<div class="stat-value">' + H.hm(agg.totalMins - agg.unverifiedMins) + '</div>' +
        '<div class="stat-sub">' +
        (agg.unverifiedMins > 0
          ? H.hm(agg.totalMins) + ' registradas, <span style="color:var(--warn);font-weight:600">' +
            H.hm(agg.unverifiedMins) + ' sin verificar</span>'
          : agg.extraMins > 0
          ? H.hm(agg.extraMins) + ' fuera de plan'
          : 'todo verificado') +
        '</div></div>' +

        '<div class="stat"><div class="stat-label">Cumplimiento</div>' +
        '<div class="stat-value' + (agg.ratio >= 0.9 ? ' pos' : agg.ratio !== null && agg.ratio < 0.5 ? ' neg' : '') + '">' +
        ratioTxt + '</div>' +
        '<div class="stat-sub">' + H.hm(agg.doneMins) + ' de ' + H.hm(agg.plannedMins) + '</div></div>' +

        '<div class="stat"><div class="stat-label">Días completos</div>' +
        '<div class="stat-value">' + agg.daysFullyDone + '<span class="muted" style="font-size:15px;font-weight:500"> / ' + agg.daysWithPlan + '</span></div>' +
        '<div class="stat-sub">' +
        (agg.restCount
          ? 'plan cumplido al 100% · ' + H.plural(agg.restCount, 'día de descanso', 'días de descanso')
          : 'días con plan cumplido al 100%') +
        '</div></div>' +

        '<div class="stat"><div class="stat-label">Racha</div>' +
        '<div class="stat-value">' + agg.streak + '</div>' +
        '<div class="stat-sub">días seguidos cumpliendo</div></div>' +
        '</div>' +

        '<div class="panel"><div class="panel-head"><h3>Tiempo por ' +
        (kind === 'year' ? 'mes' : 'día') + '</h3></div>' +
        '<div class="panel-body">' + timeline(S, agg, kind) + '</div></div>' +

        '<div class="panel"><div class="panel-head"><h3>Reparto por actividad</h3>' +
        '<span class="micro">' +
        H.plural(acts.length, 'actividad con registro', 'actividades con registro') +
        '</span></div>' +
        '<div class="panel-body">' +
        H.charts.bars({
          items: acts,
          valueFormat: function (v) {
            return H.hm(v);
          },
          emptyMsg: 'Sin sesiones registradas en este periodo'
        }) +
        '</div></div>' +

        (agg.daily.length
          ? '<div class="panel"><div class="panel-head"><h3>Registro diario</h3>' +
            '<span class="micro">lo que anotas sin cronómetro</span></div>' +
            '<div class="panel-body flush"><table><thead><tr>' +
            '<th></th><th class="r">Cumplidos</th><th class="r">Anotados</th>' +
            '<th class="r">Media</th><th class="r">Meta</th></tr></thead><tbody>' +
            agg.daily.map(function (t) {
              const media = t.logged ? t.suma / t.logged : null;
              const ok = media !== null && media >= t.act.target;
              return '<tr>' +
                '<td><span class="dot" style="display:inline-block;background:' +
                t.act.color + ';margin-right:6px"></span>' + H.esc(t.act.name) + '</td>' +
                '<td class="r"><span class="' + (t.met === t.logged && t.logged ? 'pos' : '') +
                '" style="font-weight:600">' + t.met + '</span>' +
                '<span class="micro"> / ' + t.logged + '</span></td>' +
                '<td class="r">' + t.logged + '</td>' +
                '<td class="r ' + (media === null ? '' : ok ? 'pos' : 'neg') +
                '" style="font-weight:600">' +
                (media === null ? '—' : H.esc(H.fmtDaily(t.act, media))) +
                '</td>' +
                '<td class="r"><span class="micro">' + H.esc(H.fmtDaily(t.act, t.act.target)) + '</span></td></tr>';
            }).join('') +
            '</tbody></table></div></div>'
          : '') +

        (kind === 'year'
          ? '<div class="panel"><div class="panel-head"><h3>Año completo</h3>' +
            '<span class="micro">cada cuadro es un día</span></div>' +
            '<div class="panel-body">' + heatmap(S) + '</div></div>'
          : '') +

        '<div class="panel"><div class="panel-head"><h3>Lo que quedó sin hacer</h3>' +
        '<span class="micro">' +
        H.plural(agg.missed.length, 'tarea incompleta', 'tareas incompletas') +
        '</span></div>' +
        '<div class="panel-body flush">' + missedTable(S, agg) + '</div></div>'
      );
    },

    bind: function (root, S) {
      H.delegate(root, function (act, ds) {
        if (act === 'range') {
          S.ui.dashRange = ds.kind;
          S.render();
        } else if (act === 'export') {
          // Se recalcula con la misma función que pinta la vista, para que la
          // imagen no pueda decir un número distinto del que ves en pantalla.
          H.modals.exportar(S, collect(S, S.ui.dashRange), S.ui.dashRange);
        }
      });
    }
  };
})(window.H);
