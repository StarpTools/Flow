/* Arranque de la ventana principal. */
(function (H) {
  'use strict';

  const S = H.S;

  /* El tema se estampa en <html> como data-theme. 'system' no estampa nada:
     así manda prefers-color-scheme, que es justo lo que espera alguien que no
     ha elegido. Al cambiar hay que tirar la caché de tokens o las gráficas
     SVG se quedarían con los colores del tema anterior. */
  function applyTheme(theme) {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    H.refreshTokens();
  }

  function applyState(payload) {
    if (payload.tick) {
      // Tic de un segundo: solo refrescamos los nodos de tiempo en vivo.
      // Repintar la pagina entera cada segundo tiraria el foco de cualquier
      // campo que estes escribiendo.
      S.session = payload.session;
      S.renderLive();
      return;
    }
    const temaAntes = S.data && S.data.settings.theme;
    S.data = payload.data;
    S.session = payload.session;
    if (S.data.settings.theme !== temaAntes) applyTheme(S.data.settings.theme);
    avisoGuardado(payload.errorGuardado);
    S.render();
  }

  /* Un guardado que falla en silencio es la peor forma de perder datos: sigues
     trabajando una hora creyendo que se guarda. Se avisa arriba del todo y no
     se puede cerrar, porque no es una notificación: es un problema activo. */
  function avisoGuardado(err) {
    const el = H.el('avisoGuardado');
    if (!el) return;
    if (!err) {
      el.classList.add('hidden');
      return;
    }
    el.textContent = 'No se están guardando tus datos: ' + err.mensaje +
      ' — copia lo importante y revisa el espacio en disco o el antivirus.';
    el.classList.remove('hidden');
  }

  async function boot() {
    const st = await window.hq.getState();
    S.data = st.data;
    S.session = st.session;
    S.dataPath = st.dataPath;

    applyTheme(st.data.settings.theme);

    // Si el tema es 'system', hay que repintar cuando el sistema cambie:
    // Windows lo hace solo al anochecer si está en automático.
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', function () {
      if (!S.data || S.data.settings.theme === 'system') {
        H.refreshTokens();
        S.render();
      }
    });

    const now = new Date();
    S.ui.planMonth = { y: now.getFullYear(), m: now.getMonth() };
    /* Estudio abre en el primer estante y SIN tema abierto: la oficina empieza
       por fuera, y entrar directamente a un cajón se salta el nivel que dice
       qué hay. */
    S.ui.estGrupo = (st.data.spotGroups[0] || {}).id || null;
    if (st.data.areas.length) S.ui.areaId = st.data.areas[0].id;

    H.el('tabs').addEventListener('click', function (e) {
      const tab = e.target.closest('.tab');
      if (tab) S.setView(tab.dataset.view);
    });

    H.el('btnWidget').addEventListener('click', function () {
      window.hq.widget.setVisible(!S.data.settings.widgetEnabled);
    });

    H.el('btnSettings').addEventListener('click', function () {
      H.modals.settings(S);
    });

    // Atajos: 1-4 cambian de vista si no estás escribiendo en un campo.
    document.addEventListener('keydown', function (e) {
      const tag = (e.target.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      const map = { 1: 'today', 2: 'planner', 3: 'dashboard', 4: 'estudio', 5: 'life' };
      if (map[e.key]) S.setView(map[e.key]);
    });

    window.hq.onState(applyState);

    S.render();

    // El widget puede estar abierto o no; el botón refleja el estado real.
    setInterval(function () {
      if (!S.data) return;
      H.el('btnWidget').textContent = S.data.settings.widgetEnabled ? 'Ocultar widget' : 'Widget';
    }, 500);
  }

  document.addEventListener('DOMContentLoaded', boot);
})(window.H);
