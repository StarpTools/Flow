/* Gráficos en SVG a mano.
   Sin librerias: control total del estilo y cero dependencias que actualizar.
   Todas las funciones devuelven una cadena de SVG lista para innerHTML. */
(function (H) {
  'use strict';

  const C = {};

  /* Atajo al resolutor de tokens. Un atributo SVG no entiende var(--accent),
     así que aquí se resuelve al valor real. Es lo que hace que las gráficas
     sigan al color de marca en vez de quedarse ancladas al violeta. */
  const T = function (n) {
    return H.token(n) || '#000';
  };

  function niceTicks(min, max, count) {
    if (min === max) {
      min -= 1;
      max += 1;
    }
    const span = max - min;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const lo = Math.floor(min / step) * step;
    const hi = Math.ceil(max / step) * step;
    const out = [];
    for (let v = lo; v <= hi + step * 0.001; v += step) out.push(Number(v.toFixed(10)));
    return out;
  }

  function emptyBox(w, h, msg) {
    return (
      '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" role="img">' +
      '<rect width="' + w + '" height="' + h + '" fill="none"/>' +
      '<text x="' + w / 2 + '" y="' + h / 2 + '" text-anchor="middle" dominant-baseline="middle" ' +
      'font-size="12" fill="' + T('--ink-4') + '" font-family="' + T('--font') + '">' + H.esc(msg) + '</text>' +
      '</svg>'
    );
  }

  /* Grafico de linea.
     opts: { points: [{x: label, y: number}], height, color, area, zeroLine,
             yFormat: fn, emptyMsg } */
  C.line = function (opts) {
    const pts = opts.points || [];
    const W = 720;
    const Hh = opts.height || 200;
    const padL = 52;
    const padR = 12;
    const padT = 12;
    const padB = 26;

    if (pts.length === 0) return emptyBox(W, Hh, opts.emptyMsg || 'Sin datos todavia');
    if (pts.length === 1) {
      // Un solo punto no dibuja linea; lo mostramos como valor suelto.
      const fmt = opts.yFormat || String;
      return (
        '<svg viewBox="0 0 ' + W + ' ' + Hh + '" width="100%" height="' + Hh + '">' +
        '<text x="' + W / 2 + '" y="' + (Hh / 2 - 6) + '" text-anchor="middle" font-size="20" ' +
        'font-weight="700" fill="' + (opts.color || T('--accent')) + '" font-family="' + T('--font') + '">' +
        H.esc(fmt(pts[0].y)) + '</text>' +
        '<text x="' + W / 2 + '" y="' + (Hh / 2 + 14) + '" text-anchor="middle" font-size="11" ' +
        'fill="' + T('--ink-4') + '" font-family="' + T('--font') + '">' + H.esc(pts[0].x) +
        ' &middot; un solo registro</text></svg>'
      );
    }

    const ys = pts.map(function (p) {
      return p.y;
    });
    let lo = Math.min.apply(null, ys);
    let hi = Math.max.apply(null, ys);
    if (opts.zeroLine) {
      lo = Math.min(lo, 0);
      hi = Math.max(hi, 0);
    }
    const ticks = niceTicks(lo, hi, 4);
    const tLo = ticks[0];
    const tHi = ticks[ticks.length - 1];

    const plotW = W - padL - padR;
    const plotH = Hh - padT - padB;
    const sx = function (i) {
      return padL + (i / (pts.length - 1)) * plotW;
    };
    const sy = function (v) {
      return padT + plotH - ((v - tLo) / (tHi - tLo)) * plotH;
    };

    const fmt = opts.yFormat || function (v) {
      return String(Math.round(v));
    };
    const color = opts.color || T('--accent');

    let svg = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" width="100%" height="' + Hh + '" font-family="' + T('--font') + '">';

    // Rejilla y etiquetas del eje Y
    ticks.forEach(function (t) {
      const y = sy(t);
      svg += '<line x1="' + padL + '" y1="' + y + '" x2="' + (W - padR) + '" y2="' + y +
        '" stroke="' + (t === 0 && opts.zeroLine ? T('--border-strong') : T('--border-hair')) + '" stroke-width="1"/>';
      svg += '<text x="' + (padL - 8) + '" y="' + (y + 3.5) + '" text-anchor="end" font-size="10" fill="' + T('--ink-4') + '">' +
        H.esc(fmt(t)) + '</text>';
    });

    const path = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + sx(i).toFixed(1) + ' ' + sy(p.y).toFixed(1);
    }).join(' ');

    if (opts.area) {
      const base = sy(opts.zeroLine ? Math.max(tLo, 0) : tLo);
      svg += '<path d="' + path + ' L' + sx(pts.length - 1).toFixed(1) + ' ' + base.toFixed(1) +
        ' L' + sx(0).toFixed(1) + ' ' + base.toFixed(1) + ' Z" fill="' + color + '" opacity="0.07"/>';
    }

    svg += '<path d="' + path + '" fill="none" stroke="' + color +
      '" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"/>';

    // Puntos: solo si son pocos, si no se convierte en ruido.
    if (pts.length <= 30) {
      pts.forEach(function (p, i) {
        svg += '<circle cx="' + sx(i).toFixed(1) + '" cy="' + sy(p.y).toFixed(1) +
          '" r="2.5" fill="#fff" stroke="' + color + '" stroke-width="1.5"><title>' +
          H.esc(p.x + ': ' + fmt(p.y)) + '</title></circle>';
      });
    }

    /* Eje X. Tres cuidados que solo se notan con datos reales:
         - la última etiqueta siempre se dibuja, aunque no caiga en el paso;
         - si el paso deja una etiqueta pegada a la última, se descarta esa;
         - dos fechas seguidas pueden formatearse igual, y se deduplica. */
    const last = pts.length - 1;
    const maxLabels = 6;
    const stride = Math.max(1, Math.ceil(pts.length / maxLabels));

    const idx = [];
    for (let i = 0; i < last; i += stride) {
      if (last - i < stride * 0.6) break;
      idx.push(i);
    }
    idx.push(last);

    let prevText = null;
    idx.forEach(function (i) {
      const p = pts[i];
      if (p.x === prevText) return;
      prevText = p.x;
      // Los extremos se anclan hacia dentro; centrados se saldrían del
      // viewBox y el navegador los recorta.
      const anchor = i === 0 ? 'start' : i === last ? 'end' : 'middle';
      svg += '<text x="' + sx(i).toFixed(1) + '" y="' + (Hh - 8) +
        '" text-anchor="' + anchor + '" font-size="10" fill="' + T('--ink-4') + '">' + H.esc(p.x) + '</text>';
    });

    return svg + '</svg>';
  };

  /* Barras horizontales. Ideal para comparar spots o actividades.
     opts: { items: [{label, value, color, sub}], height, valueFormat, emptyMsg } */
  C.bars = function (opts) {
    const items = (opts.items || []).filter(function (i) {
      return i.value > 0;
    });
    const W = 720;
    const rowH = 26;
    const Hh = Math.max(60, items.length * rowH + 8);

    if (!items.length) return emptyBox(W, 90, opts.emptyMsg || 'Sin datos todavia');

    const max = Math.max.apply(null, items.map(function (i) {
      return i.value;
    }));
    const labelW = 150;
    const valueW = 74;
    const barW = W - labelW - valueW - 12;
    const fmt = opts.valueFormat || String;

    let svg = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" width="100%" height="' + Hh + '" font-family="' + T('--font') + '">';

    items.forEach(function (it, i) {
      const y = i * rowH + 4;
      const w = Math.max(2, (it.value / max) * barW);
      const color = it.color || T('--accent');

      svg += '<text x="0" y="' + (y + 14) + '" font-size="12" fill="' + T('--ink-2') + '">' +
        H.esc(it.label.length > 22 ? it.label.slice(0, 21) + '…' : it.label) +
        '<title>' + H.esc(it.label) + '</title></text>';
      svg += '<rect x="' + labelW + '" y="' + (y + 5) + '" width="' + barW +
        '" height="12" rx="3" fill="' + T('--bg-sunken') + '"/>';
      svg += '<rect x="' + labelW + '" y="' + (y + 5) + '" width="' + w.toFixed(1) +
        '" height="12" rx="3" fill="' + color + '"/>';
      svg += '<text x="' + (labelW + barW + 10) + '" y="' + (y + 14) +
        '" font-size="11" font-weight="600" fill="' + T('--ink') + '">' + H.esc(fmt(it.value)) + '</text>';
    });

    return svg + '</svg>';
  };

  /* Barras verticales por periodo (días de la semana, meses del año).
     opts: { items: [{label, value, muted}], height, valueFormat, color } */
  C.columns = function (opts) {
    const items = opts.items || [];
    const W = 720;
    const Hh = opts.height || 160;
    const padB = 24;
    const padT = 10;

    if (!items.length) return emptyBox(W, Hh, opts.emptyMsg || 'Sin datos');

    const max = Math.max(1, Math.max.apply(null, items.map(function (i) {
      return i.value;
    })));
    const slot = W / items.length;
    const barW = Math.min(38, slot * 0.6);
    const plotH = Hh - padT - padB;
    const fmt = opts.valueFormat || String;
    const color = opts.color || T('--accent');

    let svg = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" width="100%" height="' + Hh + '" font-family="' + T('--font') + '">';
    svg += '<line x1="0" y1="' + (padT + plotH) + '" x2="' + W + '" y2="' + (padT + plotH) +
      '" stroke="' + T('--border') + '" stroke-width="1"/>';

    items.forEach(function (it, i) {
      const h = (it.value / max) * plotH;
      const x = i * slot + (slot - barW) / 2;
      const y = padT + plotH - h;
      svg += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + barW.toFixed(1) +
        '" height="' + Math.max(0, h).toFixed(1) + '" rx="3" fill="' + color +
        '" opacity="' + (it.muted ? 0.28 : 1) + '"><title>' +
        H.esc(it.label + ': ' + fmt(it.value)) + '</title></rect>';
      if (h > 16) {
        // La barra más alta llega al tope: ahí la cifra va DENTRO, porque
        // encima quedaria fuera del viewBox y el navegador la recorta.
        const inside = y < 14;
        svg += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' +
          (inside ? y + 13 : y - 4).toFixed(1) +
          '" text-anchor="middle" font-size="10" font-weight="600" fill="' +
          (inside ? T('--ink-on-accent') : T('--ink-2')) + '">' + H.esc(fmt(it.value)) + '</text>';
      }
      svg += '<text x="' + (x + barW / 2).toFixed(1) + '" y="' + (Hh - 7) +
        '" text-anchor="middle" font-size="10" fill="' + T('--ink-4') + '">' + H.esc(it.label) + '</text>';
    });

    return svg + '</svg>';
  };

  H.charts = C;
})(window.H);
