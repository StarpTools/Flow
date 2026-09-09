/* Widget flotante: que deberias estar haciendo ahora mismo. */
(function (H) {
  'use strict';

  let data = null;
  let session = null;

  const root = document.getElementById('w');

  // Siguiente tarea del plan de hoy que aun no esta cumplida.
  function nextPending() {
    if (!data) return null;
    const adh = H.dayAdherence(data, H.dateKey());
    if (!adh.hasPlan) return null;
    const pending = adh.items.filter(function (i) {
      return i.ratio < 0.999;
    });
    return pending.length ? pending[0] : null;
  }

  function render() {
    if (!data) return;

    // --- Verificación pendiente: lo único que importa en pantalla ---------
    if (session && session.checkin) {
      const left = Math.max(0, Math.ceil((session.checkin.deadline - Date.now()) / 1000));
      root.className = 'w alert';
      root.innerHTML =
        '<div class="w-top"><div class="w-title pulse" style="color:var(--warn)">Verificación</div>' +
        '</div>' +
        '<div class="w-mid"><div class="w-ask">¿Sigues en ' +
        H.esc(H.actName(data, session.activityId)) + '?</div></div>' +
        '<div class="w-foot"><button class="btn dark" data-act="confirm">Si, sigo</button>' +
        '<button class="btn" data-act="pause">Pausar</button>' +
        '<span style="margin-left:auto" data-live="grace">' + left + 's</span></div>';
      return;
    }

    // --- Sesión en curso o en pausa --------------------------------------
    if (session) {
      const running = session.state === 'running';
      const spot = H.spotName(data, session.spotId);

      // Progreso contra lo planificado para esa actividad hoy.
      const adh = H.dayAdherence(data, H.dateKey());
      const planRow = adh.items.filter(function (i) {
        return i.item.activityId === session.activityId;
      })[0];
      const planned = planRow ? planRow.item.plannedMins : 0;
      const doneNow = (planRow ? planRow.doneMins : 0) + session.countedSec / 60;
      const pctW = planned ? Math.min(100, Math.round((doneNow / planned) * 100)) : 0;

      root.className = 'w' + (running ? ' running' : '');
      root.innerHTML =
        '<div class="w-top">' +
        '<span class="dot" style="background:' + H.actColor(data, session.activityId) + '"></span>' +
        '<div class="w-title">' + H.esc(H.actName(data, session.activityId)) +
        (spot ? ' <span class="w-sub">· ' + H.esc(spot) + '</span>' : '') + '</div>' +
        '</div>' +

        '<div class="w-mid">' +
        '<div class="w-time' + (running ? '' : ' idle') + '" data-live="timer">' +
        H.hms(session.countedSec) + '</div>' +
        (running
          ? '<button class="btn" data-act="pause">Pausa</button>'
          : '<button class="btn primary" data-act="resume">Seguir</button>') +
        '<button class="btn dark" data-act="finish">Fin</button></div>' +

        '<div class="w-foot">' +
        (session.unverifiedSec > 0
          ? '<span style="color:var(--warn);font-weight:600">' +
            H.hm(session.unverifiedSec / 60) + ' sin verificar</span>'
          : '') +
        (planned
          ? '<div class="w-meter"><i style="width:' + pctW + '%"></i></div>' +
            '<span>' + H.hm(doneNow) + ' / ' + H.hm(planned) + '</span>'
          : session.unverifiedSec > 0
          ? ''
          : '<span>' + (running ? 'Sin plan para esta tarea' : 'En pausa') + '</span>') +
        '</div>';
      return;
    }

    // --- Sin sesión ------------------------------------------------------
    const next = nextPending();
    root.className = 'w';

    if (!next) {
      const adh = H.dayAdherence(data, H.dateKey());
      root.innerHTML =
        '<div class="w-top">' +
        '<img class="w-mark" src="../app/assets/icon-32.png" alt="">' +
        '<div class="w-title">Flow</div>' +
        '</div>' +
        '<div class="w-mid"><div class="w-ask" style="font-size:13px;color:var(--ink-3)">' +
        (adh.hasPlan ? 'Plan de hoy completo' : 'Hoy no tiene plan') + '</div></div>' +
        // Sin plan no hay nada que contar: el pie se omite en vez de rellenarse
        // con una instruccion.
        (adh.hasPlan
          ? '<div class="w-foot"><span>' + H.hm(adh.doneMins) + ' registradas hoy</span></div>'
          : '');
      return;
    }

    const it = next.item;
    const spot = H.spotName(data, it.spotId);
    const restante = it.plannedMins - next.doneMins;

    root.innerHTML =
      '<div class="w-top">' +
      '<img class="w-mark" src="../app/assets/icon-32.png" alt="">' +
      '<div class="w-title" style="color:var(--ink-3);font-weight:500">Toca ahora</div>' +
      '</div>' +

      '<div class="w-mid">' +
      '<span class="dot" style="background:' + H.actColor(data, it.activityId) + '"></span>' +
      '<div class="w-ask">' + H.esc(H.actName(data, it.activityId)) +
      (spot ? '<div class="w-sub" style="font-weight:400;margin-top:1px">' + H.esc(spot) + '</div>' : '') +
      '</div>' +
      '<button class="btn primary" data-act="start" data-activity="' + it.activityId +
      '" data-spot="' + (it.spotId || '') + '" data-plan-item="' + it.id + '">Empezar</button></div>' +

      '<div class="w-foot"><span>' + H.hm(restante) + ' pendientes' +
      (next.doneMins > 0 ? ' · ' + H.hm(next.doneMins) + ' ya hechas' : '') + '</span></div>';
  }

  // Refresco ligero del cronómetro sin repintar el widget entero.
  function renderLive() {
    const t = root.querySelector('[data-live="timer"]');
    if (t && session) t.textContent = H.hms(session.countedSec);

    const g = root.querySelector('[data-live="grace"]');
    if (g && session && session.checkin) {
      const left = Math.max(0, Math.ceil((session.checkin.deadline - Date.now()) / 1000));
      g.textContent = left + 's';
    }
  }

  /* Volver a la ventana grande sin gastar espacio en un botón etiquetado:
     clic en el logo, o doble clic en cualquier parte del widget. El arrastre
     usa un clic simple sostenido, así que ninguno de los dos lo estorba. */
  root.addEventListener('click', function (e) {
    if (e.target.closest('.w-mark')) {
      window.hq.focusMain();
      return;
    }
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const ds = el.dataset;

    switch (ds.act) {
      case 'start':
        window.hq.session.start({
          activityId: ds.activity,
          spotId: ds.spot || null,
          planItemId: ds.planItem || null
        });
        break;
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
        // Terminar cierra la sesión y la guarda. La nota se agrega desde HQ.
        window.hq.session.finish('');
        break;
    }
  });

  root.addEventListener('dblclick', function (e) {
    // Un doble clic sobre un control ya hizo su trabajo en el primer clic;
    // no debe abrir la ventana ademas.
    if (e.target.closest('button')) return;
    window.hq.focusMain();
  });

  window.hq.onState(function (payload) {
    session = payload.session;
    if (payload.tick) {
      renderLive();
      return;
    }
    if (payload.data) data = payload.data;
    render();
  });

  window.hq.getState().then(function (st) {
    data = st.data;
    session = st.session;
    render();
  });
})(window.H);
