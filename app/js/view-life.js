/* Life: los ámbitos de vida fuera de la mesa.
   Tres capas por ámbito, en este orden a propósito:
     1. Dónde estoy      — el reconocimiento honesto, sin el cual lo demás
                           son buenos propósitos.
     2. Paradigmas       — qué creencia hay que borrar y cuál poner en su
                           lugar. Borrar sin reemplazar deja un hueco.
     3. Estrategias      — la acción concreta, con su fuente y su veredicto.
   El veredicto es lo que separa esto de una libreta de notas: una estrategia
   que llevas seis meses "probando" es una estrategia que no funciona. */
(function (H) {
  'use strict';

  H.views = H.views || {};

  const ESTADOS = {
    probando: { txt: 'Probando', color: 'var(--warn)', bg: 'var(--warn-soft)' },
    funciona: { txt: 'Funciona', color: 'var(--pos)', bg: 'var(--pos-soft)' },
    descartada: { txt: 'Descartada', color: 'var(--ink-3)', bg: 'var(--bg-sunken)' }
  };

  function conteos(d, areaId) {
    const pg = d.paradigms.filter(function (x) { return x.areaId === areaId; });
    const st = d.strategies.filter(function (x) { return x.areaId === areaId; });
    return {
      drop: pg.filter(function (x) { return x.kind === 'drop' && !x.doneAt; }).length,
      build: pg.filter(function (x) { return x.kind === 'build' && !x.doneAt; }).length,
      hechos: pg.filter(function (x) { return x.doneAt; }).length,
      funciona: st.filter(function (x) { return x.status === 'funciona'; }).length,
      probando: st.filter(function (x) { return x.status === 'probando'; }).length,
      total: pg.length + st.length,
      diagnostico: !!(d.life[areaId] && d.life[areaId].diagnosis.trim())
    };
  }

  function listaAreas(S) {
    const d = S.data;
    if (!d.areas.length) {
      return '<div class="empty"><strong>No hay ámbitos</strong>' +
        'Crea el primero para empezar.</div>';
    }

    return d.areas.map(function (a) {
      const c = conteos(d, a.id);
      const activo = S.ui.areaId === a.id;
      const vacio = c.total === 0 && !c.diagnostico;

      return (
        '<div class="list-row" style="cursor:pointer' +
        (activo ? ';background:var(--accent-soft)' : '') + '"' +
        ' data-act="pickArea" data-id="' + a.id + '">' +
        '<span class="dot" style="background:' + a.color + '"></span>' +
        '<div class="grow">' +
        '<div style="font-weight:' + (activo ? '600' : '500') + '">' + H.esc(a.name) + '</div>' +
        // Resumen corto a propósito: tres datos parten la fila en dos líneas
        // y descuadran la columna entera.
        '<div class="micro" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' +
        (vacio
          ? 'sin empezar'
          : [
              c.drop ? c.drop + ' borrar' : null,
              c.build ? c.build + ' implementar' : null
            ].filter(Boolean).join(' · ') || 'todo al día') +
        '</div></div>' +
        (c.probando
          ? '<span class="tag" style="color:var(--warn)">' + c.probando + '</span>'
          : '') +
        '</div>'
      );
    }).join('');
  }

  function bloqueDiagnostico(S, area) {
    const entry = S.data.life[area.id] || { diagnosis: '', updatedAt: null };
    // Si hay un borrador en curso se muestra ese, no lo guardado: un repintado
    // por cualquier motivo (una verificación que salta, por ejemplo) no puede
    // borrarte lo que estabas escribiendo.
    const valor = S.ui.lifeDraft && S.ui.lifeDraft.areaId === area.id
      ? S.ui.lifeDraft.text
      : entry.diagnosis;

    const sucio = S.ui.lifeDraft && S.ui.lifeDraft.areaId === area.id &&
      S.ui.lifeDraft.text !== entry.diagnosis;

    return (
      '<div class="panel"><div class="panel-head">' +
      '<h3>Dónde estoy</h3>' +
      '<span class="micro" id="diagEstado">' +
      (sucio
        ? '<span style="color:var(--warn)">sin guardar</span>'
        : entry.updatedAt
        ? 'actualizado ' + H.shortDate(H.dateKey(entry.updatedAt))
        : '') +
      '</span></div>' +
      '<div class="panel-body">' +
      '<textarea id="diagText" rows="4" placeholder="Sin adornos: qué está fallando ' +
      'ahora mismo en este ámbito y por qué. Esto es para ti, nadie más lo va a leer.">' +
      H.esc(valor) + '</textarea>' +
      '<div class="row tight" style="margin-top:8px;justify-content:flex-end">' +
      '<button class="btn sm" id="diagSave"' + (sucio ? '' : ' disabled') + '>Guardar</button>' +
      '</div></div></div>'
    );
  }

  function columnaParadigmas(S, area, kind) {
    const d = S.data;
    const items = d.paradigms.filter(function (x) {
      return x.areaId === area.id && x.kind === kind;
    });
    const borrar = kind === 'drop';
    const color = borrar ? 'var(--neg)' : 'var(--pos)';

    const filas = items.length
      ? items.map(function (p) {
          const hecho = !!p.doneAt;
          return (
            '<div class="list-row" style="padding:7px 0;align-items:flex-start">' +
            '<button class="icon-btn" data-act="pgToggle" data-id="' + p.id + '" ' +
            'title="' + (hecho ? 'Marcar como pendiente' : 'Marcar como logrado') + '" ' +
            'style="color:' + (hecho ? 'var(--pos)' : 'var(--ink-4)') + ';margin-top:1px">' +
            (hecho ? '✓' : '○') + '</button>' +
            '<div class="grow" style="font-size:12.5px;line-height:1.45' +
            (hecho ? ';color:var(--ink-4);text-decoration:line-through' : '') + '">' +
            H.esc(p.text) + '</div>' +
            '<button class="icon-btn" data-act="pgDel" data-id="' + p.id + '">×</button>' +
            '</div>'
          );
        }).join('')
      : '<div class="micro" style="padding:10px 0">' +
        (borrar ? 'Nada marcado para borrar.' : 'Nada marcado para implementar.') +
        '</div>';

    return (
      '<div>' +
      '<div class="eyebrow" style="color:' + color + ';margin-bottom:2px">' +
      (borrar ? 'Borrar' : 'Implementar') + '</div>' +
      filas +
      '<div class="row tight" style="margin-top:8px">' +
      '<input type="text" id="pgNew-' + kind + '" class="grow" ' +
      'placeholder="' + (borrar ? '"Descansar es de flojos"' : '"El descanso es parte del trabajo"') + '">' +
      '<button class="btn sm" data-act="pgAdd" data-kind="' + kind + '">+</button>' +
      '</div></div>'
    );
  }

  function bloqueEstrategias(S, area) {
    const d = S.data;
    const items = d.strategies.filter(function (x) { return x.areaId === area.id; });

    // Probando primero: son las que piden una decisión.
    const orden = { probando: 0, funciona: 1, descartada: 2 };
    items.sort(function (a, b) {
      return orden[a.status] - orden[b.status] ||
        (a.createdAt < b.createdAt ? -1 : 1);
    });

    const filas = items.length
      ? items.map(function (s) {
          const e = ESTADOS[s.status] || ESTADOS.probando;
          return (
            '<div class="list-row" style="align-items:flex-start;padding-left:0;padding-right:0">' +
            '<button class="chip" data-act="stCycle" data-id="' + s.id + '" ' +
            'title="Clic para cambiar el estado" ' +
            'style="background:' + e.bg + ';color:' + e.color + ';border-color:transparent;' +
            'min-width:82px;justify-content:center;flex-shrink:0">' + e.txt + '</button>' +
            '<div class="grow">' +
            '<div style="font-size:12.5px;line-height:1.45' +
            (s.status === 'descartada' ? ';color:var(--ink-4)' : '') + '">' +
            H.esc(s.text) + '</div>' +
            (s.source
              ? '<div class="micro" style="margin-top:2px">fuente: ' + H.esc(s.source) + '</div>'
              : '') +
            '</div>' +
            '<button class="icon-btn" data-act="stDel" data-id="' + s.id + '">×</button>' +
            '</div>'
          );
        }).join('')
      : '<div class="empty" style="padding:18px"><strong>Sin estrategias todavía</strong>' +
        'Apunta lo concreto que vas a probar, y de dónde lo sacaste.</div>';

    return (
      '<div class="panel"><div class="panel-head">' +
      '<h3>Estrategias</h3>' +
      '<span class="micro">clic en el estado para cambiarlo</span></div>' +
      '<div class="panel-body flush">' + filas + '</div>' +
      '<div class="panel-body" style="border-top:1px solid var(--border)">' +
      '<div class="row tight">' +
      '<input type="text" id="stNew" class="grow" placeholder="Dormir 8h fijas, sin excepciones">' +
      '<input type="text" id="stSrc" style="width:170px" placeholder="Fuente (opcional)">' +
      '<button class="btn primary" data-act="stAdd">Añadir</button>' +
      '</div></div></div>'
    );
  }

  function detalle(S) {
    const d = S.data;
    const area = d.areas.find(function (a) { return a.id === S.ui.areaId; });
    if (!area) {
      return '<div class="panel"><div class="empty">' +
        '<strong>Elige un ámbito</strong>Selecciona uno de la lista para trabajarlo.</div></div>';
    }

    const c = conteos(d, area.id);

    return (
      '<div class="panel"><div class="panel-head">' +
      '<div class="row center tight">' +
      '<span class="dot" style="background:' + area.color + '"></span>' +
      '<h3>' + H.esc(area.name) + '</h3></div>' +
      '<div class="row tight">' +
      '<button class="btn sm" data-act="areaEdit" data-id="' + area.id + '">Editar</button>' +
      '<button class="btn sm danger" data-act="areaDel" data-id="' + area.id + '">Eliminar</button>' +
      '</div></div>' +
      '<div class="panel-body"><div class="grid g3">' +
      '<div class="stat"><div class="stat-label">Por borrar</div>' +
      '<div class="stat-value' + (c.drop ? ' neg' : '') + '">' + c.drop + '</div>' +
      '<div class="stat-sub">paradigmas activos</div></div>' +
      '<div class="stat"><div class="stat-label">Por implementar</div>' +
      '<div class="stat-value">' + c.build + '</div>' +
      '<div class="stat-sub">' + c.hechos + ' ya logrados</div></div>' +
      '<div class="stat"><div class="stat-label">Funcionando</div>' +
      '<div class="stat-value' + (c.funciona ? ' pos' : '') + '">' + c.funciona + '</div>' +
      '<div class="stat-sub">' + c.probando + ' en prueba</div></div>' +
      '</div></div></div>' +

      bloqueDiagnostico(S, area) +

      '<div class="panel"><div class="panel-head">' +
      '<h3>Paradigmas</h3>' +
      '<span class="micro">qué creencia sale y cuál entra en su lugar</span></div>' +
      '<div class="panel-body"><div class="grid g2">' +
      columnaParadigmas(S, area, 'drop') +
      columnaParadigmas(S, area, 'build') +
      '</div></div></div>' +

      bloqueEstrategias(S, area)
    );
  }

  H.views.life = {
    html: function (S) {
      const d = S.data;
      const totalPg = d.paradigms.filter(function (p) { return !p.doneAt; }).length;
      const funcionando = d.strategies.filter(function (s) { return s.status === 'funciona'; }).length;

      return (
        '<div class="page-head">' +
        '<div><h1>Life</h1>' +
        '<div class="micro" style="margin-top:2px">' +
        H.plural(d.areas.length, 'ámbito') + ' · ' +
        H.plural(totalPg, 'paradigma activo', 'paradigmas activos') + ' · ' +
        H.plural(funcionando, 'estrategia funcionando', 'estrategias funcionando') +
        '</div></div>' +
        '<button class="btn primary" data-act="areaNew">Nuevo ámbito</button>' +
        '</div>' +

        '<div class="row" style="align-items:flex-start">' +
        '<div style="width:290px;flex-shrink:0">' +
        '<div class="panel"><div class="panel-head"><h3>Ámbitos</h3></div>' +
        '<div class="panel-body flush">' + listaAreas(S) + '</div></div></div>' +
        '<div class="grow">' + detalle(S) + '</div>' +
        '</div>'
      );
    },

    bind: function (root, S) {
      const area = S.data.areas.find(function (a) { return a.id === S.ui.areaId; });

      // --- Diagnóstico: borrador vivo -------------------------------------
      const ta = H.el('diagText');
      if (ta && area) {
        const guardar = async function () {
          const txt = ta.value;
          await S.mutate('life:setDiagnosis', { areaId: area.id, text: txt });
          S.ui.lifeDraft = null;
        };

        ta.addEventListener('input', function () {
          // Guardamos cada pulsación en memoria, no en disco: si algo repinta
          // la vista mientras escribes, el texto se restaura intacto.
          S.ui.lifeDraft = { areaId: area.id, text: ta.value };
          const btn = H.el('diagSave');
          const est = H.el('diagEstado');
          const entry = S.data.life[area.id] || { diagnosis: '' };
          const sucio = ta.value !== entry.diagnosis;
          if (btn) btn.disabled = !sucio;
          if (est && sucio) est.innerHTML = '<span style="color:var(--warn)">sin guardar</span>';
        });

        // Salir del campo guarda: nadie debería perder un párrafo por
        // cambiar de pestaña sin pulsar un botón.
        ta.addEventListener('blur', function () {
          const entry = S.data.life[area.id] || { diagnosis: '' };
          if (ta.value !== entry.diagnosis) guardar();
        });

        const btnSave = H.el('diagSave');
        if (btnSave) btnSave.addEventListener('click', guardar);
      }

      // Enter añade en los campos de texto rápidos.
      ['pgNew-drop', 'pgNew-build'].forEach(function (id) {
        const inp = H.el(id);
        if (!inp) return;
        inp.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter') return;
          const kind = id === 'pgNew-drop' ? 'drop' : 'build';
          añadirParadigma(S, area, kind);
        });
      });
      const stNew = H.el('stNew');
      if (stNew) {
        stNew.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') añadirEstrategia(S, area);
        });
      }

      H.delegate(root, function (act, ds) {
        switch (act) {
          case 'pickArea':
            // Cambiar de ámbito con un borrador a medias lo guarda antes.
            if (S.ui.lifeDraft && ta) {
              const entry = S.data.life[S.ui.lifeDraft.areaId] || { diagnosis: '' };
              if (S.ui.lifeDraft.text !== entry.diagnosis) {
                S.mutate('life:setDiagnosis', {
                  areaId: S.ui.lifeDraft.areaId, text: S.ui.lifeDraft.text
                });
              }
            }
            S.ui.lifeDraft = null;
            S.ui.areaId = ds.id;
            S.render();
            break;

          case 'areaNew':
            H.modals.area(S, null);
            break;
          case 'areaEdit':
            H.modals.area(S, ds.id);
            break;
          case 'areaDel': {
            const a = S.data.areas.find(function (x) { return x.id === ds.id; });
            const c = conteos(S.data, ds.id);
            H.modals.confirm(
              'Eliminar "' + (a ? a.name : '') + '"?',
              c.total > 0 || c.diagnostico
                ? 'Se borran también su diagnóstico, ' + c.total +
                  ' anotaciones entre paradigmas y estrategias. No se puede deshacer.'
                : 'El ámbito está vacío, no se pierde nada.',
              function () {
                S.mutate('area:remove', { id: ds.id });
                if (S.ui.areaId === ds.id) S.ui.areaId = null;
              }
            );
            break;
          }

          case 'pgAdd':
            añadirParadigma(S, area, ds.kind);
            break;
          case 'pgToggle':
            S.mutate('paradigm:toggle', { id: ds.id });
            break;
          case 'pgDel':
            S.mutate('paradigm:remove', { id: ds.id });
            break;

          case 'stAdd':
            añadirEstrategia(S, area);
            break;
          case 'stCycle': {
            const st = S.data.strategies.find(function (x) { return x.id === ds.id; });
            if (!st) break;
            const ciclo = { probando: 'funciona', funciona: 'descartada', descartada: 'probando' };
            S.mutate('strategy:setStatus', { id: ds.id, status: ciclo[st.status] });
            break;
          }
          case 'stDel':
            S.mutate('strategy:remove', { id: ds.id });
            break;
        }
      });
    }
  };

  function añadirParadigma(S, area, kind) {
    if (!area) return;
    const inp = H.el('pgNew-' + kind);
    if (!inp || !inp.value.trim()) return;
    S.mutate('paradigm:add', { areaId: area.id, kind: kind, text: inp.value });
  }

  function añadirEstrategia(S, area) {
    if (!area) return;
    const inp = H.el('stNew');
    const src = H.el('stSrc');
    if (!inp || !inp.value.trim()) return;
    S.mutate('strategy:add', {
      areaId: area.id, text: inp.value, source: src ? src.value : ''
    });
  }
})(window.H);
