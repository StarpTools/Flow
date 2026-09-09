/* El widget aplica el mismo tema que la ventana grande.
   Va en su propio archivo y se carga ANTES que widget.js para que el atributo
   esté puesto en el primer pintado: si se estampara después, el widget
   parpadearía en blanco durante un instante cada vez que arranca. */
(function () {
  'use strict';

  function aplicar(theme) {
    const root = document.documentElement;
    if (theme === 'light' || theme === 'dark') root.setAttribute('data-theme', theme);
    else root.removeAttribute('data-theme');
    if (window.H && window.H.refreshTokens) window.H.refreshTokens();
  }

  window.hq.getState().then(function (st) {
    aplicar(st.data.settings.theme);
  });

  window.hq.onState(function (p) {
    if (!p.tick && p.data) aplicar(p.data.settings.theme);
  });
})();
