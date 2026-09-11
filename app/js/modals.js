/* Modales. */
(function (H) {
  'use strict';

  const M = {};
  const root = function () {
    return H.el('modalRoot');
  };

  function close() {
    root().innerHTML = '';
    document.removeEventListener('keydown', onEsc);
  }

  function onEsc(e) {
    if (e.key === 'Escape') close();
  }

  function open(html, bind) {
    root().innerHTML = '<div class="overlay" data-overlay>' + html + '</div>';
    const overlay = root().querySelector('[data-overlay]');
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) close();
    });
    document.addEventListener('keydown', onEsc);
    if (bind) bind(overlay, close);
  }

  M.close = close;

  /* Campo de duración escribible.
     Acepta "5h", "1h30", "90m" o un número suelto (minutos), y las flechas
     arriba/abajo suben o bajan de a 15 minutos. Debajo confirma en texto
     cómo se interpretó lo que escribiste, que es lo que quita la ambigüedad
     de un número sin unidad. */
  M.duracionHTML = function (id, valorMins, ancho) {
    return (
      '<label class="field" style="width:' + (ancho || 104) + 'px">' +
      '<span>Duración</span>' +
      '<input type="text" id="' + id + '" value="' + H.hm(valorMins || 60) +
      '" placeholder="1h 30m" autocomplete="off" spellcheck="false">' +
      '</label>'
    );
  };

  /* Enlaza el campo. Devuelve una función que da los minutos actuales,
     o null si lo escrito no se entiende. */
  M.duracionBind = function (root, id, hintId) {
    const input = root.querySelector('#' + id);
    const hint = hintId ? root.querySelector('#' + hintId) : null;

    function actual() {
      return H.parseDuration(input.value);
    }

    function pintar() {
      const mins = actual();
      const valido = mins !== null;
      input.style.borderColor = valido || !input.value.trim() ? '' : 'var(--neg)';
      if (!hint) return;
      if (!input.value.trim()) {
        hint.textContent = 'Escribe por ejemplo 5h, 1h30 o 90m.';
        hint.style.color = 'var(--ink-3)';
      } else if (valido) {
        // "Se guardará" en vez de "se agendarán": el sujeto es la actividad,
        // así que no cambia con el número y sirve igual en los dos modales.
        hint.textContent = 'Se guardará como ' + H.hm(mins) + '.';
        hint.style.color = 'var(--ink-3)';
      } else {
        hint.textContent = 'No entendí "' + input.value.trim() + '". Prueba 5h, 1h30 o 90m.';
        hint.style.color = 'var(--neg)';
      }
    }

    input.addEventListener('input', pintar);

    input.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
      e.preventDefault();
      const base = actual();
      if (base === null) return;
      // Pasos de 15 min, pero de 5 en 5 por debajo de la hora: subir de 15
      // en 15 desde 5 minutos se salta los valores cortos que si se usan.
      const paso = base < 60 ? 5 : 15;
      const siguiente = e.key === 'ArrowUp' ? base + paso : base - paso;
      input.value = H.hm(Math.max(5, siguiente));
      pintar();
    });

    // Al salir del campo se normaliza lo escrito ("90" pasa a "1h 30m"),
    // para que veas exactamente lo que se va a guardar.
    input.addEventListener('blur', function () {
      const mins = actual();
      if (mins !== null) input.value = H.hm(mins);
      pintar();
    });

    pintar();
    return actual;
  };

  // --- Genéricos ----------------------------------------------------------

  M.alert = function (title, body) {
    open(
      '<div class="modal"><div class="modal-head"><h2>' + H.esc(title) + '</h2></div>' +
      '<div class="modal-body"><div class="muted">' + H.esc(body) + '</div></div>' +
      '<div class="modal-foot"><button class="btn primary" data-ok>Entendido</button></div></div>',
      function (o, done) {
        o.querySelector('[data-ok]').addEventListener('click', done);
        o.querySelector('[data-ok]').focus();
      }
    );
  };

  M.confirm = function (title, body, onYes) {
    open(
      '<div class="modal"><div class="modal-head"><h2>' + H.esc(title) + '</h2></div>' +
      '<div class="modal-body"><div class="muted">' + H.esc(body) + '</div></div>' +
      '<div class="modal-foot"><button class="btn" data-no>Cancelar</button>' +
      '<button class="btn danger" data-yes>Eliminar</button></div></div>',
      function (o, done) {
        o.querySelector('[data-no]').addEventListener('click', done);
        o.querySelector('[data-yes]').addEventListener('click', function () {
          done();
          onYes();
        });
      }
    );
  };

  // --- Planificar un día --------------------------------------------------
  //
  // El corazón de la app: agendar con repetición semanal.

  M.planDay = function (S, dateKey) {
    const d = S.data;
    const date = H.parseKey(dateKey);
    const todayKey = H.dateKey();
    const { y, m } = S.ui.planMonth;

    /* Los días del tramo que caen en los días de semana elegidos.

       El tramo empieza en el día que abriste y acaba donde diga "hasta", en vez
       de barrer el mes entero: "de hoy al viernes" es lo que se quiere agendar
       la mayoría de las veces, y con el mes como única unidad había que elegir
       entre un solo día o los cuatro lunes que quedan. El pasado no se toca
       nunca: reescribir un plan que ya no puedes cumplir es falsear el
       cumplimiento hacia atrás. */
    const TOPE_DIAS = 400;

    function datesForDows(dows, hasta) {
      if (!dows.length) return [dateKey];
      const desde = dateKey < todayKey ? todayKey : dateKey;
      if (!hasta || hasta < desde) return [];

      const out = [];
      let dt = H.parseKey(desde);
      const fin = H.parseKey(hasta);
      for (let i = 0; i < TOPE_DIAS && dt <= fin; i++) {
        if (dows.indexOf(H.dowMon(dt)) !== -1) out.push(H.dateKey(dt));
        dt = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + 1);
      }
      return out;
    }

    // Solo cronometrables: los ítems diarios no se agendan, se registran.
    const actOpts = H.timedActs(d)
      .map(function (a) {
        return '<option value="' + a.id + '">' + H.esc(a.name) + '</option>';
      })
      .join('');
    const spotOpts = d.spots
      .filter(function (s) {
        return !s.archived;
      })
      .map(function (s) {
        return '<option value="' + s.id + '">' + H.esc(s.name) + '</option>';
      })
      .join('');

    function itemsHtml() {
      const items = S.data.plan[dateKey] || [];
      if (!items.length) return '<div class="empty" style="padding:18px">Este día está vacío.</div>';
      return items
        .map(function (it) {
          const spot = H.spotName(S.data, it.spotId);
          return (
            '<div class="list-row" style="padding-left:0;padding-right:0">' +
            '<span class="dot" style="background:' + H.actColor(S.data, it.activityId) + '"></span>' +
            '<div class="grow">' + H.esc(H.actName(S.data, it.activityId)) +
            (spot ? ' <span class="micro">· ' + H.esc(spot) + '</span>' : '') + '</div>' +
            '<span class="muted">' + H.hm(it.plannedMins) + '</span>' +
            '<button class="icon-btn" data-del="' + it.id + '">×</button></div>'
          );
        })
        .join('');
    }

    // Los eventos del día se ven aquí aunque no sean plan: es la pantalla a la
    // que vienes cuando piensas en ese día concreto.
    function eventosHtml() {
      const evs = (S.data.events || []).filter(function (e) { return e.date === dateKey; });
      if (!evs.length) return '<div class="micro">Ningúno.</div>';
      return evs.map(function (e) {
        return (
          '<div class="list-row" style="padding-left:0;padding-right:0">' +
          '<div class="grow">' + H.esc(e.title) +
          (e.time ? ' <span class="micro">· ' + e.time + '</span>' : '') + '</div>' +
          '<button class="btn sm" data-ev="' + e.id + '">Editar</button></div>'
        );
      }).join('');
    }

    const chips = H.DOW.map(function (n, i) {
      const on = i === H.dowMon(date);
      return '<button class="chip' + (on ? ' on' : '') + '" data-dow="' + i + '">' + n + '</button>';
    }).join('');

    open(
      '<div class="modal wide"><div class="modal-head">' +
      '<div><h2>' + H.esc(H.longDate(date)) + '</h2>' +
      '<div class="micro" id="repeatHint"></div></div>' +
      '<button class="icon-btn" data-close>×</button></div>' +

      '<div class="modal-body">' +
      '<div class="row tight" style="align-items:flex-end;margin-bottom:14px">' +
      '<label class="field grow"><span>Actividad</span><select id="pAct">' + actOpts + '</select></label>' +
      '<label class="field" style="width:150px"><span>Spot</span>' +
      '<select id="pSpot"><option value="">Ninguno</option>' + spotOpts + '</select></label>' +
      M.duracionHTML('pMins', 60) +
      '</div>' +
      '<div class="micro" id="pMinsHint" style="margin:-8px 0 14px"></div>' +

      '<div class="eyebrow" style="margin-bottom:7px">Repetir en</div>' +
      '<div class="row tight" style="flex-wrap:wrap;margin-bottom:6px" id="chipRow">' + chips + '</div>' +
      '<div class="row tight" style="flex-wrap:wrap;align-items:flex-end;margin-bottom:6px">' +
      '<button class="btn sm" data-preset="semana">Todos los días</button>' +
      '<button class="btn sm" data-preset="laborables">Entre semana</button>' +
      '<button class="btn sm" data-preset="finde">Fin de semana</button>' +
      '<button class="btn sm" data-preset="ninguno">Solo este día</button>' +
      '<label class="field" style="width:150px;margin:0 0 0 auto"><span>Hasta el</span>' +
      '<input type="date" id="pHasta" value="' + H.dateKey(new Date(y, m + 1, 0)) +
      '" min="' + (dateKey < todayKey ? todayKey : dateKey) + '"></label>' +
      '</div>' +
      '<div class="micro" style="margin-bottom:16px">' +
      '"Solo este día" deja de repetir. Los días ya pasados nunca se tocan.</div>' +

      '<button class="btn primary" id="pAdd" style="width:100%;justify-content:center">Agregar</button>' +

      '<div class="eyebrow" style="margin:18px 0 4px">Agendado este día</div>' +
      '<div id="pItems">' + itemsHtml() + '</div>' +

      '<div class="eyebrow" style="margin:18px 0 4px">Eventos de este día</div>' +
      '<div id="pEvents">' + eventosHtml() + '</div>' +
      '<button class="btn sm" id="pNewEvent" style="margin-top:8px">+ Evento</button>' +
      '</div>' +

      '<div class="modal-foot">' +
      '<button class="btn" id="pRest">' +
      (H.isRest(d, dateKey) ? 'Quitar descanso' : 'Marcar como descanso') + '</button>' +
      '<button class="btn danger" id="pClear">Vaciar día</button>' +
      '<button class="btn" data-close>Cerrar</button></div></div>',

      function (o, done) {
        /* El modal del evento sustituye a este en vez de abrirse encima: dos
           modales apilados dejan al de abajo inalcanzable y con datos a medias. */
        o.querySelector('#pNewEvent').addEventListener('click', function () {
          done();
          M.evento(S, null, dateKey);
        });
        o.querySelector('#pEvents').addEventListener('click', function (e) {
          const b = e.target.closest('[data-ev]');
          if (!b) return;
          done();
          M.evento(S, b.getAttribute('data-ev'), dateKey);
        });

        const chipRow = o.querySelector('#chipRow');
        const hint = o.querySelector('#repeatHint');
        const addBtn = o.querySelector('#pAdd');

        function activeDows() {
          return Array.prototype.slice
            .call(chipRow.querySelectorAll('.chip.on'))
            .map(function (c) {
              return Number(c.dataset.dow);
            });
        }

        const hastaInput = o.querySelector('#pHasta');

        function refreshHint() {
          const dows = activeDows();
          const targets = datesForDows(dows, hastaInput.value);
          if (!dows.length) {
            hint.textContent = 'Solo este día';
            addBtn.textContent = 'Agregar a este día';
          } else if (!targets.length) {
            hint.textContent = 'Ningún día en ese tramo';
            addBtn.textContent = 'Nada que agregar';
          } else {
            hint.textContent =
              targets.length + ' días hasta el ' + H.shortDate(hastaInput.value) + ' (' +
              dows.map(function (i) { return H.DOW[i]; }).join(', ') + ')';
            addBtn.textContent = 'Agregar a ' + targets.length + ' días';
          }
        }

        function refreshItems() {
          o.querySelector('#pItems').innerHTML = itemsHtml();
        }

        chipRow.addEventListener('click', function (e) {
          const chip = e.target.closest('.chip');
          if (!chip) return;
          chip.classList.toggle('on');
          refreshHint();
        });

        hastaInput.addEventListener('change', refreshHint);

        /* Atajos. "Toda la semana" son siete clics uno a uno, y es justo lo que
           más se agenda: un curso que se lleva todos los días hasta el examen. */
        const PRESETS = {
          semana: [0, 1, 2, 3, 4, 5, 6],
          laborables: [0, 1, 2, 3, 4],
          finde: [5, 6],
          ninguno: []
        };
        o.querySelectorAll('[data-preset]').forEach(function (b) {
          b.addEventListener('click', function () {
            const dows = PRESETS[b.getAttribute('data-preset')];
            chipRow.querySelectorAll('.chip').forEach(function (c) {
              c.classList.toggle('on', dows.indexOf(Number(c.dataset.dow)) !== -1);
            });
            refreshHint();
          });
        });

        const duracion = M.duracionBind(o, 'pMins', 'pMinsHint');

        addBtn.addEventListener('click', async function () {
          const activityId = o.querySelector('#pAct').value;
          if (!activityId) return;
          const mins = duracion();
          if (mins === null) {
            o.querySelector('#pMins').focus();
            return;
          }
          const dias = datesForDows(activeDows(), hastaInput.value);
          if (!dias.length) return;
          await S.mutate('plan:add', {
            dates: dias,
            activityId: activityId,
            spotId: o.querySelector('#pSpot').value || null,
            plannedMins: mins
          });
          refreshItems();
        });

        // Enter en el campo de duración agenda directo.
        o.querySelector('#pMins').addEventListener('keydown', function (e) {
          if (e.key === 'Enter') addBtn.click();
        });

        o.querySelector('#pItems').addEventListener('click', async function (e) {
          const btn = e.target.closest('[data-del]');
          if (!btn) return;
          await S.mutate('plan:remove', { date: dateKey, id: btn.dataset.del });
          refreshItems();
        });

        o.querySelector('#pClear').addEventListener('click', async function () {
          await S.mutate('plan:clearDay', { date: dateKey });
          refreshItems();
        });

        o.querySelector('#pRest').addEventListener('click', async function () {
          await S.mutate('rest:toggle', { date: dateKey });
          done();
          S.render();
        });

        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });

        refreshHint();
      }
    );
  };

  // --- Actividades --------------------------------------------------------

  /* --- Evento -------------------------------------------------------------

     Un evento no es plan. El plan son horas que cumples o no; un evento es un
     punto en el tiempo que simplemente llega: una entrega, una reunión, un
     examen. Por eso no tiene duración ni entra en el cumplimiento del día. */

  // Antelación del aviso. -1 es "ninguno": un evento apuntado para verlo venir
  // en el calendario no tiene por qué interrumpirte.
  const AVISOS = [
    [-1, 'Sin aviso'],
    [0, 'A la hora'],
    [15, '15 minutos antes'],
    [60, '1 hora antes'],
    [180, '3 horas antes'],
    [1440, 'Un día antes'],
    [4320, 'Tres días antes'],
    [10080, 'Una semana antes']
  ];

  M.evento = function (S, eventId, dateKey) {
    const ev = eventId ? (S.data.events || []).find(function (x) { return x.id === eventId; }) : null;
    const fecha = ev ? ev.date : (dateKey || H.dateKey());
    const avisa = ev ? ev.avisarMin : 60;

    open(
      '<div class="modal"><div class="modal-head"><h2>' +
      (ev ? 'Editar evento' : 'Nuevo evento') + '</h2>' +
      '<button class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body">' +

      '<label class="field" style="margin-bottom:12px"><span>Qué es</span>' +
      '<input type="text" id="evTitle" value="' + H.esc(ev ? ev.title : '') +
      '" placeholder="Entrega del informe / Reunión con el cliente"></label>' +

      '<div class="row tight" style="align-items:flex-end;margin-bottom:12px">' +
      '<label class="field grow" style="margin:0"><span>Día</span>' +
      '<input type="date" id="evDate" value="' + fecha + '"></label>' +
      '<label class="field" style="width:120px;margin:0"><span>Hora</span>' +
      '<input type="time" id="evTime" value="' + (ev ? ev.time : '') + '"></label>' +
      '</div>' +
      '<div class="micro" style="margin:-6px 0 14px">' +
      'Sin hora es un evento de todo el día: el aviso se cuenta desde las 9:00.</div>' +

      '<label class="field" style="margin-bottom:12px"><span>Avisarme</span>' +
      '<select id="evAviso">' +
      AVISOS.map(function (a) {
        return '<option value="' + a[0] + '"' + (a[0] === avisa ? ' selected' : '') +
          '>' + a[1] + '</option>';
      }).join('') +
      '</select></label>' +

      '<label class="field" style="margin-bottom:6px"><span>Nota (opcional)</span>' +
      '<textarea id="evNote" rows="2" placeholder="Con quién, dónde, qué llevar">' +
      H.esc(ev ? ev.note : '') + '</textarea></label>' +

      '<div class="micro" id="evErr" style="margin-top:10px;color:var(--neg)"></div>' +
      '</div><div class="modal-foot">' +
      (ev ? '<button class="btn danger" id="evDel" style="margin-right:auto">Eliminar</button>' : '') +
      '<button class="btn" data-close>Cancelar</button>' +
      '<button class="btn primary" id="evSave">Guardar</button></div></div>',

      function (o, done) {
        const err = o.querySelector('#evErr');

        o.querySelector('#evSave').addEventListener('click', async function () {
          const res = await S.mutate(ev ? 'event:update' : 'event:add', {
            id: ev ? ev.id : undefined,
            title: o.querySelector('#evTitle').value,
            date: o.querySelector('#evDate').value,
            time: o.querySelector('#evTime').value,
            avisarMin: Number(o.querySelector('#evAviso').value),
            note: o.querySelector('#evNote').value
          });
          if (res && !res.ok) { err.textContent = res.error || 'No se pudo guardar'; return; }
          done();
          S.render();
        });

        const del = o.querySelector('#evDel');
        if (del) {
          del.addEventListener('click', function () {
            done();
            M.confirm('¿Eliminar "' + ev.title + '"?',
              'El evento desaparece del calendario y no volverá a avisar.',
              async function () {
                await S.mutate('event:remove', { id: ev.id });
                S.render();
              });
          });
        }

        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });
        const t = o.querySelector('#evTitle');
        t.focus();
        t.select();
      }
    );
  };

  M.activities = function (S) {
    function fila(a) {
      const diaria = a.kind === 'daily';
      return (
        '<div class="list-row" style="padding-left:0;padding-right:0">' +
        '<input type="color" value="' + a.color + '" data-color="' + a.id +
        '" style="width:24px;height:24px;padding:0;border:1px solid var(--border);' +
        'border-radius:4px;cursor:pointer;background:none">' +
        '<div class="grow">' + H.esc(a.name) + '</div>' +
        (diaria
          ? '<div class="row tight center" style="gap:5px">' +
            '<span class="micro">meta</span>' +
            // Texto y no number: acepta "7h 30m" además de "7.5", y el ancho
            // da de sobra para "1h 30m" sin cortar el valor.
            '<input type="text" data-target="' + a.id + '" style="width:88px;text-align:right"' +
            ' value="' + H.esc(H.fmtDaily(a, a.target || 1)) + '"' +
            ' title="Se puede escribir 7, 7.5, 7h 30m o 450m">' +
            '</div>'
          : '') +
        '<button class="icon-btn" data-del="' + a.id + '">×</button></div>'
      );
    }

    function listHtml() {
      const timed = H.timedActs(S.data);
      const daily = H.dailyActs(S.data);
      let h = '';
      if (timed.length) {
        h += '<div class="eyebrow" style="margin-bottom:2px">Cronometradas</div>' +
          timed.map(fila).join('');
      }
      if (daily.length) {
        h += '<div class="eyebrow" style="margin:14px 0 2px">Registro diario</div>' +
          daily.map(fila).join('');
      }
      return h;
    }

    open(
      '<div class="modal"><div class="modal-head"><h2>Actividades</h2>' +
      '<button class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body">' +
      '<div id="aList">' + listHtml() + '</div>' +
      '<div class="row tight" style="margin-top:16px;align-items:flex-end">' +
      '<label class="field grow" style="margin:0"><span>Nueva actividad</span>' +
      '<input type="text" id="aNew" placeholder="Warmup"></label>' +
      '<label class="field" style="width:132px;margin:0"><span>Tipo</span>' +
      '<select id="aKind">' +
      '<option value="timed">Cronometrada</option>' +
      '<option value="daily">Registro diario</option></select></label>' +
      '<button class="btn primary" id="aAdd" style="height:31px">Añadir</button></div>' +
      '<div class="micro" style="margin-top:10px">' +
      '<b>Cronometrada</b>: se agenda en el calendario y se mide con el widget.<br>' +
      '<b>Registro diario</b>: un número que anotas una vez al día, sin cronómetro ' +
      '(dormir, peso, pasos). Eliminar una actividad no borra el tiempo ya registrado.</div>' +
      '</div><div class="modal-foot"><button class="btn" data-close>Cerrar</button></div></div>',

      function (o, done) {
        const list = o.querySelector('#aList');
        const input = o.querySelector('#aNew');

        function refresh() {
          list.innerHTML = listHtml();
        }

        async function add() {
          const v = input.value.trim();
          if (!v) return;
          const kind = o.querySelector('#aKind').value;
          const res = await S.mutate('activity:add', {
            name: v,
            kind: kind,
            target: kind === 'daily' ? 1 : undefined,
            unit: kind === 'daily' ? 'h' : undefined
          });
          if (!res.ok) {
            input.style.borderColor = 'var(--neg)';
            return;
          }
          input.value = '';
          input.style.borderColor = '';
          refresh();
        }

        o.querySelector('#aAdd').addEventListener('click', add);
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') add();
        });

        list.addEventListener('click', async function (e) {
          const btn = e.target.closest('[data-del]');
          if (!btn) return;
          await S.mutate('activity:remove', { id: btn.dataset.del });
          refresh();
        });

        list.addEventListener('change', async function (e) {
          const picker = e.target.closest('[data-color]');
          if (picker) {
            await S.mutate('activity:rename', { id: picker.dataset.color, color: picker.value });
            return;
          }
          const meta = e.target.closest('[data-target]');
          if (meta) {
            const act = H.actById(S.data, meta.dataset.target);
            const v = H.parseDaily(act, meta.value);
            if (v === null) {
              // No se entendió: se devuelve el valor guardado en vez de dejar
              // en pantalla algo que no se va a guardar.
              meta.value = H.fmtDaily(act, act.target);
              meta.style.borderColor = 'var(--neg)';
              setTimeout(function () { meta.style.borderColor = ''; }, 1200);
              return;
            }
            await S.mutate('activity:rename', { id: meta.dataset.target, target: v });
            // Se normaliza: escribes "450m" y ves "7h 30m".
            meta.value = H.fmtDaily(H.actById(S.data, meta.dataset.target), v);
          }
        });

        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });
        input.focus();
      }
    );
  };

  // --- Spot ---------------------------------------------------------------

  M.spot = function (S, spotId) {
    const sp = spotId ? H.spotById(S.data, spotId) : null;
    /* El color de un spot no es decoración: es lo que hace visible en qué
       ámbito del bloc estás escribiendo. Se elige aquí porque es donde se
       decide qué es este spot. */
    const color = sp ? sp.color : H.PALETTE[S.data.spots.length % H.PALETTE.length];

    /* El estante en el que nace el tema. Uno nuevo se queda en el que estás
       mirando, y no existe la opción de dejarlo sin estante: un tema sin
       estante no sale en ninguna lista — la oficina se recorre estante a
       estante — y desaparecería nada más crearlo, con todo lo que le metas
       dentro. Ya pasó una vez y costó un curso entero de apuntes. */
    const estanteActual = sp
      ? (sp.groupId || null)
      : ((H.estudio && H.estudio.estante(S) || {}).id || null);
    const muestras = H.PALETTE.map(function (c) {
      return '<button class="chip" data-color="' + c + '" style="width:26px;height:26px;' +
        'padding:0;background:' + c + ';border-color:' + (c === color ? 'var(--ink)' : 'transparent') +
        ';border-width:2px"></button>';
    }).join('');

    open(
      '<div class="modal"><div class="modal-head"><h2>' +
      (sp ? 'Editar tema' : 'Nuevo tema') + '</h2>' +
      '<button class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body">' +
      '<label class="field" style="margin-bottom:12px"><span>Nombre</span>' +
      '<input type="text" id="spName" value="' + H.esc(sp ? sp.name : '') +
      '" placeholder="Git y control de versiones"></label>' +
      '<label class="field" style="margin-bottom:12px"><span>Nota (opcional)</span>' +
      '<textarea id="spNote" rows="3" placeholder="Qué quieres sacar de este tema">' +
      H.esc(sp ? sp.note : '') + '</textarea></label>' +

      // El estante donde vive el tema. Se crean y se editan desde Estudio, no
      // desde aquí: abrir un modal encima de otro se lleva por delante el
      // primero con todo lo que llevaras escrito.
      '<label class="field" style="margin-bottom:12px"><span>Estante</span>' +
      '<select id="spGroup">' +
      // Solo cuando no hay ni un estante donde ponerlo.
      ((S.data.spotGroups || []).length ? '' : '<option value="">Sin estante</option>') +
      (S.data.spotGroups || []).map(function (g) {
        return '<option value="' + g.id + '"' +
          (g.id === estanteActual ? ' selected' : '') + '>' + H.esc(g.name) + '</option>';
      }).join('') +
      '</select></label>' +
      '<div class="eyebrow" style="margin-bottom:7px">Color</div>' +
      '<div class="row tight" id="spColors" style="flex-wrap:wrap">' + muestras + '</div>' +
      '<input type="hidden" id="spColorVal" value="' + color + '">' +
      '<div class="micro" style="margin-top:8px">' +
      'Es la señal de qué tema estás mirando cuando abres un papel.</div>' +
      '</div><div class="modal-foot">' +
      '<button class="btn" data-close>Cancelar</button>' +
      '<button class="btn primary" id="spSave">Guardar</button></div></div>',

      function (o, done) {
        const name = o.querySelector('#spName');
        const hidden = o.querySelector('#spColorVal');
        const grupo = o.querySelector('#spGroup');

        o.querySelector('#spColors').addEventListener('click', function (e) {
          const b = e.target.closest('[data-color]');
          if (!b) return;
          hidden.value = b.dataset.color;
          o.querySelectorAll('#spColors [data-color]').forEach(function (x) {
            x.style.borderColor = x.dataset.color === hidden.value ? 'var(--ink)' : 'transparent';
          });
        });

        o.querySelector('#spSave').addEventListener('click', async function () {
          const v = name.value.trim();
          if (!v) {
            name.style.borderColor = 'var(--neg)';
            return;
          }
          const note = o.querySelector('#spNote').value;
          const gId = grupo.value;
          if (sp) {
            await S.mutate('spot:update',
              { id: sp.id, name: v, note: note, color: hidden.value, groupId: gId || null });
          } else {
            await S.mutate('spot:add',
              { name: v, note: note, color: hidden.value, groupId: gId || null });
          }
          done();
          S.render();
        });

        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });
        name.focus();
      }
    );
  };

  /* Grupo de spots. `alCrear` es opcional: lo usa el modal del spot para
     recoger el grupo recién creado sin cerrarse. */
  M.spotGroup = function (S, groupId, alCrear) {
    const grupos = S.data.spotGroups || [];
    const g = groupId ? grupos.find(function (x) { return x.id === groupId; }) : null;
    const dentro = g
      ? S.data.spots.filter(function (s) { return s.groupId === g.id; }).length
      : 0;

    open(
      '<div class="modal"><div class="modal-head"><h2>' +
      (g ? 'Editar estante' : 'Nuevo estante') + '</h2>' +
      '<button class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body">' +
      '<label class="field" style="margin-bottom:14px"><span>Nombre</span>' +
      '<input type="text" id="sgName" value="' + H.esc(g ? g.name : '') +
      '" placeholder="Programación"></label>' +
      '<div class="micro">Un estante agrupa temas que van juntos. Se cambia de ' +
      'estante con el desplegable de la cabecera, sin salir de Estudio.</div>' +
      '<div class="micro" id="sgErr" style="margin-top:10px;color:var(--neg)"></div>' +
      '</div><div class="modal-foot">' +
      (g ? '<button class="btn danger" id="sgDel" style="margin-right:auto">Eliminar</button>' : '') +
      '<button class="btn" data-close>Cancelar</button>' +
      '<button class="btn primary" id="sgSave">Guardar</button></div></div>',

      function (o, done) {
        const name = o.querySelector('#sgName');
        const err = o.querySelector('#sgErr');

        o.querySelector('#sgSave').addEventListener('click', async function () {
          const v = name.value.trim();
          if (!v) { name.style.borderColor = 'var(--neg)'; return; }
          const res = g
            ? await S.mutate('spotGroup:update', { id: g.id, name: v })
            : await S.mutate('spotGroup:add', { name: v });
          if (res && !res.ok) { err.textContent = res.error || 'No se pudo guardar'; return; }
          const nuevo = g || S.data.spotGroups[S.data.spotGroups.length - 1];
          done();
          if (alCrear) alCrear(nuevo);
          else S.render();
        });

        const del = o.querySelector('#sgDel');
        if (del) {
          del.addEventListener('click', function () {
            done();
            M.confirm(
              '¿Eliminar el estante "' + g.name + '"?',
              dentro
                ? H.plural(dentro, 'tema') + ' ' + (dentro === 1 ? 'se queda' : 'se quedan') +
                  ' sin estante y ' + (dentro === 1 ? 'lo recoge' : 'los recoge') +
                  ' "Papeles sueltos", donde puedes darles otro. No se borra ' +
                  'ninguno, ni sus sesiones, ni sus papeles.'
                : 'Está vacío, no se pierde nada.',
              async function () {
                await S.mutate('spotGroup:remove', { id: g.id });
                S.render();
              }
            );
          });
        }

        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });
        name.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') o.querySelector('#sgSave').click();
        });
        name.focus();
        name.select();
      }
    );
  };

  // --- Exportar resumen ---------------------------------------------------

  M.exportar = function (S, agg, kind) {
    const periodo = kind === 'week' ? 'semana' : kind === 'month' ? 'mes' : 'año';
    const nombre = 'flow-' + periodo + '-' + H.dateKey() + '.png';

    open(
      '<div class="modal wide"><div class="modal-head"><h2>Resumen ' +
      (kind === 'week' ? 'de la semana' : kind === 'month' ? 'del mes' : 'del año') + '</h2>' +
      '<button class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body" id="expBody" style="text-align:center;min-height:180px">' +
      '<div class="muted" style="padding:48px 0">Generando la imagen…</div>' +
      '</div><div class="modal-foot">' +
      '<span class="micro grow" id="expMsg" style="text-align:left"></span>' +
      '<button class="btn" data-close>Cerrar</button>' +
      '<button class="btn primary" id="expSave" disabled>Guardar PNG</button></div></div>',

      function (o, done) {
        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });

        const body = o.querySelector('#expBody');
        const msg = o.querySelector('#expMsg');
        const save = o.querySelector('#expSave');

        (async function () {
          const html = H.buildSummary(S, agg, kind);
          const res = await window.hq.exportImage(html, nombre);

          if (!res.ok) {
            body.innerHTML = '<div class="empty"><strong>No se pudo generar</strong>' +
              H.esc(res.error || 'error desconocido') + '</div>';
            return;
          }

          body.innerHTML = '<img src="' + res.dataUrl + '" alt="Resumen" ' +
            'style="max-width:100%;border:1px solid var(--border);border-radius:6px">';
          // Copiar al portapapeles es la acción que de verdad usa: pegarlo
          // directamente en el chat del grupo sin pasar por un archivo.
          msg.innerHTML = '<span class="pos" style="font-weight:600">✓ Copiado al portapapeles</span>' +
            ' — pégalo directamente en el chat';
          save.disabled = false;

          save.addEventListener('click', async function () {
            const r = await window.hq.exportSave(res.png, nombre);
            if (r.ok) msg.innerHTML = '<span class="pos" style="font-weight:600">✓ Guardado</span>';
            else if (!r.cancelado) msg.textContent = 'No se pudo guardar: ' + (r.error || '');
          });
        })();
      }
    );
  };

  // --- Ámbito de vida -----------------------------------------------------

  M.area = function (S, areaId) {
    const a = areaId ? S.data.areas.find(function (x) { return x.id === areaId; }) : null;
    const color = a ? a.color : H.PALETTE[S.data.areas.length % H.PALETTE.length];

    const muestras = H.PALETTE.map(function (c) {
      return '<button class="chip" data-color="' + c + '" style="width:26px;height:26px;' +
        'padding:0;background:' + c + ';border-color:' + (c === color ? 'var(--ink)' : 'transparent') +
        ';border-width:2px"></button>';
    }).join('');

    open(
      '<div class="modal"><div class="modal-head"><h2>' +
      (a ? 'Editar ámbito' : 'Nuevo ámbito') + '</h2>' +
      '<button class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body">' +
      '<label class="field" style="margin-bottom:14px"><span>Nombre</span>' +
      '<input type="text" id="arName" value="' + H.esc(a ? a.name : '') +
      '" placeholder="Salud"></label>' +
      '<div class="eyebrow" style="margin-bottom:7px">Color</div>' +
      '<div class="row tight" id="arColors" style="flex-wrap:wrap">' + muestras + '</div>' +
      '<input type="hidden" id="arColor" value="' + color + '">' +
      '</div><div class="modal-foot">' +
      '<button class="btn" data-close>Cancelar</button>' +
      '<button class="btn primary" id="arSave">Guardar</button></div></div>',

      function (o, done) {
        const name = o.querySelector('#arName');
        const hidden = o.querySelector('#arColor');

        o.querySelector('#arColors').addEventListener('click', function (e) {
          const b = e.target.closest('[data-color]');
          if (!b) return;
          hidden.value = b.dataset.color;
          o.querySelectorAll('#arColors [data-color]').forEach(function (x) {
            x.style.borderColor = x.dataset.color === hidden.value ? 'var(--ink)' : 'transparent';
          });
        });

        o.querySelector('#arSave').addEventListener('click', async function () {
          const v = name.value.trim();
          if (!v) {
            name.style.borderColor = 'var(--neg)';
            return;
          }
          if (a) {
            await S.mutate('area:update', { id: a.id, name: v, color: hidden.value });
          } else {
            await S.mutate('area:add', { name: v, color: hidden.value });
            const nuevo = S.data.areas[S.data.areas.length - 1];
            if (nuevo) {
              S.ui.areaId = nuevo.id;
              S.render();
            }
          }
          done();
        });

        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });

        name.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') o.querySelector('#arSave').click();
        });
        name.focus();
      }
    );
  };

  // --- Apartado del bloc ---------------------------------------------------

  /* ambito: id del spot al que pertenece el apartado, o null para General.
     Solo se usa al crear — un apartado no cambia de ámbito, porque llevárselo
     a otro spot dejaría huérfanas las notas que lo usaban. */
  M.notaTipo = function (S, tipoId, ambito) {
    const tipos = S.data.noteTypes || [];
    const t = tipoId ? tipos.find(function (x) { return x.id === tipoId; }) : null;
    const spotId = t ? (t.spotId || null) : (ambito || null);
    const hermanos = tipos.filter(function (x) { return (x.spotId || null) === spotId; });
    const color = t ? t.color : H.PALETTE[hermanos.length % H.PALETTE.length];
    const dentro = t
      ? S.data.reviews.filter(function (r) { return r.typeId === t.id; }).length
      : 0;
    const donde = spotId ? H.spotName(S.data, spotId) : 'General';

    const muestras = H.PALETTE.map(function (c) {
      return '<button class="chip" data-color="' + c + '" style="width:26px;height:26px;' +
        'padding:0;background:' + c + ';border-color:' + (c === color ? 'var(--ink)' : 'transparent') +
        ';border-width:2px"></button>';
    }).join('');

    open(
      '<div class="modal"><div class="modal-head"><h2>' +
      (t ? 'Editar apartado' : 'Nuevo apartado') + '</h2>' +
      '<button class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body">' +
      // Decir en qué ámbito se crea, y decirlo antes de escribir el nombre:
      // un apartado nace dentro de un spot y no se ve desde ningún otro.
      '<div class="micro" style="margin-bottom:12px">En <strong>' +
      H.esc(donde || 'General') + '</strong>. Los apartados no se comparten ' +
      'entre ámbitos.</div>' +
      '<label class="field" style="margin-bottom:14px"><span>Nombre</span>' +
      '<input type="text" id="ntName" value="' + H.esc(t ? t.name : '') +
      '" placeholder="Estudio de HUDs"></label>' +
      '<div class="eyebrow" style="margin-bottom:7px">Color</div>' +
      '<div class="row tight" id="ntColors" style="flex-wrap:wrap">' + muestras + '</div>' +
      '<input type="hidden" id="ntColorVal" value="' + color + '">' +
      '<div class="micro" id="ntErr" style="margin-top:10px;color:var(--neg)"></div>' +
      '</div><div class="modal-foot">' +
      (t
        ? '<button class="btn danger" id="ntDel" style="margin-right:auto">Eliminar</button>'
        : '') +
      '<button class="btn" data-close>Cancelar</button>' +
      '<button class="btn primary" id="ntSave">Guardar</button></div></div>',

      function (o, done) {
        const name = o.querySelector('#ntName');
        const hidden = o.querySelector('#ntColorVal');
        const err = o.querySelector('#ntErr');

        o.querySelector('#ntColors').addEventListener('click', function (e) {
          const b = e.target.closest('[data-color]');
          if (!b) return;
          hidden.value = b.dataset.color;
          o.querySelectorAll('#ntColors [data-color]').forEach(function (x) {
            x.style.borderColor = x.dataset.color === hidden.value ? 'var(--ink)' : 'transparent';
          });
        });

        o.querySelector('#ntSave').addEventListener('click', async function () {
          const v = name.value.trim();
          if (!v) {
            name.style.borderColor = 'var(--neg)';
            return;
          }
          const res = t
            ? await S.mutate('noteType:update', { id: t.id, name: v, color: hidden.value })
            : await S.mutate('noteType:add', { name: v, color: hidden.value, spotId: spotId });
          if (res && !res.ok) {
            err.textContent = res.error || 'No se pudo guardar';
            return;
          }
          if (!t) {
            const nuevo = S.data.noteTypes[S.data.noteTypes.length - 1];
            if (nuevo) S.ui.blocTipo = nuevo.id;
          }
          done();
          S.render();
        });

        const del = o.querySelector('#ntDel');
        if (del) {
          del.addEventListener('click', function () {
            done();
            /* Borrar el apartado NO borra sus notas: pasan a "sin clasificar".
               Un clic que se lleva por delante treinta resúmenes de clase es
               un clic que no debería existir. */
            M.confirm(
              '¿Eliminar el apartado "' + t.name + '"?',
              dentro
                ? H.plural(dentro, 'nota') + ' de este apartado ' +
                  (dentro === 1 ? 'pasa' : 'pasan') +
                  ' a "Sin clasificar". No se borra ninguna.'
                : 'Está vacío, no se pierde nada.',
              async function () {
                await S.mutate('noteType:remove', { id: t.id });
                if (S.ui.blocTipo === t.id) S.ui.blocTipo = null;
                S.render();
              }
            );
          });
        }

        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });

        name.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') o.querySelector('#ntSave').click();
        });
        name.focus();
        name.select();
      }
    );
  };

  /* Una tarjeta del papel.

     La pregunta nace VACÍA aunque haya texto seleccionado, y eso es a
     propósito. Rellenarla con el trozo marcado sería reproducir el error que
     esto viene a arreglar: un título que no se puede contestar. En Hoy solo se
     ve la pregunta e intentas recordar la respuesta, así que si la pregunta no
     es una pregunta, el repaso deja de ser repaso y pasa a ser releer. */
  M.tarjeta = function (S, papel, tarjeta, seleccion) {
    const nueva = !tarjeta;

    open(
      '<div class="modal wide"><div class="modal-head"><h2>' +
      (nueva ? 'Sacar tarjeta' : 'Editar tarjeta') + '</h2>' +
      '<button class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body">' +
      '<div class="micro" style="margin-bottom:14px">De «' + H.esc(papel.title) + '».' +
      (nueva ? ' Se queda en este papel, aparte de la teoría.' : '') + '</div>' +

      '<label class="field" style="margin-bottom:12px"><span>La pregunta</span>' +
      '<input type="text" id="tjPregunta" value="' + H.esc(tarjeta ? tarjeta.pregunta : '') +
      '" placeholder="¿Qué hace git reflog que no hace git log?"></label>' +
      '<div class="micro" style="margin:-6px 0 14px">' +
      'Esto es lo único que verás en Hoy. Si no es una pregunta que puedas ' +
      'contestar de memoria, no es una tarjeta.</div>' +

      '<label class="field"><span>La respuesta</span>' +
      '<textarea id="tjRespuesta" rows="6">' +
      H.esc(tarjeta ? tarjeta.respuesta : (seleccion || '')) + '</textarea></label>' +
      '<div class="micro" style="margin-top:6px" id="tjCuenta"></div>' +
      '<div class="micro" id="tjErr" style="margin-top:8px;color:var(--neg)"></div>' +
      '</div><div class="modal-foot">' +
      '<button class="btn" data-close>Cancelar</button>' +
      '<button class="btn primary" id="tjGuardar">' +
      (nueva ? 'Crear tarjeta' : 'Guardar') + '</button></div></div>',

      function (o, done) {
        const pregunta = o.querySelector('#tjPregunta');
        const respuesta = o.querySelector('#tjRespuesta');
        const cuenta = o.querySelector('#tjCuenta');
        const err = o.querySelector('#tjErr');

        // El contador en vivo: el aviso barato de que la respuesta se está
        // volviendo otro documento en vez de una tarjeta.
        function contar() {
          const n = H.notas.palabras(respuesta.value);
          const largo = n > H.notas.PALABRAS_MAX_TARJETA;
          cuenta.textContent = n + ' palabras' +
            (largo ? ' — demasiado para una tarjeta. Pártela en varias.' : '');
          cuenta.style.color = largo ? 'var(--warn)' : 'var(--ink-3)';
        }
        respuesta.addEventListener('input', contar);
        contar();

        o.querySelector('#tjGuardar').addEventListener('click', async function () {
          if (!pregunta.value.trim()) {
            pregunta.style.borderColor = 'var(--neg)';
            pregunta.focus();
            return;
          }
          const res = nueva
            ? await S.mutate('card:add', {
                notaId: papel.id, pregunta: pregunta.value, respuesta: respuesta.value })
            : await S.mutate('card:update', {
                notaId: papel.id, id: tarjeta.id,
                pregunta: pregunta.value, respuesta: respuesta.value });
          if (res && !res.ok) { err.textContent = res.error || 'No se pudo guardar'; return; }
          done();
          S.pausarRender = false;
          S.render();
        });

        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });
        pregunta.focus();
      }
    );
  };

  /* Renombrar una imagen. El nombre importa más de lo que parece: es por lo
     que se enlaza desde el texto con [[nombre]], así que cambiarlo deja
     colgados los enlaces que ya hubiera escritos. Se avisa. */
  /* Un [[enlace]] que no encuentra su imagen.

     Casi siempre la imagen SI esta en el papel y lo que no cuadra es el
     nombre: pegas una captura, se guarda como "captura", y escribes
     [[imagen]]. Antes esto era un aviso y un callejon sin salida — la imagen
     entera al lado, y la app diciendo que no existe. Aqui se ensena lo que hay
     y se arregla de un clic, sin tocar el texto. */
  M.enlaceRoto = function (S, papel, nombre) {
    const imgs = papel.imagenes || [];

    const lista = imgs.length
      ? imgs.map(function (im) {
          return (
            '<div class="row" style="gap:10px;align-items:center;padding:6px 0;' +
            'border-top:1px solid var(--border-hair)">' +
            '<img class="enlace-roto-mini" data-mini="' + im.id + '" alt="">' +
            '<div class="grow">' + H.esc(im.nombre) + '</div>' +
            '<button class="btn sm" data-usar="' + im.id + '">Es esta</button></div>'
          );
        }).join('')
      : '<div class="micro" style="margin-top:10px">Este papel no tiene ninguna ' +
        'imagen todavia. Pega una captura con Ctrl+V o pulsa A' + String.fromCharCode(241) +
        'adir en el panel de la derecha: el enlace se escribe solo.</div>';

    open(
      '<div class="modal"><div class="modal-head">' +
      '<h2>El enlace no encuentra su imagen</h2>' +
      '<button class="icon-btn" data-close>' + String.fromCharCode(215) + '</button></div>' +
      '<div class="modal-body">' +
      '<div class="micro">El texto dice <code>[[' + H.esc(nombre) + ']]</code> y ' +
      'ninguna imagen de este papel se llama asi. ' +
      (imgs.length ? 'Si es una de estas, dilo y le pongo ese nombre:' : '') +
      '</div>' +
      lista +
      '<div class="micro" id="erErr" style="margin-top:10px;color:var(--neg)"></div>' +
      '</div><div class="modal-foot">' +
      '<button class="btn danger" id="erQuitar" style="margin-right:auto">' +
      'Quitar el enlace</button>' +
      '<button class="btn" data-close>Cerrar</button></div></div>',

      function (o, done) {
        const err = o.querySelector('#erErr');

        /* Las miniaturas se piden despues de abrir: el modal tiene que estar en
           pantalla ya, aunque los archivos tarden en leerse del disco. */
        imgs.forEach(async function (im) {
          const res = await window.hq.imagen.leer(papel.id, im.id);
          if (!res || !res.ok) return;
          const n = o.querySelector('[data-mini="' + im.id + '"]');
          if (n) n.src = res.dataUrl;
        });

        o.addEventListener('click', async function (e) {
          const b = e.target.closest('[data-usar]');
          if (!b) return;
          const res = await S.mutate('image:rename', {
            notaId: papel.id, id: b.getAttribute('data-usar'), nombre: nombre });
          if (res && !res.ok) { err.textContent = res.error || 'No se pudo'; return; }
          done();
          S.ui.imgVer = b.getAttribute('data-usar');
          S.pausarRender = false;
          S.render();
        });

        o.querySelector('#erQuitar').addEventListener('click', async function () {
          // Se quita del texto la marca entera, no solo su nombre.
          const limpio = String(papel.text || '')
            .split('[[' + nombre + ']]').join('')
            .replace(/[ ]{2,}/g, ' ');
          await S.mutate('review:update', { id: papel.id, text: limpio });
          done();
          S.pausarRender = false;
          S.ui.papelDraft = null;
          S.render();
        });

        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });
      }
    );
  };

  M.renombrarImagen = function (S, papel, imagen) {
    const citada = H.notas.imagenesCitadas(papel.text)
      .some(function (n) { return n.toLowerCase() === imagen.nombre.toLowerCase(); });

    open(
      '<div class="modal"><div class="modal-head"><h2>Renombrar imagen</h2>' +
      '<button class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body">' +
      '<label class="field"><span>Nombre</span>' +
      '<input type="text" id="imNombre" value="' + H.esc(imagen.nombre) +
      '" placeholder="esquema de la sesión"></label>' +
      '<div class="micro" style="margin-top:8px">' +
      'Es por lo que se enlaza desde la teoría: <code>[[' + H.esc(imagen.nombre) +
      ']]</code>.' +
      (citada
        ? ' <strong>Ya la enlazas en este papel</strong>, así que al cambiarle el ' +
          'nombre tendrás que cambiar también el enlace.'
        : '') +
      '</div>' +
      '<div class="micro" id="imErr" style="margin-top:10px;color:var(--neg)"></div>' +
      '</div><div class="modal-foot">' +
      '<button class="btn" data-close>Cancelar</button>' +
      '<button class="btn primary" id="imGuardar">Guardar</button></div></div>',

      function (o, done) {
        const campo = o.querySelector('#imNombre');
        const err = o.querySelector('#imErr');

        o.querySelector('#imGuardar').addEventListener('click', async function () {
          if (!campo.value.trim()) { campo.style.borderColor = 'var(--neg)'; return; }
          const res = await S.mutate('image:rename', {
            notaId: papel.id, id: imagen.id, nombre: campo.value });
          if (res && !res.ok) { err.textContent = res.error || 'No se pudo guardar'; return; }
          done();
          S.pausarRender = false;
          S.render();
        });

        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });
        campo.focus();
        campo.select();
      }
    );
  };

  // --- Terminar sesión ----------------------------------------------------

  M.finishSession = function (S) {
    const s = S.session;
    if (!s) return;
    const mins = s.countedSec / 60;
    const rate = s.checkinsAsked
      ? Math.round((s.checkinsConfirmed / s.checkinsAsked) * 100)
      : null;
    const spotSesion = H.spotName(S.data, s.spotId);

    open(
      '<div class="modal"><div class="modal-head"><h2>Terminar sesión</h2></div>' +
      '<div class="modal-body">' +
      '<div class="grid g2" style="margin-bottom:14px">' +
      '<div class="stat"><div class="stat-label">Tiempo certificado</div>' +
      '<div class="stat-value">' + H.hm(mins - (s.unverifiedSec || 0) / 60) + '</div>' +
      (s.unverifiedSec > 0
        ? '<div class="stat-sub">de ' + H.hm(mins) + ' totales</div>'
        : '<div class="stat-sub">todo verificado</div>') +
      '</div>' +
      '<div class="stat"><div class="stat-label">Verificaciones</div>' +
      '<div class="stat-value' + (s.unverifiedSec > 0 ? '' : ' pos') + '">' +
      (rate === null ? '—' : rate + '%') + '</div>' +
      '<div class="stat-sub">' + s.checkinsConfirmed + ' de ' + s.checkinsAsked +
      (s.unverifiedSec > 0
        ? ' · <span style="color:var(--warn)">' + H.hm(s.unverifiedSec / 60) + ' en duda</span>'
        : '') +
      '</div></div>' +
      '</div>' +
      '<label class="field"><span>Nota (opcional)</span>' +
      '<input type="text" id="fNote" placeholder="Qué trabajaste, qué quedó pendiente"></label>' +

      /* Capturar el concepto AQUÍ y no después es lo que hace que esto
         funcione: acabas de estudiarlo, lo tienes fresco y sabes formularlo.
         Mañana ya no te acuerdas ni de qué querías recordar. */
      (spotSesion
        ? '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">' +
          '<div class="eyebrow" style="margin-bottom:6px">Un papel nuevo</div>' +
          '<label class="field"><span>¿Qué concreto quieres no olvidar de ' +
          H.esc(spotSesion) + '?</span>' +
          '<input type="text" id="fRepaso" ' +
          'placeholder="Contra un reg tight el check-raise en board pareado no funciona"></label>' +
          // La carpeta se elige AQUÍ o no se elige nunca: un papel que nace
          // suelto se queda suelto para siempre. Y solo las de ESTE tema, o
          // nacería ya mezclado.
          '<label class="field" style="margin-top:8px"><span>Carpeta</span>' +
          '<select id="fRepasoTipo"><option value="">Sin clasificar</option>' +
          (S.data.noteTypes || [])
            .filter(function (t) { return (t.spotId || null) === (s.spotId || null); })
            .map(function (t) {
              return '<option value="' + t.id + '">' + H.esc(t.name) + '</option>';
            }).join('') +
          '</select></label>' +
          '<div class="micro" style="margin-top:6px">' +
          'Opcional. Se crea un papel con ese título en este tema; la teoría y sus ' +
          'tarjetas las escribes luego, en Estudio. Este es el momento bueno para ' +
          'apuntarlo: acabas de estudiarlo y sabes formularlo.</div>' +
          '</div>'
        : '') +

      '</div><div class="modal-foot">' +
      '<button class="btn danger" id="fDiscard">Descartar</button>' +
      '<button class="btn" data-close>Seguir</button>' +
      '<button class="btn primary" id="fSave">Guardar</button></div></div>',

      function (o, done) {
        const note = o.querySelector('#fNote');

        o.querySelector('#fSave').addEventListener('click', async function () {
          // El concepto se crea ANTES de cerrar la sesión: si algo fallara al
          // guardar la sesión, no quedaría un concepto huérfano de un spot.
          const campoRepaso = o.querySelector('#fRepaso');
          const campoTipo = o.querySelector('#fRepasoTipo');
          if (campoRepaso && campoRepaso.value.trim()) {
            await S.mutate('review:add', {
              spotId: s.spotId,
              title: campoRepaso.value,
              text: '',
              typeId: campoTipo ? campoTipo.value || null : null
            });
          }
          await window.hq.session.finish(note.value);
          done();
        });

        o.querySelector('#fDiscard').addEventListener('click', function () {
          done();
          M.confirm(
            'Descartar la sesión?',
            'Se pierden ' + H.hm(mins) + ' de tiempo registrado. No se puede deshacer.',
            function () {
              window.hq.session.discard();
            }
          );
        });

        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });
        note.focus();
      }
    );
  };

  // --- Registro manual ----------------------------------------------------

  M.manualSession = function (S) {
    const d = S.data;
    const actOpts = H.timedActs(d)
      .map(function (a) {
        return '<option value="' + a.id + '">' + H.esc(a.name) + '</option>';
      })
      .join('');
    const spotOpts = d.spots
      .filter(function (s) {
        return !s.archived;
      })
      .map(function (s) {
        return '<option value="' + s.id + '">' + H.esc(s.name) + '</option>';
      })
      .join('');

    open(
      '<div class="modal"><div class="modal-head"><h2>Registrar tiempo a mano</h2>' +
      '<button class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body">' +
      '<div class="row tight" style="margin-bottom:4px">' +
      '<label class="field grow"><span>Fecha</span>' +
      '<input type="date" id="mDate" value="' + H.dateKey() + '"></label>' +
      M.duracionHTML('mMins', 60) + '</div>' +
      '<div class="micro" id="mMinsHint" style="margin-bottom:12px"></div>' +
      '<div class="row tight" style="margin-bottom:12px">' +
      '<label class="field grow"><span>Actividad</span><select id="mAct">' + actOpts + '</select></label>' +
      '<label class="field grow"><span>Spot</span>' +
      '<select id="mSpot"><option value="">Ninguno</option>' + spotOpts + '</select></label></div>' +
      '<label class="field"><span>Nota</span>' +
      '<input type="text" id="mNote" placeholder="Opcional"></label>' +
      '<div class="micro" style="margin-top:10px">' +
      'Queda marcado como manual: no tiene verificaciones, así que en el dashboard ' +
      'se distingue del tiempo que si fue certificado.</div>' +
      '</div><div class="modal-foot">' +
      '<button class="btn" data-close>Cancelar</button>' +
      '<button class="btn primary" id="mSave">Guardar</button></div></div>',

      function (o, done) {
        const duracion = M.duracionBind(o, 'mMins', 'mMinsHint');

        o.querySelector('#mSave').addEventListener('click', async function () {
          const mins = duracion();
          if (mins === null) {
            o.querySelector('#mMins').focus();
            return;
          }
          await S.mutate('session:addManual', {
            date: o.querySelector('#mDate').value,
            mins: mins,
            activityId: o.querySelector('#mAct').value,
            spotId: o.querySelector('#mSpot').value || null,
            note: o.querySelector('#mNote').value
          });
          done();
        });
        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });
      }
    );
  };

  // --- Ajustes ------------------------------------------------------------

  /* Las copias de seguridad, y volver a una.

     Existe para que restaurar no sea nunca mas copiar archivos a mano por el
     Explorador: esa maniobra ya ha sustituido dos veces los datos buenos por
     una copia vieja sin que nadie se enterara. Aqui se ve que lleva cada una
     antes de tocar nada, y la actual se guarda antes de pisarla. */
  M.respaldos = function (S) {
    const cuando = function (iso) {
      if (!iso) return '';
      const d = new Date(iso);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString().slice(0, 5);
    };
    // El sello del nombre es hora local: 2026-09-11-14-05-00.
    const delNombre = function (f) {
      const m = String(f).match(/(\d{4})-(\d{2})-(\d{2})-(\d{2})-(\d{2})/);
      return m ? m[3] + '/' + m[2] + ' ' + m[4] + ':' + m[5] : f;
    };
    const kb = function (n) { return Math.round((n || 0) / 1024) + ' KB'; };

    open(
      '<div class="modal wide"><div class="modal-head">' +
      '<div><h2>Copias de seguridad</h2>' +
      '<div class="micro" id="reSub">Buscando copias\u2026</div></div>' +
      '<button class="icon-btn" data-close>' + String.fromCharCode(215) + '</button></div>' +
      '<div class="modal-body">' +
      '<div id="reLista"><div class="micro">Un momento\u2026</div></div>' +

      '<div class="eyebrow" style="margin:20px 0 6px">Copia completa fuera de este disco</div>' +
      '<div class="micro" style="margin-bottom:10px">' +
      'Las copias de arriba viven en la misma carpeta que tus datos: te salvan ' +
      'de un borrado dentro de la app, no de que se pierda el disco. Y solo ' +
      'llevan el texto. Una copia completa se lleva tambien las imagenes, a ' +
      'donde tu digas \u2014 un USB, Drive, otro disco \u2014 y se repite sola una vez al dia.' +
      '</div>' +
      '<div class="micro" id="reCarpeta" style="margin-bottom:10px"></div>' +
      '<div class="row tight">' +
      '<button class="btn" id="reElegir">Elegir carpeta</button>' +
      '<button class="btn primary" id="reAhora">Copiar ahora</button>' +
      '</div>' +
      '<div class="micro" id="reErr" style="margin-top:10px;color:var(--neg)"></div>' +
      '</div><div class="modal-foot">' +
      '<button class="btn" data-close>Cerrar</button></div></div>',

      function (o, done) {
        const err = o.querySelector('#reErr');

        function pintarCarpeta() {
          const c = S.data.settings.carpetaRespaldo;
          const ult = S.data.settings.ultimaCopiaExterna;
          o.querySelector('#reCarpeta').innerHTML = c
            ? 'En <span style="color:var(--ink-2)">' + H.esc(c) + '</span>' +
              (ult ? ' \u00b7 ultima copia el ' + H.esc(cuando(ult)) : ' \u00b7 todavia sin copiar')
            : '<strong>Sin carpeta elegida.</strong> Ahora mismo no hay ninguna ' +
              'copia fuera de este disco.';
        }

        async function pintarLista() {
          const res = await window.hq.respaldo.listar();
          const copias = (res && res.copias) || [];
          o.querySelector('#reSub').textContent = copias.length
            ? copias.length + ' copias, de la mas nueva a la mas vieja'
            : 'Todavia no hay ninguna copia';

          o.querySelector('#reLista').innerHTML = copias.length
            ? copias.map(function (c, i) {
                return (
                  '<div class="list-row" style="padding-left:0;padding-right:0">' +
                  '<div class="grow"><strong>' + H.esc(delNombre(c.archivo)) + '</strong>' +
                  (i === 0 ? ' <span class="tag">la mas nueva</span>' : '') +
                  '<div class="micro">' +
                  (c.papeles === null ? 'ilegible' : H.plural(c.papeles, 'papel', 'papeles')) +
                  (c.imagenes ? ' \u00b7 ' + H.plural(c.imagenes, 'imagen', 'imagenes') : '') +
                  ' \u00b7 ' + kb(c.bytes) +
                  (c.guardado ? ' \u00b7 guardado el ' + H.esc(cuando(c.guardado)) : '') +
                  '</div></div>' +
                  '<button class="btn sm" data-restaurar="' + H.esc(c.ruta) + '">Restaurar</button>' +
                  '</div>'
                );
              }).join('')
            : '<div class="micro">Flow hace una copia al abrirse, cuando hay ' +
              'algo nuevo que copiar.</div>';
        }

        o.querySelector('#reLista').addEventListener('click', function (e) {
          const b = e.target.closest('[data-restaurar]');
          if (!b) return;
          const ruta = b.getAttribute('data-restaurar');
          done();
          M.confirm(
            'Restaurar esta copia',
            'Lo que tienes ahora se sustituye por lo que hubiera en la copia. ' +
            'Antes de pisarlo se guarda una copia de lo actual, asi que se ' +
            'puede deshacer volviendo a la mas nueva.',
            async function () {
              const res = await window.hq.respaldo.restaurar(ruta);
              if (!res || !res.ok) {
                M.alert('No se pudo restaurar', (res && res.error) || '');
                return;
              }
              S.ui.retrocesoOculto = true;
              S.ui.estPapel = null;
              S.ui.papelDraft = null;
              S.pausarRender = false;
              S.render();
              M.alert('Restaurada', 'Tus datos son los de esa copia.');
            }
          );
        });

        o.querySelector('#reElegir').addEventListener('click', async function () {
          const res = await window.hq.respaldo.elegirCarpeta();
          if (!res || res.cancelado) return;
          if (!res.ok) { err.textContent = res.error || 'No se pudo'; return; }
          pintarCarpeta();
          pintarLista();
        });

        o.querySelector('#reAhora').addEventListener('click', async function () {
          err.textContent = '';
          const res = await window.hq.respaldo.ahora();
          if (!res || !res.ok) {
            err.textContent = (res && res.error) || 'Elige antes una carpeta';
            return;
          }
          pintarCarpeta();
          M.alert('Copia hecha',
            'En ' + res.carpeta + ', con ' + H.plural(res.imagenes, 'imagen', 'imagenes') + '.');
        });

        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });

        pintarCarpeta();
        pintarLista();
      }
    );
  };

  M.settings = function (S) {
    const st = S.data.settings;

    open(
      '<div class="modal"><div class="modal-head"><h2>Ajustes</h2>' +
      '<button class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body">' +

      '<div class="eyebrow" style="margin-bottom:8px">Tema</div>' +
      '<div class="row tight" id="sTheme" style="margin-bottom:6px">' +
      [['system', 'Del sistema'], ['light', 'Claro'], ['dark', 'Oscuro']]
        .map(function (t) {
          return '<button class="chip' + (st.theme === t[0] ? ' on' : '') +
            '" data-theme="' + t[0] + '">' + t[1] + '</button>';
        }).join('') +
      '</div>' +
      '<div class="micro" style="margin-bottom:18px">' +
      'Se aplica al instante, también en el widget. "Del sistema" sigue a Windows.</div>' +

      '<div class="eyebrow" style="margin-bottom:8px">Verificaciones</div>' +
      '<div class="row tight" style="margin-bottom:6px">' +
      '<label class="field grow"><span>Mínimo (min)</span>' +
      '<input type="number" id="sMin" value="' + st.checkinMinMin + '" min="1"></label>' +
      '<label class="field grow"><span>Máximo (min)</span>' +
      '<input type="number" id="sMax" value="' + st.checkinMaxMin + '" min="1"></label>' +
      '<label class="field grow"><span>Gracia (seg)</span>' +
      '<input type="number" id="sGrace" value="' + st.checkinGraceSec + '" min="15"></label></div>' +
      '<div class="micro" style="margin-bottom:18px">' +
      'Mientras una sesión corre, el widget te pregunta si sigues en la tarea cada ' +
      'X minutos al azar dentro de ese rango. Si no respondes dentro de la gracia, ' +
      'ese tramo no se cuenta y la sesión se pausa sola.</div>' +

      '<div class="eyebrow" style="margin-bottom:8px">Avisos de los eventos</div>' +
      '<label class="row tight" style="align-items:center;margin-bottom:6px;cursor:pointer">' +
      '<input type="checkbox" id="sArranque"' + (st.arrancarConWindows ? ' checked' : '') + '>' +
      '<span>Abrir Flow al iniciar Windows, minimizado en el widget</span></label>' +
      '<div class="micro" style="margin-bottom:18px">' +
      'Un aviso solo puede saltar con Flow abierto. Sin esto, el día de una ' +
      'entrega el recordatorio depende de que te acuerdes de abrir la app, que ' +
      'es justo lo que el recordatorio venía a resolver. Se registra en Windows ' +
      'desde la app instalada; en desarrollo se guarda pero no se aplica.' +
      '</div>' +

      '<div class="eyebrow" style="margin-bottom:8px">Datos</div>' +
      '<div class="micro" style="margin-bottom:8px">Guardados en:<br>' +
      '<span style="color:var(--ink-2)">' + H.esc(S.dataPath) + '</span></div>' +
      '<div class="row tight" style="margin-bottom:10px">' +
      '<button class="btn" id="sReveal">Abrir carpeta</button>' +
      '<button class="btn" id="sImport">Importar de Poker HQ v1</button></div>' +
      '<div class="row tight" style="margin-bottom:8px">' +
      '<button class="btn primary" id="sCopias">Copias de seguridad</button></div>' +
      '<div class="micro" style="margin-bottom:18px">' +
      (st.carpetaRespaldo
        ? 'Copia completa en <span style="color:var(--ink-2)">' +
          H.esc(st.carpetaRespaldo) + '</span>.'
        : '<strong>No hay ninguna copia fuera de este disco.</strong> Elige una ' +
          'carpeta ahi dentro: es lo unico que te salva si se pierde el disco.') +
      '</div>' +

      '</div><div class="modal-foot">' +
      '<button class="btn" data-close>Cancelar</button>' +
      '<button class="btn primary" id="sSave">Guardar</button></div></div>',

      function (o, done) {
        // El tema se aplica al pulsar, sin esperar a Guardar: elegir un tema
        // a ciegas y confirmarlo después no tiene sentido, se ve o no se ve.
        o.querySelector('#sTheme').addEventListener('click', async function (e) {
          const b = e.target.closest('[data-theme]');
          if (!b) return;
          o.querySelectorAll('#sTheme .chip').forEach(function (c) {
            c.classList.toggle('on', c === b);
          });
          await S.mutate('settings:update', { theme: b.dataset.theme });
        });

        o.querySelector('#sSave').addEventListener('click', async function () {
          const min = parseInt(o.querySelector('#sMin').value, 10) || 10;
          const max = parseInt(o.querySelector('#sMax').value, 10) || 20;
          await S.mutate('settings:update', {
            checkinMinMin: Math.max(1, min),
            checkinMaxMin: Math.max(min, max),
            checkinGraceSec: Math.max(15, parseInt(o.querySelector('#sGrace').value, 10) || 120),
            arrancarConWindows: o.querySelector('#sArranque').checked
          });
          done();
        });

        o.querySelector('#sReveal').addEventListener('click', function () {
          window.hq.revealData();
        });

        o.querySelector('#sCopias').addEventListener('click', function () {
          done();
          M.respaldos(S);
        });

        o.querySelector('#sImport').addEventListener('click', function () {
          done();
          M.importV1(S);
        });

        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });
      }
    );
  };

  // --- Importar del HTML v1 -----------------------------------------------

  M.importV1 = function (S) {
    const snippet =
      'JSON.stringify({activities:JSON.parse(localStorage.pokerHQ_activities||"[]"),' +
      'days:JSON.parse(localStorage.pokerHQ_days_data||"{}")})';

    open(
      '<div class="modal wide"><div class="modal-head"><h2>Importar de Poker HQ v1</h2>' +
      '<button class="icon-btn" data-close>×</button></div>' +
      '<div class="modal-body">' +
      '<div class="micro" style="margin-bottom:12px">' +
      '1. Abre <b>Poker HQ.html</b> en Chrome.<br>' +
      '2. Pulsa F12, ve a la pestana Console.<br>' +
      '3. Pega esto y copia el resultado completo:</div>' +
      '<textarea rows="3" readonly style="font-family:ui-monospace,Menlo,Consolas,monospace;' +
      'font-size:11px;margin-bottom:14px">' + H.esc(snippet) + '</textarea>' +
      '<label class="field"><span>Pega aquí el resultado</span>' +
      '<textarea id="impJson" rows="5" placeholder=\'{"activities":[...],"days":{...}}\'></textarea></label>' +
      '<div id="impMsg" class="micro" style="margin-top:10px"></div>' +
      '</div><div class="modal-foot">' +
      '<button class="btn" data-close>Cancelar</button>' +
      '<button class="btn primary" id="impGo">Importar</button></div></div>',

      function (o, done) {
        o.querySelector('#impGo').addEventListener('click', async function () {
          const msg = o.querySelector('#impMsg');
          const raw = o.querySelector('#impJson').value.trim();
          if (!raw) return;
          const res = await window.hq.importV1(raw);
          if (res.ok) {
            msg.style.color = 'var(--pos)';
            msg.textContent =
              'Listo: ' + res.addedActs + ' actividades y ' + res.addedItems + ' tareas importadas.';
            setTimeout(done, 1400);
          } else {
            msg.style.color = 'var(--neg)';
            msg.textContent = res.error;
          }
        });
        o.querySelectorAll('[data-close]').forEach(function (b) {
          b.addEventListener('click', done);
        });
      }
    );
  };

  H.modals = M;
})(window.H);
