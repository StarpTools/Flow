/* Estudio — la oficina.

   Se recorre en este orden, y cada nivel es una pantalla:

     estante   desplegable en la cabecera (Programación, Diseño…)
     tema      "Git y control de versiones"        ← el cajón
     carpeta   "Comandos", "Ramas y merge"         ← dentro del cajón
     papel     la nota: teoría, imágenes, tarjetas ← lo que vienes a leer

   Por qué de uno en uno y no todo a la vez: enseñar los cuatro niveles en la
   misma pantalla obliga a leerlos todos para encontrar uno. La barra de migas
   de arriba dice dónde estás y deja volver a cualquier nivel de un clic.

   El estante es la excepción: es un desplegable, no una pantalla. Con dos o
   tres estantes, entrar y salir de ellos son dos clics de peaje en cada viaje.

   Por qué el editor congela el repintado: la app repinta entera cada vez que
   llegan datos, y el editor se guarda solo mientras escribes. Sin el freno de
   S.pausarRender, cada autoguardado reconstruiría el <textarea> y el cursor
   saltaría al principio a media frase. */
(function (H) {
  'use strict';

  H.views = H.views || {};
  const E = {};
  H.estudio = E;

  // Sin acentos y en minúsculas: buscar "sesion" tiene que encontrar "sesión".
  function normaliza(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
  }

  function cuando(iso) {
    if (!iso) return '';
    const key = String(iso).slice(0, 10);
    const hoy = H.dateKey();
    if (key === hoy) return 'hoy';
    if (key === H.repaso.sumarDias(hoy, -1)) return 'ayer';
    return H.shortDate(key);
  }

  // --- Qué hay en cada nivel -------------------------------------------------

  E.estante = function (S) {
    const g = (S.data.spotGroups || []).find(function (x) { return x.id === S.ui.estGrupo; });
    return g || (S.data.spotGroups || [])[0] || null;
  };

  function temasDe(S) {
    const g = E.estante(S);
    return S.data.spots.filter(function (s) {
      return !s.archived && (s.groupId || null) === (g ? g.id : null);
    });
  }

  function temaAbierto(S) {
    return S.data.spots.find(function (s) { return s.id === S.ui.spotId; }) || null;
  }

  function carpetasDe(S, temaId) {
    return (S.data.noteTypes || []).filter(function (t) { return t.spotId === temaId; });
  }

  function papelesDe(S, temaId, carpetaId) {
    return S.data.reviews.filter(function (r) {
      if (r.spotId !== temaId) return false;
      return carpetaId === 'sin' ? !r.typeId : r.typeId === carpetaId;
    });
  }

  function papelAbierto(S) {
    return S.data.reviews.find(function (r) { return r.id === S.ui.estPapel; }) || null;
  }

  /* Papeles sueltos: los que se quedaron sin tema.

     Borrar un tema no se lleva sus papeles por delante — los deja sin tema, a
     propósito, porque dentro puede haber meses de apuntes. Pero la oficina se
     recorre entrando por un tema, así que sin una pantalla que los recoja
     serían invisibles: siguen en el archivo y no hay forma de llegar a ellos.
     Es exactamente lo que le pasó a unos apuntes de git al reorganizar. */

  function papelesSueltos(S) {
    return S.data.reviews.filter(function (r) { return !r.spotId; });
  }

  function carpetasSueltas(S) {
    return (S.data.noteTypes || []).filter(function (t) { return !t.spotId; });
  }

  // Un tema sin estante se cae de la lista igual que un papel sin tema: la
  // lista de temas es siempre la de UN estante.
  function temasSueltos(S) {
    // Sin ningún estante, la lista de temas es justo la de los que no tienen:
    // ya se ven, y sacarlos también aquí sería enseñarlos dos veces.
    if (!(S.data.spotGroups || []).length) return [];
    return S.data.spots.filter(function (t) { return !t.groupId && !t.archived; });
  }

  // Todas las tarjetas del tema, con el papel del que cuelgan.
  function tarjetasDelTema(S, temaId) {
    const out = [];
    for (const r of S.data.reviews) {
      if (r.spotId !== temaId) continue;
      for (const c of r.tarjetas) out.push({ papel: r, tarjeta: c });
    }
    return out;
  }

  function estadoTarjeta(c, hoy) {
    if (H.repaso.vence(c, hoy)) {
      const retraso = H.repaso.diasDeRetraso(c, hoy);
      return retraso > 0 ? '+' + retraso + 'd tarde' : 'toca hoy';
    }
    return H.repaso.etiquetaSolidez(c) + ' · vuelve el ' + H.shortDate(c.due);
  }

  // --- Migas -----------------------------------------------------------------

  function migas(S) {
    const tema = temaAbierto(S);

    if (S.ui.estSueltos) {
      return (
        '<div class="migas">' +
        '<button class="miga" data-act="irTemas">Estudio</button>' +
        '<span class="miga-sep">›</span>' +
        '<span class="miga-actual">Papeles sueltos</span></div>'
      );
    }

    if (!tema) return '';

    const carpeta = S.ui.estCarpeta === 'sin'
      ? { name: 'Sin carpeta' }
      : carpetasDe(S, tema.id).find(function (t) { return t.id === S.ui.estCarpeta; });
    const papel = papelAbierto(S);

    const paso = function (texto, act, activo) {
      return activo
        ? '<span class="miga-actual">' + H.esc(texto) + '</span>'
        : '<button class="miga" data-act="' + act + '">' + H.esc(texto) + '</button>';
    };

    return (
      '<div class="migas">' +
      '<button class="miga" data-act="irTemas">' + H.esc(E.estante(S) ? E.estante(S).name : 'Estudio') +
      '</button><span class="miga-sep">›</span>' +
      paso(tema.name, 'irTema', !carpeta && !papel) +
      (carpeta
        ? '<span class="miga-sep">›</span>' + paso(carpeta.name, 'irCarpeta', !papel)
        : '') +
      (papel ? '<span class="miga-sep">›</span>' + paso(papel.title, '', true) : '') +
      '</div>'
    );
  }

  // --- Nivel 1: los temas del estante ---------------------------------------

  function nivelTemas(S) {
    const hoy = H.dateKey();
    const temas = temasDe(S);

    if (!temas.length) {
      return (
        '<div class="panel"><div class="empty">' +
        '<strong>Este estante está vacío</strong>' +
        'Un tema es una materia o un curso: "Git y control de versiones", ' +
        '"Anatomía I". Dentro van sus carpetas, y dentro de cada carpeta los ' +
        'papeles que escribes.</div></div>' +
        cajonSueltos(S)
      );
    }

    return '<div class="nivel">' + temas.map(function (t) {
      const mins = H.minutesOf(S.data.sessions.filter(function (s) { return s.spotId === t.id; }));
      const papeles = S.data.reviews.filter(function (r) { return r.spotId === t.id; }).length;
      const tjs = tarjetasDelTema(S, t.id);
      const hoyN = H.repaso.pendientes(tjs.map(function (x) { return x.tarjeta; }), hoy).length;

      return (
        '<div class="cajon" data-act="abrirTema" data-id="' + t.id + '"' +
        ' style="border-left-color:' + (t.color || 'var(--ink-4)') + '">' +
        '<div class="row" style="align-items:baseline;gap:10px">' +
        '<div class="grow cajon-nombre">' + H.esc(t.name) + '</div>' +
        (hoyN ? '<span class="pill-hoy">' + hoyN + ' para hoy</span>' : '') +
        '</div>' +
        (t.note ? '<div class="micro" style="margin-top:3px">' + H.esc(t.note) + '</div>' : '') +
        '<div class="micro" style="margin-top:6px">' +
        H.hm(mins) + ' de estudio · ' + H.plural(papeles, 'papel', 'papeles') +
        ' · ' + H.plural(tjs.length, 'tarjeta') +
        '</div></div>'
      );
    }).join('') + cajonSueltos(S) + '</div>';
  }

  /* El cajón de los sueltos sale junto a los temas, pero NO pertenece a este
     estante: un papel sin tema tampoco tiene estante. Por eso aparece siempre
     que haya algo dentro, mires el estante que mires — es la puerta de vuelta
     de lo que se quedó fuera, y esconderla detrás del estante correcto sería
     esconderla del todo. */
  function cajonSueltos(S) {
    const n = papelesSueltos(S).length;
    const c = carpetasSueltas(S).length;
    const tm = temasSueltos(S).length;
    if (!n && !c && !tm) return '';

    return (
      '<div class="cajon sueltos" data-act="abrirSueltos">' +
      '<div class="row" style="align-items:baseline;gap:10px">' +
      '<div class="grow cajon-nombre">Papeles sueltos</div>' +
      '</div>' +
      '<div class="micro" style="margin-top:6px">' +
      [n ? H.plural(n, 'papel', 'papeles') + ' sin tema' : '',
       tm ? H.plural(tm, 'tema') + ' sin estante' : '',
       c ? H.plural(c, 'carpeta') + ' sin tema' : ''
      ].filter(Boolean).join(' · ') +
      '</div>' +
      '<div class="micro" style="margin-top:3px">' +
      'Se quedaron aquí al borrarse el tema que los contenía.' +
      '</div></div>'
    );
  }

  // --- La pantalla de los sueltos: colocar cada papel en un tema -------------

  function nivelSueltos(S) {
    const papeles = papelesSueltos(S).slice().sort(function (a, b) {
      return (b.updatedAt || b.createdAt || '') < (a.updatedAt || a.createdAt || '') ? -1 : 1;
    });

    // Todos los temas de todos los estantes: el papel no tiene estante todavía,
    // así que limitar la lista al estante abierto dejaría fuera medio destino.
    const opciones = S.data.spots.filter(function (t) { return !t.archived; })
      .map(function (t) {
        const g = (S.data.spotGroups || []).find(function (x) { return x.id === t.groupId; });
        return '<option value="' + t.id + '">' +
          H.esc((g ? g.name + ' · ' : '') + t.name) + '</option>';
      }).join('');

    const lista = papeles.length
      ? '<div class="nota-lista">' + papeles.map(function (r) {
          const extracto = H.notas.resumen(r.text, 150);
          return (
            '<div class="nota-card suelto">' +
            '<div class="row" style="gap:10px;align-items:baseline">' +
            '<div class="grow nota-card-titulo">' + H.esc(r.title) + '</div>' +
            '<span class="micro">' + H.esc(cuando(r.updatedAt || r.createdAt)) + '</span></div>' +
            (extracto
              ? '<div class="nota-card-extracto">' + H.esc(extracto) + '</div>'
              : '<div class="nota-card-extracto vacio">Sin teoría</div>') +
            '<div class="row tight" style="margin-top:8px;align-items:center;flex-wrap:wrap">' +
            (r.imagenes.length
              ? '<span class="tag">' + H.plural(r.imagenes.length, 'imagen', 'imágenes') + '</span>'
              : '') +
            (r.tarjetas.length
              ? '<span class="tag">' + H.plural(r.tarjetas.length, 'tarjeta') + '</span>' : '') +
            '<select data-mover="' + r.id + '" style="max-width:280px;margin-left:auto">' +
            '<option value="">Colocar en un tema…</option>' + opciones +
            '</select>' +
            /* Y el que no quieres tampoco: obligar a colocarlo en un tema para
               poder tirarlo es hacerle sitio justo a lo que sobra. */
            '<button class="btn sm danger" data-act="borrarPapel" data-id="' + r.id +
            '">Eliminar</button>' +
            '</div></div>'
          );
        }).join('') + '</div>'
      : '<div class="panel"><div class="empty">' +
        '<strong>No hay papeles sueltos</strong>' +
        'Aquí caen los papeles cuyo tema se borra, para que puedas volver a ' +
        'colocarlos en vez de perderlos.</div></div>';

    const temas = temasSueltos(S);
    const sinEstante = temas.length
      ? '<div class="panel" style="margin-top:14px">' +
        '<div class="eyebrow">Temas sin estante</div>' +
        '<div class="micro" style="margin:4px 0 10px">' +
        'La lista de temas es siempre la de un estante, así que estos no salen ' +
        'en ninguna. Ponles uno y vuelven con todo lo que llevan dentro.' +
        '</div>' +
        temas.map(function (t) {
          return (
            '<div class="row" style="gap:10px;align-items:center;padding:5px 0">' +
            '<span class="grow">' + H.esc(t.name) + '</span>' +
            '<span class="micro">' +
            H.plural(S.data.reviews.filter(function (r) { return r.spotId === t.id; }).length,
                     'papel', 'papeles') + '</span>' +
            '<select data-mover-tema="' + t.id + '" style="max-width:220px">' +
            '<option value="">Ponerlo en un estante…</option>' +
            (S.data.spotGroups || []).map(function (g) {
              return '<option value="' + g.id + '">' + H.esc(g.name) + '</option>';
            }).join('') +
            '</select></div>'
          );
        }).join('') + '</div>'
      : '';

    const sinTema = carpetasSueltas(S);
    const carpetas = sinTema.length
      ? '<div class="panel" style="margin-top:14px">' +
        '<div class="eyebrow">Carpetas sin tema</div>' +
        '<div class="micro" style="margin:4px 0 10px">' +
        'Sobraron de una organización anterior. Borrarlas no borra ningún papel.' +
        '</div>' +
        sinTema.map(function (t) {
          const usa = papelesSueltos(S).filter(function (r) { return r.typeId === t.id; }).length;
          return (
            '<div class="row" style="gap:10px;align-items:center;padding:5px 0">' +
            '<span class="grow">' + H.esc(t.name) + '</span>' +
            '<span class="micro">' + (usa ? H.plural(usa, 'papel', 'papeles') : 'vacía') + '</span>' +
            '<button class="btn sm danger" data-act="borrarCarpetaSuelta" data-id="' + t.id +
            '">Borrar</button></div>'
          );
        }).join('') + '</div>'
      : '';

    return lista + sinEstante + carpetas;
  }

  // --- Nivel 2: la ficha del tema y sus carpetas -----------------------------

  function fichaTema(S, tema) {
    const hoy = H.dateKey();
    const sesiones = S.data.sessions.filter(function (s) { return s.spotId === tema.id; });
    const mins = H.minutesOf(sesiones);
    const papeles = S.data.reviews.filter(function (r) { return r.spotId === tema.id; });
    const tjs = tarjetasDelTema(S, tema.id);
    const hoyN = H.repaso.pendientes(tjs.map(function (x) { return x.tarjeta; }), hoy).length;
    const ultimo = sesiones.map(function (s) { return s.date; }).sort().pop();

    // Horas acumuladas de estudio: la única curva que un tema puede enseñar.
    const porFecha = {};
    for (const s of sesiones) porFecha[s.date] = (porFecha[s.date] || 0) + s.countedSec;
    let acc = 0;
    const puntos = Object.keys(porFecha).sort().map(function (k) {
      acc += porFecha[k] / 3600;
      return { x: H.shortDate(k), y: Math.round(acc * 10) / 10 };
    });

    return (
      '<div class="panel"><div class="panel-head">' +
      '<div><h3><span class="dot" style="display:inline-block;background:' +
      (tema.color || 'var(--ink-4)') + ';margin-right:7px"></span>' + H.esc(tema.name) + '</h3>' +
      (tema.note ? '<div class="micro" style="margin-top:2px">' + H.esc(tema.note) + '</div>' : '') +
      '</div><div class="row tight">' +
      '<button class="btn sm" data-act="editarTema" data-id="' + tema.id + '">Editar</button>' +
      '<button class="btn sm danger" data-act="borrarTema" data-id="' + tema.id + '">Eliminar</button>' +
      '</div></div>' +

      '<div class="panel-body"><div class="grid g4">' +
      '<div class="stat"><div class="stat-label">Estudio</div>' +
      '<div class="stat-value">' + H.hm(mins) + '</div>' +
      '<div class="stat-sub">' + H.plural(sesiones.length, 'sesión', 'sesiones') + '</div></div>' +

      '<div class="stat"><div class="stat-label">Papeles</div>' +
      '<div class="stat-value">' + papeles.length + '</div>' +
      '<div class="stat-sub">en ' + H.plural(carpetasDe(S, tema.id).length, 'carpeta') + '</div></div>' +

      '<div class="stat"><div class="stat-label">Tarjetas</div>' +
      '<div class="stat-value">' + tjs.length + '</div>' +
      '<div class="stat-sub">en repaso</div></div>' +

      '<div class="stat"><div class="stat-label">Para repasar</div>' +
      '<div class="stat-value' + (hoyN ? ' warn-txt' : '') + '">' + hoyN + '</div>' +
      '<div class="stat-sub">hoy</div></div>' +
      '</div></div></div>' +

      (puntos.length > 1
        ? '<div class="panel"><div class="panel-head"><h3>Horas acumuladas</h3>' +
          '<span class="micro">último estudio ' + H.esc(ultimo ? H.shortDate(ultimo) : '—') +
          '</span></div><div class="panel-body">' +
          H.charts.line({
            points: puntos,
            color: H.token('--accent'),
            area: true,
            yFormat: function (v) { return v.toFixed(0) + 'h'; }
          }) + '</div></div>'
        : '')
    );
  }

  function nivelCarpetas(S, tema) {
    const hoy = H.dateKey();
    const carpetas = carpetasDe(S, tema.id);
    const sueltos = papelesDe(S, tema.id, 'sin');

    const fila = function (id, nombre, color, papeles, editable) {
      const tjs = [];
      for (const r of papeles) for (const c of r.tarjetas) tjs.push(c);
      const hoyN = H.repaso.pendientes(tjs, hoy).length;
      return (
        '<div class="carpeta" data-act="abrirCarpeta" data-id="' + id + '">' +
        '<span class="carpeta-icono" style="background:' + (color || 'var(--ink-4)') + '"></span>' +
        '<div class="grow"><div class="carpeta-nombre">' + H.esc(nombre) + '</div>' +
        '<div class="micro">' + H.plural(papeles.length, 'papel', 'papeles') +
        (tjs.length ? ' · ' + H.plural(tjs.length, 'tarjeta') : '') + '</div></div>' +
        (hoyN ? '<span class="pill-hoy">' + hoyN + '</span>' : '') +
        (editable
          ? '<button class="icon-btn carpeta-edit" data-act="editarCarpeta" data-id="' + id +
            '" title="Renombrar carpeta">✎</button>'
          : '') +
        '</div>'
      );
    };

    return (
      '<div class="panel"><div class="panel-head"><h3>Carpetas</h3>' +
      '<button class="btn sm" data-act="nuevaCarpeta">+ Carpeta</button></div>' +
      '<div class="panel-body flush">' +
      (carpetas.length || sueltos.length
        ? carpetas.map(function (c) {
            return fila(c.id, c.name, c.color, papelesDe(S, tema.id, c.id), true);
          }).join('') +
          (sueltos.length ? fila('sin', 'Sin carpeta', null, sueltos, false) : '')
        : '<div class="empty" style="padding:18px">' +
          '<strong>Este tema no tiene carpetas</strong>' +
          'Una carpeta agrupa papeles que van juntos: "Comandos", "Ejercicios", ' +
          '"Dudas". Crea la primera y escribe dentro.</div>') +
      '</div></div>'
    );
  }

  // --- Nivel 3: los papeles de la carpeta ------------------------------------

  function nivelPapeles(S, tema) {
    const hoy = H.dateKey();
    let papeles = papelesDe(S, tema.id, S.ui.estCarpeta);

    const q = normaliza(S.ui.estBusca).trim();
    if (q) {
      papeles = papeles.filter(function (r) {
        return normaliza(r.title + ' ' + H.notas.aTextoPlano(r.text)).indexOf(q) !== -1;
      });
    }
    papeles = papeles.slice().sort(function (a, b) {
      return (b.updatedAt || b.createdAt || '') < (a.updatedAt || a.createdAt || '') ? -1 : 1;
    });

    const lista = papeles.length
      ? '<div class="nota-lista">' + papeles.map(function (r) {
          const tjs = r.tarjetas;
          const hoyN = H.repaso.pendientes(tjs, hoy).length;
          const extracto = H.notas.resumen(r.text, 150);
          return (
            '<div class="nota-card" data-act="abrirPapel" data-id="' + r.id +
            '" style="border-left-color:' + (tema.color || 'var(--ink-4)') + '">' +
            '<div class="row" style="gap:10px;align-items:baseline">' +
            '<div class="grow nota-card-titulo">' + H.esc(r.title) + '</div>' +
            '<span class="micro">' + H.esc(cuando(r.updatedAt || r.createdAt)) + '</span></div>' +
            (extracto
              ? '<div class="nota-card-extracto">' + H.esc(extracto) + '</div>'
              : '<div class="nota-card-extracto vacio">Sin teoría todavía</div>') +
            '<div class="row tight" style="margin-top:8px;align-items:center;flex-wrap:wrap">' +
            (r.imagenes.length
              ? '<span class="tag">' + H.plural(r.imagenes.length, 'imagen', 'imágenes') + '</span>'
              : '') +
            (tjs.length ? '<span class="tag">' + H.plural(tjs.length, 'tarjeta') + '</span>' : '') +
            '<span class="micro ' + (hoyN ? 'warn-txt' : '') + '" style="margin-left:auto">' +
            (hoyN ? hoyN + ' para hoy' : tjs.length ? 'al día' : 'sin tarjetas') +
            '</span></div></div>'
          );
        }).join('') + '</div>'
      : '<div class="panel"><div class="empty">' +
        (q
          ? '<strong>Nada con "' + H.esc(S.ui.estBusca.trim()) + '" en esta carpeta</strong>' +
            'Se busca en el título y en la teoría de los papeles de aquí dentro.'
          : '<strong>Esta carpeta está vacía</strong>' +
            'Un papel es una clase, una lectura o un tema suelto: escribes la ' +
            'teoría, le pegas las imágenes que hagan falta y sacas tarjetas de ahí.') +
        '</div></div>';

    return (
      '<div class="row tight" style="margin-bottom:10px">' +
      '<input type="text" id="estBusca" class="grow" placeholder="Buscar en esta carpeta" ' +
      'value="' + H.esc(S.ui.estBusca) + '">' +
      '<button class="btn primary" data-act="nuevoPapel">Nuevo papel</button></div>' +
      lista
    );
  }

  // --- El papel --------------------------------------------------------------

  const MARCAS = [
    { marca: '**', etiqueta: 'B', titulo: 'Negrita  **texto**', estilo: 'font-weight:700' },
    { marca: '*', etiqueta: 'I', titulo: 'Cursiva  *texto*', estilo: 'font-style:italic' },
    { marca: '__', etiqueta: 'U', titulo: 'Subrayado  __texto__', estilo: 'text-decoration:underline' },
    { marca: '~~', etiqueta: 'S', titulo: 'Tachado  ~~texto~~', estilo: 'text-decoration:line-through' },
    { sep: true },
    { marca: '!', cierre: '!', etiqueta: '⚠', titulo: 'Caja de alerta  !texto!' },
    { marca: '>', cierre: '<', etiqueta: '★', titulo: 'Caja de nota importante  >texto<' },
    { marca: '#', cierre: '#', etiqueta: '#', titulo: 'Etiqueta  #varias palabras#' }
  ];

  const PREFIJOS = [
    { prefijo: '# ', etiqueta: 'T1', titulo: 'Título grande  # texto' },
    { prefijo: '## ', etiqueta: 'T2', titulo: 'Título medio  ## texto' },
    { prefijo: '### ', etiqueta: 'T3', titulo: 'Título pequeño  ### texto' },
    { prefijo: '- ', etiqueta: '•', titulo: 'Lista con puntos  - texto' },
    { prefijo: '1. ', etiqueta: '1.', titulo: 'Lista numerada  1. texto' }
  ];

  function barra(S) {
    const escribiendo = S.ui.papelVista !== 'ver';
    const marcas = MARCAS.map(function (m) {
      if (m.sep) return '<span class="md-sep"></span>';
      return '<button class="md-btn" data-act="marca" data-marca="' + H.esc(m.marca) +
        '" data-cierre="' + H.esc(m.cierre || m.marca) + '" title="' + H.esc(m.titulo) +
        '" style="' + (m.estilo || '') + '">' + H.esc(m.etiqueta) + '</button>';
    }).join('');
    const prefijos = PREFIJOS.map(function (p) {
      return '<button class="md-btn" data-act="prefijo" data-prefijo="' + H.esc(p.prefijo) +
        '" title="' + H.esc(p.titulo) + '">' + H.esc(p.etiqueta) + '</button>';
    }).join('');

    return (
      '<div class="md-barra">' +
      (escribiendo
        ? marcas + '<span class="md-sep"></span>' + prefijos +
          '<span class="md-sep"></span>' +
          '<button class="md-btn" data-act="prefijo" data-prefijo="---" ' +
          'title="Línea divisoria  ---">—</button>'
        : '<span class="micro">Así queda el papel</span>') +
      '<div class="seg" style="margin-left:auto">' +
      '<button class="seg-btn' + (escribiendo ? ' on' : '') +
      '" data-act="papelVista" data-modo="escribir">Escribir</button>' +
      '<button class="seg-btn' + (escribiendo ? '' : ' on') +
      '" data-act="papelVista" data-modo="ver">Ver</button></div></div>'
    );
  }

  /* El panel de imágenes.

     A la derecha y nunca encima del texto: una captura incrustada en medio
     parte la lectura en dos y al releer el párrafo hay que saltarla. Aquí la
     imagen se queda quieta en su panel mientras sigues leyendo al lado, que es
     justo lo que hace falta cuando la teoría habla de un diagrama. */
  function panelImagenes(S, papel) {
    const ver = papel.imagenes.find(function (im) { return im.id === S.ui.imgVer; });

    const ancha = S.ui.imgAncho === 'ancha';

    return (
      '<div class="img-panel" id="imgPanel">' +
      '<div class="img-panel-cab">' +
      '<span class="eyebrow grow">Imágenes</span>' +
      /* Ensanchar el panel en vez de abrir la imagen encima del texto: una
         captura de 1900px no se lee en una columna estrecha, pero taparte la
         teoría para verla rompe justo la lectura que venías a hacer. */
      '<button class="btn sm" data-act="imgAncho" title="' +
      (ancha ? 'Estrechar el panel' : 'Ensanchar el panel') + '">' +
      (ancha ? '›‹ Estrechar' : '‹› Ensanchar') + '</button>' +
      '<button class="btn sm" data-act="imgElegir">Añadir</button>' +
      '</div>' +

      '<div class="img-lienzo' + (S.ui.imgReal ? ' real' : '') + '" id="imgLienzo">' +
      (ver
        ? '<img id="imgVista" alt="' + H.esc(ver.nombre) + '">' +
          '<div class="img-cargando" id="imgCargando">cargando…</div>'
        : '<div class="img-vacio">' +
          (papel.imagenes.length
            ? 'Pulsa un nombre de abajo, o un [[enlace]] del texto.'
            : 'Pega una captura con Ctrl+V, arrástrala aquí o pulsa Añadir.') +
          '</div>') +
      '</div>' +

      (ver
        ? '<div class="img-acciones">' +
          '<span class="grow img-nombre">' + H.esc(ver.nombre) + '</span>' +
          // Tamaño real con scroll dentro del panel: para las capturas con
          // letra pequeña, que ajustadas no hay quien las lea.
          '<button class="btn sm" data-act="imgReal">' +
          (S.ui.imgReal ? 'Ajustar' : 'Tamaño real') + '</button>' +
          '<button class="btn sm" data-act="imgInsertar" data-id="' + ver.id +
          '" title="Escribir [[' + H.esc(ver.nombre) + ']] donde está el cursor">Enlazar</button>' +
          '<button class="btn sm" data-act="imgRenombrar" data-id="' + ver.id + '">Renombrar</button>' +
          '<button class="btn sm danger" data-act="imgBorrar" data-id="' + ver.id + '">Borrar</button>' +
          '</div>'
        : '') +

      (papel.imagenes.length
        ? '<div class="img-lista">' + papel.imagenes.map(function (im) {
            const citada = H.notas.imagenesCitadas(papel.text)
              .some(function (n) { return n.toLowerCase() === im.nombre.toLowerCase(); });
            return '<div class="img-fila' + (im.id === S.ui.imgVer ? ' on' : '') +
              '" data-act="imgVer" data-id="' + im.id + '">' +
              '<span class="grow">' + H.esc(im.nombre) + '</span>' +
              // Una imagen que no se cita desde el texto es una imagen que no
              // vas a encontrar cuando la necesites.
              (citada ? '' : '<span class="micro" title="No se enlaza desde el texto">sin enlazar</span>') +
              '</div>';
          }).join('') + '</div>'
        : '') +
      '</div>'
    );
  }

  /* Las tarjetas, debajo de la teoría y separadas de ella.

     No se mezclan con lo que escribes a propósito: la teoría se lee y las
     tarjetas se preguntan. Un resumen de clase entero no se puede puntuar de
     0 a 5 —siempre recuerdas una parte— así que lo que se repasa son estas,
     cortas y de una en una. */
  function panelTarjetas(S, papel) {
    const hoy = H.dateKey();
    const pendientes = H.repaso.pendientes(papel.tarjetas, hoy).length;

    return (
      '<div class="panel"><div class="panel-head">' +
      '<h3>Tarjetas</h3>' +
      '<div class="row tight" style="align-items:center">' +
      '<span class="micro">' +
      (pendientes ? pendientes + ' para hoy · ' : '') +
      H.plural(papel.tarjetas.length, 'tarjeta') + '</span>' +
      '<button class="btn sm primary" data-act="sacarTarjeta">Sacar tarjeta</button>' +
      '</div></div>' +
      '<div class="panel-body flush">' +
      (papel.tarjetas.length
        ? papel.tarjetas.map(function (c) {
            const vence = H.repaso.vence(c, hoy);
            return (
              '<div class="list-row" style="align-items:flex-start;cursor:pointer" ' +
              'data-act="editarTarjeta" data-id="' + c.id + '">' +
              '<div class="grow">' +
              '<div style="font-size:13px;font-weight:500;line-height:1.45">' +
              H.esc(c.pregunta) + '</div>' +
              (c.respuesta
                ? '<div class="micro" style="margin-top:2px">' +
                  H.esc(H.notas.resumen(c.respuesta, 90)) + '</div>'
                : '<div class="micro" style="margin-top:2px;font-style:italic">Sin respuesta</div>') +
              '</div>' +
              '<div style="width:130px;text-align:right">' +
              (vence
                ? '<span class="warn-txt" style="font-weight:600">' + H.esc(estadoTarjeta(c, hoy)) + '</span>'
                : '<span class="micro">' + H.esc(estadoTarjeta(c, hoy)) + '</span>') +
              '</div>' +
              '<button class="icon-btn" data-act="borrarTarjeta" data-id="' + c.id + '">×</button>' +
              '</div>'
            );
          }).join('')
        : '<div class="empty" style="padding:18px">' +
          '<strong>Este papel no tiene tarjetas</strong>' +
          'Marca un trozo de la teoría y pulsa <em>Sacar tarjeta</em>. Lo que ' +
          'repasa Flow son estas, no el papel entero: una tarjeta, una cosa, ' +
          'contestable en diez segundos.</div>') +
      '</div></div>'
    );
  }

  function elPapel(S, papel) {
    const draft = S.ui.papelDraft && S.ui.papelDraft.id === papel.id
      ? S.ui.papelDraft
      : { id: papel.id, title: papel.title, text: papel.text };

    return (
      '<div class="papel">' +
      '<div class="papel-texto">' +
      '<div class="panel"><div class="panel-head">' +
      '<button class="btn sm ghost" data-act="volverPapeles">← Volver</button>' +
      '<div class="row tight" style="align-items:center">' +
      '<span class="micro" id="papelEstado"></span>' +
      '<button class="btn sm" data-act="guardarPapel">Guardar</button>' +
      '<button class="btn sm danger" data-act="borrarPapel" data-id="' + papel.id + '">Eliminar</button>' +
      '</div></div>' +

      '<div class="panel-body">' +
      '<input type="text" id="papelTitulo" class="nota-titulo" placeholder="El título del papel" ' +
      'value="' + H.esc(draft.title) + '">' +
      '<div class="micro" style="margin:4px 0 12px">' +
      'Aquí va la teoría. Las imágenes se enlazan con <code>[[nombre]]</code> y salen ' +
      'a la derecha sin tapar lo que estás leyendo.</div>' +

      barra(S) +

      (S.ui.papelVista === 'ver'
        ? '<div class="nota-cuerpo nota-lienzo">' +
          (H.notas.aHtml(draft.text) || '<p class="micro">Todavía no hay teoría.</p>') + '</div>'
        : '<textarea id="papelCuerpo" class="nota-lienzo" spellcheck="true" ' +
          'placeholder="## Lo que salió en la clase&#10;&#10;- Un punto&#10;&#10;' +
          '!Esto sale en una caja de alerta!&#10;&#10;' +
          'Mira el [[esquema]] de la derecha. #etiqueta#&#10;&#10;' +
          '(pulsa Ver para verlo con formato · clic derecho corrige la ortografía)">' +
          H.esc(draft.text) + '</textarea>') +

      '<div class="micro nota-ayuda">' +
      '<code>**negrita**</code> <code>*cursiva*</code> <code>__subrayado__</code> ' +
      '<code>~~tachado~~</code> <code># ## ###</code> <code>- lista</code> ' +
      '<code>!alerta!</code> <code>&gt;importante&lt;</code> <code>#etiqueta#</code> ' +
      '<code>[[imagen]]</code> · Ctrl+S guarda' +
      '</div></div></div>' +

      panelTarjetas(S, papel) +
      '</div>' +

      '<div class="papel-lado' + (S.ui.imgAncho === 'ancha' ? ' ancha' : '') + '">' +
      panelImagenes(S, papel) + '</div>' +
      '</div>'
    );
  }

  // --- Guardado del papel ----------------------------------------------------

  let temporizador = null;

  function estado(texto, color) {
    const n = H.el('papelEstado');
    if (!n) return;
    n.textContent = texto;
    n.style.color = color || 'var(--ink-4)';
  }

  function leerDelDom(S) {
    const d = S.ui.papelDraft;
    if (!d) return;
    const t = H.el('papelTitulo');
    const c = H.el('papelCuerpo');
    if (t) d.title = t.value;
    if (c) d.text = c.value;
  }

  async function guardar(S) {
    if (temporizador) { clearTimeout(temporizador); temporizador = null; }
    const d = S.ui.papelDraft;
    if (!d || !d.id) return true;
    leerDelDom(S);
    if (!d.title.trim()) { estado('Ponle un título para guardar', 'var(--neg)'); return false; }

    estado('Guardando…');
    const res = await S.mutate('review:update', { id: d.id, title: d.title, text: d.text });
    if (!res || !res.ok) {
      estado(res && res.error ? res.error : 'No se pudo guardar', 'var(--neg)');
      return false;
    }
    estado('Guardado');
    return true;
  }

  function programarGuardado(S) {
    estado('Sin guardar', 'var(--warn)');
    if (temporizador) clearTimeout(temporizador);
    temporizador = setTimeout(function () { guardar(S); }, 700);
  }

  function repintar(S) {
    S.pausarRender = false;
    S.render();
  }

  async function salir(S, despues) {
    await guardar(S);
    S.ui.estPapel = null;
    S.ui.papelDraft = null;
    S.ui.imgVer = null;
    S.pausarRender = false;
    if (despues) despues();
    S.render();
  }

  function aplicar(S, fn) {
    const ta = H.el('papelCuerpo');
    if (!ta) return;
    const res = fn(ta.value, ta.selectionStart, ta.selectionEnd);
    ta.value = res.texto;
    ta.setSelectionRange(res.desde, res.hasta);
    ta.focus();
    leerDelDom(S);
    programarGuardado(S);
  }

  // --- Imágenes: cargar bajo demanda ----------------------------------------

  /* Las imágenes se piden al proceso principal y llegan como data URL. Se
     guardan en esta caché para que volver a una que ya viste sea instantáneo:
     sin ella, cada clic releería el archivo del disco y lo pasaría por IPC. */
  const cacheImg = new Map();

  async function pintarImagen(S, papel) {
    const img = H.el('imgVista');
    if (!img || !S.ui.imgVer) return;
    const clave = papel.id + ':' + S.ui.imgVer;
    const cargando = H.el('imgCargando');

    if (cacheImg.has(clave)) {
      img.src = cacheImg.get(clave);
      if (cargando) cargando.remove();
      return;
    }
    const res = await window.hq.imagen.leer(papel.id, S.ui.imgVer);
    if (!res || !res.ok) {
      if (cargando) cargando.textContent = res && res.error ? res.error : 'No se pudo cargar';
      return;
    }
    cacheImg.set(clave, res.dataUrl);
    img.src = res.dataUrl;
    if (cargando) cargando.remove();
  }

  async function pegarDataUrl(S, papel, nombre, dataUrl) {
    const res = await window.hq.imagen.pegar(papel.id, nombre, dataUrl);
    if (!res || !res.ok) {
      H.modals.alert('No se pudo guardar la imagen', (res && res.error) || '');
      return;
    }
    if (res.data) S.data = res.data;
    S.ui.imgVer = res.imagen.id;
    repintar(S);
  }

  // --- Montaje ---------------------------------------------------------------

  E.html = function (S) {
    /* Si el estante que estabas mirando ya no existe — lo acabas de borrar —
       la navegación apunta a un sitio que no está. Se vuelve al principio en
       vez de pintar una pantalla de un estante fantasma. */
    if (S.ui.estGrupo &&
        !(S.data.spotGroups || []).some(function (x) { return x.id === S.ui.estGrupo; })) {
      S.ui.estGrupo = null;
      S.ui.spotId = null;
      S.ui.estCarpeta = null;
      S.ui.estPapel = null;
    }

    const tema = temaAbierto(S);
    const papel = papelAbierto(S);
    const estantes = S.data.spotGroups || [];
    const g = E.estante(S);

    const cuerpo = S.ui.estSueltos
      ? nivelSueltos(S)
      : !tema
      ? nivelTemas(S)
      : papel
      ? elPapel(S, papel)
      : S.ui.estCarpeta
      ? nivelPapeles(S, tema)
      : fichaTema(S, tema) + nivelCarpetas(S, tema);

    return (
      '<div class="page-head">' +
      '<div><h1>Estudio</h1>' +
      '<div class="micro" style="margin-top:2px">' +
      (S.ui.estSueltos
        ? 'Lo que se quedó fuera del recorrido'
        : tema
        ? H.plural(carpetasDe(S, tema.id).length, 'carpeta') + ' · ' +
          H.plural(S.data.reviews.filter(function (r) { return r.spotId === tema.id; }).length,
                   'papel', 'papeles')
        : H.plural(temasDe(S).length, 'tema') + ' en este estante') +
      '</div></div>' +
      '<div class="row tight" style="align-items:flex-end">' +
      '<label class="field" style="width:190px;margin:0"><span>Estante</span>' +
      '<select id="estGrupo">' +
      estantes.map(function (x) {
        return '<option value="' + x.id + '"' + (g && x.id === g.id ? ' selected' : '') +
          '>' + H.esc(x.name) + '</option>';
      }).join('') +
      '</select></label>' +
      // Sin esto el estante es de solo lectura: se puede crear y nunca
      // renombrar ni borrar, porque el modal que lo hace no tiene puerta.
      (g
        ? '<button class="btn sm" data-act="editarEstante" style="height:31px;padding:0 10px"' +
          ' title="Renombrar o eliminar este estante">✎</button>'
        : '') +
      '<button class="btn sm" data-act="nuevoEstante" style="height:31px">+ Estante</button>' +
      (tema || S.ui.estSueltos ? '' :
        '<button class="btn primary" data-act="nuevoTema" style="height:31px">Nuevo tema</button>') +
      '</div></div>' +

      migas(S) +
      cuerpo
    );
  };

  E.bind = function (root, S) {
    const selGrupo = root.querySelector('#estGrupo');
    if (selGrupo) {
      selGrupo.addEventListener('change', function () {
        S.ui.estGrupo = selGrupo.value;
        // Cambiar de estante vuelve al principio: el tema que tenías abierto
        // es de otro estante y seguir dentro de él sería mentir sobre dónde estás.
        S.ui.spotId = null;
        S.ui.estCarpeta = null;
        S.ui.estPapel = null;
        S.ui.estSueltos = false;
        repintar(S);
      });
    }

    /* Colocar un papel suelto. Se hace con un desplegable y no arrastrando:
       el destino puede estar en otro estante, y arrastrar entre pantallas que
       no se ven a la vez no se puede. */
    root.querySelectorAll('[data-mover]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        if (!sel.value) return;
        (async function () {
          const res = await S.mutate('review:update',
            { id: sel.getAttribute('data-mover'), spotId: sel.value, typeId: null });
          if (res && !res.ok) {
            H.modals.alert('No se pudo colocar el papel', res.error || '');
            return;
          }
          repintar(S);
        })();
      });
    });

    root.querySelectorAll('[data-mover-tema]').forEach(function (sel) {
      sel.addEventListener('change', function () {
        if (!sel.value) return;
        (async function () {
          const res = await S.mutate('spot:update',
            { id: sel.getAttribute('data-mover-tema'), groupId: sel.value });
          if (res && !res.ok) {
            H.modals.alert('No se pudo mover el tema', res.error || '');
            return;
          }
          // Se salta al estante donde acaba de aterrizar: si no, el tema
          // desaparece de esta pantalla y no se ve dónde ha ido.
          S.ui.estGrupo = sel.value;
          S.ui.estSueltos = false;
          repintar(S);
        })();
      });
    });

    const busca = root.querySelector('#estBusca');
    if (busca) {
      busca.addEventListener('input', function () {
        S.ui.estBusca = busca.value;
        S.render();
        const nuevo = H.el('estBusca');
        if (nuevo) { nuevo.focus(); nuevo.setSelectionRange(nuevo.value.length, nuevo.value.length); }
      });
    }

    const papel = papelAbierto(S);
    const titulo = root.querySelector('#papelTitulo');
    const cuerpo = root.querySelector('#papelCuerpo');

    if (papel && (titulo || cuerpo)) {
      S.pausarRender = true;

      if (!S.ui.papelDraft || S.ui.papelDraft.id !== papel.id) {
        S.ui.papelDraft = { id: papel.id, title: papel.title, text: papel.text };
      }

      [titulo, cuerpo].forEach(function (n) {
        if (!n) return;
        n.addEventListener('input', function () { leerDelDom(S); programarGuardado(S); });
        // Cambiar de pestaña o de ventana quita el foco antes que nada más:
        // guardar aquí es lo que hace que no se pierda un párrafo por salir.
        n.addEventListener('blur', function () { guardar(S); });
      });

      if (cuerpo) {
        cuerpo.addEventListener('keydown', function (e) {
          if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
            e.preventDefault(); guardar(S); return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            aplicar(S, function (t, a, b) {
              return { texto: t.slice(0, a) + '  ' + t.slice(b), desde: a + 2, hasta: a + 2 };
            });
          }
        });

        /* Pegar una captura directamente en el texto. Es la vía rápida: haces
           la captura, Ctrl+V, y ya está guardada y enlazable. */
        cuerpo.addEventListener('paste', function (e) {
          const items = (e.clipboardData && e.clipboardData.items) || [];
          for (const it of items) {
            if (it.type.indexOf('image/') !== 0) continue;
            e.preventDefault();
            const file = it.getAsFile();
            const fr = new FileReader();
            fr.onload = function () { pegarDataUrl(S, papel, 'captura', fr.result); };
            fr.readAsDataURL(file);
            return;
          }
        });
      }

      const panel = root.querySelector('#imgPanel');
      if (panel) {
        panel.addEventListener('dragover', function (e) {
          e.preventDefault();
          panel.classList.add('soltando');
        });
        panel.addEventListener('dragleave', function () { panel.classList.remove('soltando'); });
        panel.addEventListener('drop', function (e) {
          e.preventDefault();
          panel.classList.remove('soltando');
          const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
          if (!f || f.type.indexOf('image/') !== 0) return;
          const fr = new FileReader();
          fr.onload = function () {
            pegarDataUrl(S, papel, f.name.replace(/\.[^.]+$/, ''), fr.result);
          };
          fr.readAsDataURL(f);
        });
      }

      if (S.ui.imgVer) pintarImagen(S, papel);
    }

    H.delegate(root, function (act, ds) {
      switch (act) {
        // --- recorrido ---
        case 'abrirTema':
          S.ui.spotId = ds.id; S.ui.estCarpeta = null; S.ui.estPapel = null;
          S.ui.estSueltos = false;
          repintar(S);
          break;
        case 'abrirSueltos':
          S.ui.estSueltos = true;
          S.ui.spotId = null; S.ui.estCarpeta = null; S.ui.estPapel = null;
          repintar(S);
          break;
        case 'abrirCarpeta':
          S.ui.estCarpeta = ds.id; S.ui.estPapel = null; S.ui.estBusca = '';
          repintar(S);
          break;
        case 'abrirPapel':
          S.ui.estPapel = ds.id; S.ui.papelDraft = null;
          S.ui.papelVista = 'escribir'; S.ui.imgVer = null;
          repintar(S);
          break;
        case 'irTemas':
          salir(S, function () {
            S.ui.spotId = null; S.ui.estCarpeta = null; S.ui.estSueltos = false;
          });
          break;
        case 'irTema':
          salir(S, function () { S.ui.estCarpeta = null; });
          break;
        case 'irCarpeta':
        case 'volverPapeles':
          salir(S);
          break;

        // --- estantes, temas y carpetas ---
        case 'nuevoEstante': H.modals.spotGroup(S, null); break;
        case 'editarEstante': {
          const est = E.estante(S);
          if (est) H.modals.spotGroup(S, est.id);
          break;
        }
        case 'nuevoTema': H.modals.spot(S, null); break;
        case 'editarTema': H.modals.spot(S, ds.id); break;
        case 'borrarTema': {
          const t = S.data.spots.find(function (x) { return x.id === ds.id; });
          const nP = S.data.reviews.filter(function (r) { return r.spotId === ds.id; }).length;
          H.modals.confirm(
            '¿Eliminar el tema "' + (t ? t.name : '') + '"?',
            'Se borran sus carpetas. ' +
            (nP
              ? H.plural(nP, 'papel', 'papeles') + ' ' + (nP === 1 ? 'pasa' : 'pasan') +
                ' a "Papeles sueltos", en la lista de temas: no se borra ninguno.'
              : 'No tiene papeles.'),
            function () {
              S.mutate('spot:remove', { id: ds.id });
              S.ui.spotId = null; S.ui.estCarpeta = null; S.ui.estPapel = null;
            }
          );
          break;
        }
        case 'borrarCarpetaSuelta': {
          const cs = S.data.noteTypes.find(function (x) { return x.id === ds.id; });
          H.modals.confirm(
            '¿Borrar la carpeta "' + (cs ? cs.name : '') + '"?',
            'Es solo la etiqueta. Los papeles que la lleven se quedan como están, ' +
            'sin carpeta: no se borra ninguno.',
            function () { S.mutate('noteType:remove', { id: ds.id }); }
          );
          break;
        }
        case 'nuevaCarpeta': H.modals.notaTipo(S, null, S.ui.spotId); break;
        case 'editarCarpeta': H.modals.notaTipo(S, ds.id); break;

        // --- papeles ---
        case 'nuevoPapel':
          (async function () {
            const res = await S.mutate('review:add', {
              title: 'Papel nuevo',
              spotId: S.ui.spotId,
              typeId: S.ui.estCarpeta === 'sin' ? null : S.ui.estCarpeta
            });
            if (!res || !res.ok) return;
            S.ui.estPapel = S.data.reviews[S.data.reviews.length - 1].id;
            S.ui.papelDraft = null; S.ui.papelVista = 'escribir'; S.ui.imgVer = null;
            repintar(S);
            const t = H.el('papelTitulo');
            if (t) { t.focus(); t.select(); }
          })();
          break;
        case 'guardarPapel': guardar(S); break;
        case 'papelVista':
          leerDelDom(S); guardar(S);
          S.ui.papelVista = ds.modo;
          repintar(S);
          break;
        case 'marca':
          aplicar(S, function (t, a, b) {
            return H.notas.envolver(t, a, b, ds.marca, ds.cierre);
          });
          break;
        case 'prefijo':
          if (ds.prefijo === '---') {
            aplicar(S, function (t, a) {
              const corte = t.slice(0, a);
              const sep = (corte && !corte.endsWith('\n') ? '\n' : '') + '---\n';
              return { texto: corte + sep + t.slice(a), desde: a + sep.length, hasta: a + sep.length };
            });
          } else {
            aplicar(S, function (t, a, b) { return H.notas.prefijar(t, a, b, ds.prefijo); });
          }
          break;
        case 'borrarPapel': {
          const r = S.data.reviews.find(function (x) { return x.id === ds.id; });
          if (!r) return;
          H.modals.confirm(
            '¿Eliminar "' + (r.title || 'este papel') + '"?',
            'Se pierde su teoría, ' + H.plural(r.imagenes.length, 'imagen', 'imágenes') +
            ' y ' + H.plural(r.tarjetas.length, 'tarjeta') + ' con su historial de repasos.',
            function () {
              if (temporizador) { clearTimeout(temporizador); temporizador = null; }
              S.ui.estPapel = null; S.ui.papelDraft = null; S.ui.imgVer = null;
              S.pausarRender = false;
              S.mutate('review:remove', { id: ds.id });
            }
          );
          break;
        }

        // --- imágenes ---
        case 'imgVer':
          S.ui.imgVer = ds.id;
          repintar(S);
          break;
        case 'imgAncho':
          S.ui.imgAncho = S.ui.imgAncho === 'ancha' ? 'normal' : 'ancha';
          repintar(S);
          break;
        case 'imgReal':
          S.ui.imgReal = !S.ui.imgReal;
          repintar(S);
          break;
        case 'verImagen': {
          // Un [[enlace]] del texto. Se busca por nombre, que es lo que se
          // escribe: si no existe, se dice en vez de no hacer nada.
          if (!papel) return;
          const im = papel.imagenes.find(function (x) {
            return x.nombre.toLowerCase() === String(ds.nombre || '').toLowerCase();
          });
          if (!im) {
            H.modals.alert('No hay ninguna imagen así',
              'Este papel no tiene ninguna imagen llamada "' + ds.nombre + '". ' +
              'Añádela en el panel de la derecha y ponle ese nombre.');
            return;
          }
          S.ui.imgVer = im.id;
          repintar(S);
          break;
        }
        case 'imgElegir':
          (async function () {
            if (!papel) return;
            const res = await window.hq.imagen.elegir(papel.id);
            if (res && res.cancelado) return;
            if (!res || !res.ok) {
              H.modals.alert('No se pudo añadir', (res && res.error) || '');
              return;
            }
            if (res.data) S.data = res.data;
            S.ui.imgVer = res.imagen.id;
            repintar(S);
          })();
          break;
        case 'imgInsertar': {
          const im = papel && papel.imagenes.find(function (x) { return x.id === ds.id; });
          if (!im) return;
          aplicar(S, function (t, a, b) {
            const marca = '[[' + im.nombre + ']]';
            return { texto: t.slice(0, a) + marca + t.slice(b), desde: a + marca.length, hasta: a + marca.length };
          });
          break;
        }
        case 'imgRenombrar': {
          const im = papel && papel.imagenes.find(function (x) { return x.id === ds.id; });
          if (!im) return;
          S.pausarRender = false;
          H.modals.renombrarImagen(S, papel, im);
          break;
        }
        case 'imgBorrar': {
          const im = papel && papel.imagenes.find(function (x) { return x.id === ds.id; });
          if (!im) return;
          S.pausarRender = false;
          H.modals.confirm(
            '¿Borrar la imagen "' + im.nombre + '"?',
            'Se borra el archivo del disco. Los [[' + im.nombre + ']] que hayas ' +
            'escrito en la teoría se quedan sin nada al que apuntar.',
            async function () {
              const res = await window.hq.imagen.borrar(papel.id, im.id);
              if (res && res.data) S.data = res.data;
              S.ui.imgVer = null;
              repintar(S);
            }
          );
          break;
        }

        // --- tarjetas ---
        case 'sacarTarjeta': {
          if (!papel) return;
          const ta = H.el('papelCuerpo');
          const sel = ta ? ta.value.slice(ta.selectionStart, ta.selectionEnd).trim() : '';
          leerDelDom(S);
          (async function () {
            await guardar(S);
            S.pausarRender = false;
            H.modals.tarjeta(S, papel, null, sel);
          })();
          break;
        }
        case 'editarTarjeta': {
          const c = papel && papel.tarjetas.find(function (x) { return x.id === ds.id; });
          if (!c) return;
          S.pausarRender = false;
          H.modals.tarjeta(S, papel, c, '');
          break;
        }
        case 'borrarTarjeta': {
          const c = papel && papel.tarjetas.find(function (x) { return x.id === ds.id; });
          if (!c) return;
          S.pausarRender = false;
          H.modals.confirm(
            '¿Eliminar esta tarjeta?',
            c.reps
              ? 'Llevas ' + H.plural(c.reps, 'acierto seguido', 'aciertos seguidos') +
                ' con ella. Se pierde su historial de repasos.'
              : 'Todavía no la has repasado, no se pierde nada.',
            function () { S.mutate('card:remove', { notaId: papel.id, id: c.id }); }
          );
          break;
        }
      }
    });
  };

  H.views.estudio = E;
})(window.H);
