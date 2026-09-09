/* Estado de la ventana principal y enrutado entre vistas. */
(function (H) {
  'use strict';

  const S = {
    data: null,
    session: null,
    dataPath: '',
    view: 'today',
    // Estado local de cada vista (mes visible, spot seleccionado, rango...)
    ui: {
      planMonth: null, // {y, m} - se fija en el arranque
      dashRange: 'week',
      spotId: null,
      areaId: null,
      // Id del repaso cuya respuesta está a la vista. Solo pantalla.
      repasoRevelado: null,

      /* --- Estudio: dónde estás dentro de la oficina --------------------
         El recorrido es estante → tema → carpeta → papel, y estos cuatro
         campos son la dirección exacta. `spotId` es el tema abierto. */
      estGrupo: null,          // estante elegido en el desplegable
      estCarpeta: null,        // carpeta abierta · 'sin' = los papeles sueltos
      estPapel: null,          // papel abierto, o null si se ve la lista
      estBusca: '',
      // Lo que estás escribiendo, fuera de los datos guardados: si viviera en
      // S.data, cualquier repintado se llevaría el párrafo a medias.
      papelDraft: null,
      // 'escribir' | 'ver'
      papelVista: 'escribir',
      // Imagen que se está viendo en el panel de la derecha.
      imgVer: null,
      /* Cuánto sitio le das al panel de imágenes: 'normal' o 'ancha'. Y si la
         imagen se ve ajustada al panel o a tamaño real con scroll dentro.
         Una captura de pantalla de 1900px metida en un panel estrecho no se
         lee, y ampliarla en una ventana flotante taparía justo el texto que
         estás leyendo — que es lo que este panel viene a evitar. */
      imgAncho: 'normal',
      imgReal: false,
      // Borrador del diagnóstico de Life en curso, por la misma razón.
      lifeDraft: null
    }
  };

  /* Freno de mano del repintado.

     La app repinta la vista entera cada vez que llegan datos nuevos, y eso
     está bien en todas partes menos en una: mientras escribes una nota larga.
     Ahí un repintado reconstruye el <textarea> desde cero y el cursor salta al
     principio a mitad de frase. Como el editor guarda solo mientras escribes,
     sin este freno cada autoguardado te tiraría de la línea en la que estabas.

     Lo levanta y lo baja el editor del papel, y cambiar de pestaña lo suelta
     siempre: un freno que se quede echado deja la app aparentemente colgada. */
  S.pausarRender = false;

  S.setView = function (view) {
    S.pausarRender = false;
    S.view = view;
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('active', t.dataset.view === view);
    });
    S.render();
  };

  S.render = function () {
    if (!S.data) return;
    if (S.pausarRender) return;
    const views = {
      today: H.views.today,
      planner: H.views.planner,
      dashboard: H.views.dashboard,
      estudio: H.views.estudio,
      life: H.views.life
    };
    const view = views[S.view];
    if (!view) return;

    // Cada render monta un contenedor nuevo y enlaza los eventos SOBRE EL.
    // Si enlazaramos siempre al mismo nodo #view, cada render acumularia otro
    // listener y a los diez renders un clic se dispararia diez veces.
    const host = H.el('view');
    const fresh = document.createElement('div');
    fresh.innerHTML = view.html(S);
    host.replaceChildren(fresh);
    if (view.bind) view.bind(fresh, S);

    S.renderLive();
  };

  /* El tick de un segundo no debe repintar la pagina entera: solo toca los
     nodos que muestran tiempo en vivo. */
  S.renderLive = function () {
    const ind = H.el('liveIndicator');
    if (S.session) {
      const running = S.session.state === 'running';
      const pending = !!S.session.checkin;
      ind.textContent =
        (pending ? '● Confirmar' : running ? '● ' : '⏸ ') +
        (pending ? '' : H.hms(S.session.countedSec));
      ind.style.color = pending ? 'var(--warn)' : running ? 'var(--pos)' : 'var(--ink-4)';
      ind.style.fontWeight = '600';
    } else {
      ind.textContent = '';
    }

    document.querySelectorAll('[data-live="timer"]').forEach(function (n) {
      n.textContent = S.session ? H.hms(S.session.countedSec) : '00:00:00';
    });
    document.querySelectorAll('[data-live="grace"]').forEach(function (n) {
      if (S.session && S.session.checkin) {
        const left = Math.max(0, Math.ceil((S.session.checkin.deadline - Date.now()) / 1000));
        n.textContent = left + 's';
      }
    });
  };

  /* Toda escritura devuelve el estado ya actualizado y lo aplicamos aquí
     mismo. Sin esto, un modal que lee S.data justo despues de mutar puede
     leer la version vieja: el evento 'state' y la promesa del invoke no
     tienen orden garantizado entre si. */
  S.mutate = async function (type, payload) {
    const res = await window.hq.mutate(type, payload);
    if (res && res.data) S.data = res.data;
    return res;
  };

  H.S = S;
})(window.H);
