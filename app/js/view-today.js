/* Vista Hoy: el plan del día, la sesión en curso y lo ya registrado. */
(function (H) {
  'use strict';

  H.views = H.views || {};

  function sessionStrip(S) {
    const d = S.data;
    const s = S.session;

    if (!s) return '';

    const actName = H.actName(d, s.activityId);
    const spot = H.spotName(d, s.spotId);
    const color = H.actColor(d, s.activityId);

    // Estado 1: hay un check-in esperando respuesta. Domina la pantalla.
    if (s.checkin) {
      return (
        '<div class="panel" style="border-color:var(--warn);background:var(--warn-soft);margin-bottom:12px">' +
        '<div class="panel-body"><div class="row center" style="gap:16px">' +
        '<div class="grow">' +
        '<div class="eyebrow" style="color:var(--warn)">Verificación</div>' +
        '<h2 style="margin-top:2px">¿Sigues en ' + H.esc(actName) + '?</h2>' +
        '<div class="micro" style="margin-top:3px">Confirma o el tiempo de esta ventana no se cuenta. ' +
        'Quedan <b data-live="grace">--</b></div>' +
        '</div>' +
        '<div class="row tight">' +
        '<button class="btn dark" data-act="confirm">Si, sigo aquí</button>' +
        '<button class="btn" data-act="pause">Pausar</button>' +
        '</div></div></div></div>'
      );
    }

    const running = s.state === 'running';
    const rate = s.checkinsAsked
      ? Math.round((s.checkinsConfirmed / s.checkinsAsked) * 100)
      : null;

    return (
      '<div class="panel" style="margin-bottom:12px' +
      (running ? ';border-color:var(--accent-border)' : '') + '">' +
      '<div class="panel-body"><div class="row center" style="gap:18px">' +
      '<span class="dot" style="width:9px;height:9px;background:' + color + '"></span>' +
      '<div class="grow">' +
      '<div class="eyebrow">' + (running ? 'En curso' : 'En pausa') + '</div>' +
      '<h2 style="margin-top:2px">' + H.esc(actName) +
      (spot ? ' <span class="muted" style="font-weight:400">· ' + H.esc(spot) + '</span>' : '') +
      '</h2>' +
      (rate !== null
        ? '<div class="micro" style="margin-top:3px">' + s.checkinsConfirmed + '/' +
          s.checkinsAsked + ' verificaciones confirmadas' +
          (s.unverifiedSec > 0
            ? ' · <span style="color:var(--warn);font-weight:600">' +
              H.hm(s.unverifiedSec / 60) + ' sin verificar</span>'
            : ' (' + rate + '%)') +
          '</div>'
        : '<div class="micro" style="margin-top:3px">Sin verificaciones todavia</div>') +
      '</div>' +
      '<div style="font-size:30px;font-weight:700;letter-spacing:-0.03em;' +
      'color:' + (running ? 'var(--ink)' : 'var(--ink-4)') + '" data-live="timer">' +
      H.hms(s.countedSec) + '</div>' +
      '<div class="row tight">' +
      (running
        ? '<button class="btn" data-act="pause">Pausar</button>'
        : '<button class="btn primary" data-act="resume">Reanudar</button>') +
      '<button class="btn dark" data-act="finish">Terminar</button>' +
      '</div></div></div></div>'
    );
  }

  function planList(S) {
    const d = S.data;
    const key = H.dateKey();
    const adh = H.dayAdherence(d, key);
    const busy = !!S.session;

    if (!adh.hasPlan) {
      return (
        '<div class="empty"><strong>Hoy no tiene plan</strong>' +
        'Ve a Planificar para agendar el día, o arranca una tarea suelta abajo.</div>'
      );
    }

    return adh.items
      .map(function (row) {
        const it = row.item;
        const name = H.actName(d, it.activityId);
        const spot = H.spotName(d, it.spotId);
        const done = row.ratio >= 0.999;
        const pctW = Math.round(Math.min(1, row.ratio) * 100);

        return (
          '<div class="list-row">' +
          '<span class="dot" style="background:' + H.actColor(d, it.activityId) + '"></span>' +
          '<div class="grow">' +
          '<div style="font-weight:500' + (done ? ';color:var(--ink-3)' : '') + '">' +
          H.esc(name) +
          (spot ? ' <span class="micro">· ' + H.esc(spot) + '</span>' : '') +
          (done ? ' <span class="pos" style="font-weight:600">✓</span>' : '') +
          '</div>' +
          '<div class="meter" style="margin-top:5px;max-width:220px">' +
          '<i class="' + (done ? 'full' : '') + '" style="width:' + pctW + '%"></i></div>' +
          '</div>' +
          '<div style="text-align:right;min-width:82px">' +
          '<div style="font-weight:600">' + H.hm(row.doneMins) + '</div>' +
          '<div class="micro">de ' + H.hm(it.plannedMins) + '</div>' +
          '</div>' +
          '<button class="btn sm' + (done ? '' : ' primary') + '" data-act="start"' +
          ' data-plan-item="' + it.id + '"' +
          ' data-activity="' + it.activityId + '"' +
          ' data-spot="' + (it.spotId || '') + '"' +
          (busy ? ' disabled' : '') + '>Empezar</button>' +
          '</div>'
        );
      })
      .join('');
  }

  /* Registro diario: lo que se anota una vez al día y no se cronometra.
     Va en su propio bloque, separado del plan, porque dormir 7h no es
     tiempo de trabajo y sumarlo a las horas registradas sería mentir. */
  function dailyBlock(S) {
    const items = H.dayDaily(S.data, H.dateKey());
    if (!items.length) return '';

    const filas = items
      .map(function (it) {
        const a = it.act;
        return (
          '<div class="list-row">' +
          '<span class="dot" style="background:' + a.color + '"></span>' +
          '<div class="grow" style="font-weight:500">' + H.esc(a.name) + '</div>' +
          // Texto, no number: acepta "7h 30m", "450m" o "7.5". Un número
          // suelto en un campo de horas son horas, no minutos.
          '<input type="text" style="width:92px;text-align:right"' +
          ' data-daily="' + a.id + '"' +
          ' value="' + (it.logged ? H.esc(H.fmtDaily(a, it.value)) : '') + '"' +
          ' placeholder="—" title="7, 7.5, 7h 30m o 450m">' +
          '<div style="width:118px;text-align:right">' +
          (it.logged
            ? '<span class="' + (it.met ? 'pos' : 'neg') + '" style="font-weight:600">' +
              (it.met ? '✓' : '−' + H.fmtDaily(a, a.target - it.value)) + '</span>' +
              '<span class="micro"> de ' + H.esc(H.fmtDaily(a, a.target)) + '</span>'
            : '<span class="micro">meta ' + H.esc(H.fmtDaily(a, a.target)) + '</span>') +
          '</div></div>'
        );
      })
      .join('');

    const hechos = items.filter(function (i) { return i.met; }).length;

    return (
      '<div class="panel">' +
      '<div class="panel-head"><h3>Registro diario</h3>' +
      '<span class="micro">' + hechos + ' / ' + items.length + ' cumplidos</span></div>' +
      '<div class="panel-body flush">' + filas + '</div></div>'
    );
  }

  /* Las tarjetas de todos los papeles, juntas y ordenadas por retraso.

     Es la única vista que cruza toda la oficina: da igual de qué estante, tema
     o carpeta cuelgue la tarjeta, hoy toca repasarla. La papeleta de dónde vive
     se enseña encima de la pregunta para poder situarla antes de intentar
     recordarla. */
  function tarjetasPendientes(S, hoy) {
    const out = [];
    for (const papel of S.data.reviews) {
      for (const c of papel.tarjetas) {
        if (H.repaso.vence(c, hoy)) out.push({ papel: papel, tarjeta: c });
      }
    }
    // Primero la más atrasada: tres semanas de retraso está más cerca de
    // olvidarse que la de ayer.
    return out.sort(function (a, b) {
      return H.repaso.diasDeRetraso(b.tarjeta, hoy) - H.repaso.diasDeRetraso(a.tarjeta, hoy);
    });
  }

  /* Repasos que tocan hoy.
     No son tareas del plan: no se cronometran ni cuentan como tiempo. Son
     preguntas de treinta segundos. Por eso van en su propio bloque, arriba
     del todo en la columna principal, y desaparecen a medida que respondes. */
  function repasosBlock(S) {
    const d = S.data;
    const hoy = H.dateKey();

    let total = 0;
    for (const p of d.reviews) total += p.tarjetas.length;
    if (!total) return '';

    const pendientes = tarjetasPendientes(S, hoy);

    if (!pendientes.length) {
      const prox = d.reviews
        .reduce(function (acc, p) { return acc.concat(p.tarjetas); }, [])
        .map(function (c) { return c.due; })
        .filter(Boolean)
        .sort()[0];
      return (
        '<div class="panel"><div class="panel-head"><h3>Repasos</h3>' +
        '<span class="micro">' + H.plural(total, 'tarjeta') + ' en seguimiento</span></div>' +
        '<div class="panel-body"><div class="micro">' +
        (prox
          ? 'Nada que repasar hoy. La siguiente toca el ' + H.esc(H.shortDate(prox)) + '.'
          : 'Nada pendiente.') +
        '</div></div></div>'
      );
    }

    // Una cada vez: ver quince a la vez invita a despacharlas sin pensarlas,
    // y una respuesta sin pensar corrompe el calendario durante meses.
    const it = pendientes[0].tarjeta;
    const papel = pendientes[0].papel;
    const tema = H.spotName(d, papel.spotId);
    const carpeta = (d.noteTypes || []).find(function (t) { return t.id === papel.typeId; });
    const retraso = H.repaso.diasDeRetraso(it, hoy);
    const revelado = S.ui.repasoRevelado === it.id;
    const cuerpo = H.notas.aHtml(it.respuesta);

    // Dónde vive la tarjeta, en la línea de arriba. Sitúa la pregunta antes de
    // intentar contestarla, que es lo que la hace contestable.
    const rotulo = [tema, carpeta ? carpeta.name : '', papel.title]
      .filter(Boolean).map(H.esc).join(' · ');

    const botones = H.repaso.GRADOS.map(function (g) {
      const clase = g.id === 'fallo' ? 'btn danger'
        : g.id === 'facil' ? 'btn primary' : 'btn';
      return '<button class="' + clase + '" data-act="grade" data-id="' + it.id +
        '" data-papel="' + papel.id + '" data-grade="' + g.id + '" title="' +
        H.esc(g.ayuda) + '">' + H.esc(g.texto) + '</button>';
    }).join('');

    return (
      '<div class="panel" style="border-color:var(--accent-border)">' +
      '<div class="panel-head" style="background:var(--accent-soft)">' +
      '<h3>Repaso</h3>' +
      '<span class="micro">' + pendientes.length + ' pendiente' +
      (pendientes.length === 1 ? '' : 's') +
      (retraso > 0 ? ' · ' + H.plural(retraso, 'día de retraso', 'días de retraso') : '') +
      '</span></div>' +

      '<div class="panel-body">' +
      (rotulo ? '<div class="eyebrow" style="margin-bottom:6px">' + rotulo + '</div>' : '') +
      '<div style="font-size:15px;font-weight:500;line-height:1.5;margin-bottom:4px">' +
      H.esc(it.pregunta) + '</div>' +
      '<div class="micro" style="margin-bottom:14px">' +
      H.esc(H.repaso.etiquetaSolidez(it)) +
      (it.reps ? ' · ' + H.plural(it.reps, 'acierto seguido', 'aciertos seguidos') : '') +
      (it.lapses ? ' · ' + H.plural(it.lapses, 'fallo') : '') +
      '</div>' +

      /* La respuesta está tapada hasta que dices que ya lo pensaste: recordar
         con la respuesta delante no fija nada. */
      (revelado
        ? (cuerpo
            ? '<div class="nota-cuerpo nota-revelada">' + cuerpo + '</div>'
            : '<div class="micro nota-revelada" style="font-style:italic">' +
              'Esta tarjeta no tiene respuesta escrita.</div>') +
          '<div class="row tight" style="flex-wrap:wrap">' + botones + '</div>' +
          '<div class="micro" style="margin-top:8px">' +
          'Responde con sinceridad: la app ajusta cuándo vuelve según lo que digas.</div>'
        : '<div class="row tight">' +
          '<button class="btn dark" data-act="revelar" data-id="' + it.id +
          '">Ver la respuesta</button>' +
          '<button class="btn ghost" data-act="posponer" data-id="' + it.id +
          '" data-papel="' + papel.id + '">Hoy no</button></div>' +
          '<div class="micro" style="margin-top:8px">' +
          'Intenta recordarla antes de pulsar. El esfuerzo es lo que fija la memoria.' +
          '</div>') +
      '</div></div>'
    );
  }

  function quickStart(S) {
    const d = S.data;
    const busy = !!S.session;
    // Solo cronometrables: no se puede "empezar" a dormir.
    const acts = H.timedActs(d)
      .map(function (a) {
        return '<option value="' + a.id + '">' + H.esc(a.name) + '</option>';
      })
      .join('');
    const spots = d.spots
      .filter(function (s) {
        return !s.archived;
      })
      .map(function (s) {
        return '<option value="' + s.id + '">' + H.esc(s.name) + '</option>';
      })
      .join('');

    // Apilado: en la columna de apoyo dos desplegables en fila quedan
    // demasiado estrechos para leer el nombre de un spot.
    return (
      '<label class="field" style="margin-bottom:8px"><span>Actividad</span>' +
      '<select id="qsAct">' + acts + '</select></label>' +
      '<label class="field" style="margin-bottom:10px"><span>Spot (opcional)</span>' +
      '<select id="qsSpot"><option value="">Ninguno</option>' + spots + '</select></label>' +
      '<button class="btn primary" data-act="quickstart"' + (busy ? ' disabled' : '') +
      ' style="width:100%;justify-content:center">Empezar</button>' +
      (busy
        ? '<div class="micro" style="margin-top:8px">Termina la sesión en curso para empezar otra.</div>'
        : '')
    );
  }

  function loggedToday(S) {
    const d = S.data;
    const list = H.sessionsOn(d, H.dateKey()).slice().reverse();
    if (!list.length) {
      return '<div class="empty">Nada registrado todavia hoy.</div>';
    }

    return (
      '<table><thead><tr>' +
      '<th>Actividad</th><th>Spot</th><th class="r">Tiempo</th><th class="r">Verif.</th><th></th>' +
      '</tr></thead><tbody>' +
      list
        .map(function (s) {
          const spot = H.spotName(d, s.spotId);
          const unver = (s.unverifiedSec || 0) / 60;
          const verif = s.manual
            ? '<span class="micro">manual</span>'
            : unver > 0
            ? '<span style="color:var(--warn);font-weight:600">−' + H.hm(unver) + '</span>'
            : s.checkinsAsked
            ? '<span class="pos" style="font-weight:600">' + s.checkinsConfirmed + '/' +
              s.checkinsAsked + '</span>'
            : '<span class="micro">—</span>';
          return (
            '<tr>' +
            '<td><span class="dot" style="display:inline-block;background:' +
            H.actColor(d, s.activityId) + ';margin-right:6px"></span>' +
            H.esc(H.actName(d, s.activityId)) + '</td>' +
            '<td>' + (spot ? H.esc(spot) : '<span class="micro">—</span>') + '</td>' +
            '<td class="r" style="font-weight:600;color:var(--ink)">' +
            H.hm(s.countedSec / 60) + '</td>' +
            '<td class="r" title="' +
            (unver > 0 ? 'Tiempo que quedó sin confirmar' : 'Verificaciones confirmadas') +
            '">' + verif + '</td>' +
            '<td class="r"><button class="icon-btn" data-act="delSession" data-id="' +
            s.id + '" title="Eliminar">×</button></td>' +
            '</tr>'
          );
        })
        .join('') +
      '</tbody></table>'
    );
  }

  H.views.today = {
    html: function (S) {
      const d = S.data;
      const key = H.dateKey();
      const adh = H.dayAdherence(d, key);
      const total = adh.totalMins;
      const unver = H.unverifiedMinutesOf(H.sessionsOn(d, key));

      const pctTxt = adh.ratio === null ? '—' : Math.round(adh.ratio * 100) + '%';

      return (
        '<div class="page-head">' +
        '<div><h1>' + H.esc(H.longDate(new Date())) + '</h1>' +
        '<div class="micro" style="margin-top:2px">' +
        (adh.hasPlan
          ? adh.completed + ' de ' + H.plural(adh.items.length, 'tarea completa', 'tareas completas')
          : 'Día sin planificar') +
        '</div></div>' +
        '<button class="btn sm" data-act="addManual">Registrar tiempo a mano</button>' +
        '</div>' +

        sessionStrip(S) +

        '<div class="grid g3" style="margin-bottom:12px">' +
        '<div class="stat"><div class="stat-label">Registrado hoy</div>' +
        '<div class="stat-value">' + H.hm(total) + '</div>' +
        '<div class="stat-sub">' +
        (unver > 0
          ? '<span style="color:var(--warn);font-weight:600">' + H.hm(unver) +
            ' sin verificar</span>'
          : adh.hasPlan
          ? 'de ' + H.hm(adh.plannedMins) + ' planificados'
          : 'sin plan') +
        '</div></div>' +

        '<div class="stat"><div class="stat-label">Cumplimiento</div>' +
        '<div class="stat-value' + (adh.ratio >= 1 ? ' pos' : '') + '">' + pctTxt + '</div>' +
        '<div class="stat-sub">' + (adh.extraMins > 0 ? '+' + H.hm(adh.extraMins) + ' fuera de plan' : 'del plan de hoy') + '</div></div>' +

        '<div class="stat"><div class="stat-label">Pendiente</div>' +
        '<div class="stat-value">' + H.hm(Math.max(0, adh.plannedMins - adh.doneMins)) + '</div>' +
        '<div class="stat-sub">' +
        H.plural(adh.missed.length, 'tarea sin cerrar', 'tareas sin cerrar') +
        '</div></div>' +
        '</div>' +

        /* Dos columnas: lo que toca hacer a la izquierda, lo secundario a la
           derecha. En una sola columna, "Hoy" crece con cada tarea del plan y
           empuja fuera de pantalla justo lo que más se mira. */
        '<div class="grid g-main">' +

        '<div>' +
        repasosBlock(S) +
        '<div class="panel">' +
        '<div class="panel-head"><h3>Plan de hoy</h3>' +
        '<span class="micro">' + H.hm(adh.doneMins) + ' / ' + H.hm(adh.plannedMins) + '</span></div>' +
        '<div class="panel-body flush">' + planList(S) + '</div>' +
        '</div>' +
        dailyBlock(S) +
        '</div>' +

        '<div>' +
        '<div class="panel">' +
        '<div class="panel-head"><h3>Tarea suelta</h3>' +
        '<span class="micro">fuera del plan</span></div>' +
        '<div class="panel-body">' + quickStart(S) + '</div>' +
        '</div>' +
        '<div class="panel">' +
        '<div class="panel-head"><h3>Registrado hoy</h3></div>' +
        '<div class="panel-body flush">' + loggedToday(S) + '</div>' +
        '</div>' +
        '</div>' +

        '</div>'
      );
    },

    bind: function (root, S) {
      // Registro diario: guarda al salir del campo o al pulsar Enter, no en
      // cada tecla — un repintado por cada dígito tiraría el foco.
      root.querySelectorAll('[data-daily]').forEach(function (inp) {
        const guardar = function () {
          const raw = inp.value.trim();
          const act = H.actById(S.data, inp.dataset.daily);

          if (raw === '') {
            S.mutate('daily:set', { date: H.dateKey(), activityId: act.id, value: null });
            return;
          }

          const v = H.parseDaily(act, raw);
          if (v === null) {
            // Se avisa y se deja lo escrito para que puedas corregirlo, en
            // vez de guardar un número inventado.
            inp.style.borderColor = 'var(--neg)';
            setTimeout(function () { inp.style.borderColor = ''; }, 1200);
            return;
          }
          S.mutate('daily:set', { date: H.dateKey(), activityId: act.id, value: v });
        };
        inp.addEventListener('blur', guardar);
        inp.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') inp.blur();
        });
      });

      H.delegate(root, function (act, ds) {
        switch (act) {
          case 'start':
            window.hq.session.start({
              activityId: ds.activity,
              spotId: ds.spot || null,
              planItemId: ds.planItem || null
            });
            break;
          case 'quickstart': {
            const a = H.el('qsAct');
            const sp = H.el('qsSpot');
            if (!a || !a.value) return;
            window.hq.session.start({ activityId: a.value, spotId: sp.value || null });
            break;
          }
          case 'pause':
            window.hq.session.pause();
            break;
          case 'resume':
            window.hq.session.resume();
            break;
          case 'confirm':
            window.hq.session.confirm();
            break;
          case 'finish':
            H.modals.finishSession(S);
            break;
          case 'delSession':
            H.modals.confirm('Eliminar este registro?', 'Se borra el tiempo registrado. No se puede deshacer.', function () {
              S.mutate('session:remove', { id: ds.id });
            });
            break;
          case 'addManual':
            H.modals.manualSession(S);
            break;

          case 'revelar':
            // Solo estado de pantalla: no se guarda nada hasta que respondes.
            S.ui.repasoRevelado = ds.id;
            S.render();
            break;
          case 'grade':
            S.ui.repasoRevelado = null;
            S.mutate('card:grade', { notaId: ds.papel, id: ds.id, grade: ds.grade });
            break;
          case 'posponer':
            S.ui.repasoRevelado = null;
            S.mutate('card:posponer', { notaId: ds.papel, id: ds.id, dias: 1 });
            break;
        }
      });
    }
  };
})(window.H);
