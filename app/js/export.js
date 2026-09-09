/* Resumen exportable: una imagen de una página para pegar en el chat o el
   blog del grupo.

   Se construye como un HTML completo y autocontenido (estilos en línea, cero
   archivos externos) porque se renderiza en una ventana oculta cargada desde
   una carpeta temporal, donde cualquier ruta relativa se rompería. */
(function (H) {
  'use strict';

  const W = 860;

  function marca() {
    // El isotipo dibujado como SVG en vez de enlazado: así el HTML no
    // depende de ningún archivo para verse bien.
    return (
      // fill como atributo no entiende var(): se resuelve antes de escribirlo.
      '<svg width="26" height="26" viewBox="0 0 100 100" fill="' +
      (H.token('--brand-mark') || '#FF3B3B') + '">' +
      '<circle cx="22" cy="26" r="11"/><circle cx="60" cy="40" r="8"/>' +
      '<circle cx="41" cy="52" r="14"/><circle cx="14" cy="66" r="8"/>' +
      '<circle cx="52" cy="76" r="11"/></svg>'
    );
  }

  function stat(label, valor, sub, color) {
    return (
      '<div style="flex:1;border:1px solid var(--border);border-radius:8px;padding:14px 16px">' +
      '<div style="font-size:10px;font-weight:600;letter-spacing:.06em;' +
      'text-transform:uppercase;color:var(--ink-4);margin-bottom:6px">' + H.esc(label) + '</div>' +
      '<div style="font-size:26px;font-weight:700;letter-spacing:-.02em;line-height:1.1;' +
      'color:' + (color || 'var(--ink)') + '">' + valor + '</div>' +
      '<div style="font-size:11px;color:var(--ink-3);margin-top:3px">' + (sub || '') + '</div>' +
      '</div>'
    );
  }

  function panel(titulo, cuerpo, nota) {
    return (
      '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-top:12px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;' +
      'padding:9px 14px;border-bottom:1px solid var(--border);background:var(--bg-subtle)">' +
      '<div style="font-size:13px;font-weight:600">' + H.esc(titulo) + '</div>' +
      '<div style="font-size:11px;color:var(--ink-3)">' + (nota || '') + '</div></div>' +
      '<div style="padding:14px">' + cuerpo + '</div></div>'
    );
  }

  /* agg viene de la vista Dashboard: mismo cálculo, misma verdad. Si el
     resumen recalculara por su cuenta, podría contar distinto que la app. */
  H.buildSummary = function (S, agg, kind) {
    const d = S.data;

    const certificadas = agg.totalMins - agg.unverifiedMins;
    const ratioTxt = agg.ratio === null ? '—' : Math.round(agg.ratio * 100) + '%';

    // Reparto por actividad
    const porAct = {};
    agg.days.forEach(function (day) {
      H.sessionsOn(d, day.key).forEach(function (s) {
        const k = s.activityId || 'null';
        porAct[k] = (porAct[k] || 0) + s.countedSec / 60;
      });
    });
    const barras = Object.keys(porAct)
      .map(function (id) {
        return { label: H.actName(d, id), value: Math.round(porAct[id]), color: H.actColor(d, id) };
      })
      .sort(function (a, b) { return b.value - a.value; });

    let cuerpo = '';

    cuerpo += '<div style="display:flex;gap:12px">' +
      stat('Tiempo certificado', H.hm(certificadas),
        agg.unverifiedMins > 0
          ? H.hm(agg.unverifiedMins) + ' sin verificar'
          : 'verificado al 100%') +
      stat('Cumplimiento', ratioTxt,
        H.hm(agg.doneMins) + ' de ' + H.hm(agg.plannedMins),
        agg.ratio >= 0.9 ? 'var(--pos)' : agg.ratio !== null && agg.ratio < 0.5 ? 'var(--neg)' : null) +
      stat('Días completos', agg.daysFullyDone + '<span style="font-size:15px;font-weight:500;' +
        'color:var(--ink-3)"> / ' + agg.daysWithPlan + '</span>',
        agg.restCount ? agg.restCount + ' de descanso' : 'al 100%') +
      stat('Racha', String(agg.streak), 'días seguidos') +
      '</div>';

    if (barras.length) {
      cuerpo += panel('Reparto por actividad',
        H.charts.bars({
          items: barras,
          valueFormat: function (v) { return H.hm(v); }
        }),
        H.plural(barras.length, 'actividad', 'actividades'));
    }

    if (agg.daily.length) {
      const filas = agg.daily.map(function (t) {
        const media = t.logged ? t.suma / t.logged : null;
        const ok = media !== null && media >= t.act.target;
        return '<div style="display:flex;align-items:center;gap:8px;padding:6px 0;' +
          'border-bottom:1px solid var(--border-hair);font-size:12px">' +
          '<span style="width:7px;height:7px;border-radius:50%;background:' + t.act.color + '"></span>' +
          '<div style="flex:1;font-weight:500">' + H.esc(t.act.name) + '</div>' +
          '<div style="color:var(--ink-3)">' + t.met + ' / ' + t.logged + ' cumplidos</div>' +
          '<div style="width:76px;text-align:right;font-weight:600;color:' +
          (media === null ? 'var(--ink-4)' : ok ? 'var(--pos)' : 'var(--neg)') + '">' +
          (media === null ? '—' : 'media ' + H.esc(H.fmtDaily(t.act, media))) +
          '</div></div>';
      }).join('');
      cuerpo += panel('Registro diario', filas);
    }


    // El propio rango ya se describe solo ("Esta semana", "Agosto 2026", "2026").
    return (
      '<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8">' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">' +
      /* Los tokens viajan con el documento, resueltos desde la app viva. Es
         lo que hace que el resumen exportado siga al color de marca en vez de
         quedarse con el que estuviera escrito el día que se programó. */
      '<style>' + H.tokenBlock() +
      '*{box-sizing:border-box;margin:0;padding:0}' +
      'body{font-family:var(--font);background:var(--bg);' +
      'color:var(--ink);font-variant-numeric:tabular-nums;width:' + W + 'px;padding:24px}' +
      'svg{display:block}</style></head><body>' +

      '<div style="display:flex;align-items:center;justify-content:space-between;' +
      'padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:16px">' +
      '<div style="display:flex;align-items:center;gap:9px">' + marca() +
      '<div><div style="font-size:17px;font-weight:700;letter-spacing:-.02em">Flow</div>' +
      '<div style="font-size:11px;color:var(--ink-3)">' + H.esc(agg.range.label) + '</div></div></div>' +
      '<div style="text-align:right;font-size:11px;color:var(--ink-4)">' +
      H.esc(H.shortDate(H.dateKey(agg.range.from))) + ' – ' +
      H.esc(H.shortDate(H.dateKey(agg.range.to))) + '</div></div>' +

      cuerpo +
      '</body></html>'
    );
  };
})(window.H);
