/* Prepara los assets de marca a partir de los PNG originales.
   Uso: electron tools/logos.js

   Por que a mano y no con nativeImage.crop()/createFromBitmap():
   en este equipo crop() reporta el tamanio correcto pero devuelve un buffer
   de otro tamanio (1.872.660 bytes para una imagen de 305x315, que necesita
   384.300), y createFromBitmap() rechaza el buffer. Lo unico verificado como
   exacto es createFromPath()+getBitmap() sobre el original, asi que partimos
   de ahi y hacemos el resto sobre los pixeles crudos. */
const { app, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC = path.join(__dirname, '..');
const OUT = path.join(__dirname, '..', 'app', 'assets');

// --- PNG: codificador minimo (RGBA de 8 bits, sin entrelazado) -------------

const CRC_TABLE = (function () {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/* rgba: Buffer RGBA sin premultiplicar, width*height*4 */
function encodePNG(rgba, width, height) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bits por canal
  ihdr[9] = 6;  // color type 6 = RGBA
  ihdr[10] = 0; // compresion deflate
  ihdr[11] = 0; // filtrado estandar
  ihdr[12] = 0; // sin entrelazado

  // Una linea por fila, cada una precedida del byte de filtro (0 = ninguno).
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const o = y * (width * 4 + 1);
    raw[o] = 0;
    rgba.copy(raw, o + 1, y * width * 4, (y + 1) * width * 4);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ICO: contenedor de varias imagenes. Windows Vista en adelante acepta PNG
   dentro, asi que reusamos los PNG ya generados sin pasar por BMP.
   Hace falta un .ico de verdad porque los accesos directos de Windows no
   admiten PNG como icono. */
function encodeICO(imagenes) {
  const dir = Buffer.alloc(6);
  dir.writeUInt16LE(0, 0); // reservado
  dir.writeUInt16LE(1, 2); // 1 = icono
  dir.writeUInt16LE(imagenes.length, 4);

  const entradas = [];
  const datos = [];
  let offset = 6 + imagenes.length * 16;

  for (const im of imagenes) {
    const png = encodePNG(im.rgba, im.width, im.height);
    const e = Buffer.alloc(16);
    // Un 0 significa 256: por eso el icono grande se declara como 0.
    e[0] = im.width >= 256 ? 0 : im.width;
    e[1] = im.height >= 256 ? 0 : im.height;
    e[2] = 0; // colores de paleta
    e[3] = 0; // reservado
    e.writeUInt16LE(1, 4);  // planos
    e.writeUInt16LE(32, 6); // bits por pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entradas.push(e);
    datos.push(png);
  }

  return Buffer.concat([dir, ...entradas, ...datos]);
}

// --- Lectura del original ---------------------------------------------------

/* Devuelve RGBA sin premultiplicar. getBitmap() entrega BGRA y, segun la
   plataforma, con alfa premultiplicado; se detecta y se revierte, porque si
   no los bordes suavizados salen oscurecidos al recomponer. */
function leer(file) {
  const img = nativeImage.createFromPath(path.join(SRC, file));
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  const bgra = img.getBitmap();
  if (bgra.length !== width * height * 4) {
    throw new Error(file + ': buffer inesperado ' + bgra.length +
      ' (esperado ' + width * height * 4 + ')');
  }

  let premultiplicado = true;
  for (let i = 0; i < bgra.length; i += 4) {
    const a = bgra[i + 3];
    if (bgra[i] > a || bgra[i + 1] > a || bgra[i + 2] > a) { premultiplicado = false; break; }
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < bgra.length; i += 4) {
    const a = bgra[i + 3];
    let r = bgra[i + 2], g = bgra[i + 1], b = bgra[i];
    if (premultiplicado && a > 0 && a < 255) {
      r = Math.min(255, Math.round((r * 255) / a));
      g = Math.min(255, Math.round((g * 255) / a));
      b = Math.min(255, Math.round((b * 255) / a));
    }
    rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = a;
  }
  return { rgba, width, height, premultiplicado };
}

// --- Operaciones sobre pixeles ---------------------------------------------

function bbox(im) {
  let minX = im.width, minY = im.height, maxX = -1, maxY = -1, visibles = 0;
  for (let y = 0; y < im.height; y++) {
    for (let x = 0; x < im.width; x++) {
      if (im.rgba[(y * im.width + x) * 4 + 3] <= 16) continue;
      visibles++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1, visibles };
}

function recortar(im, r) {
  const out = Buffer.alloc(r.width * r.height * 4);
  for (let y = 0; y < r.height; y++) {
    const src = ((y + r.y) * im.width + r.x) * 4;
    im.rgba.copy(out, y * r.width * 4, src, src + r.width * 4);
  }
  return { rgba: out, width: r.width, height: r.height };
}

/* Cuadrado transparente con la imagen centrada y un margen proporcional. */
function cuadrar(im, margenPct) {
  const lado = Math.max(im.width, im.height);
  const L = lado + Math.round(lado * margenPct) * 2;
  const out = Buffer.alloc(L * L * 4, 0);
  const offX = Math.round((L - im.width) / 2);
  const offY = Math.round((L - im.height) / 2);
  for (let y = 0; y < im.height; y++) {
    const src = y * im.width * 4;
    im.rgba.copy(out, ((y + offY) * L + offX) * 4, src, src + im.width * 4);
  }
  return { rgba: out, width: L, height: L };
}

/* Reduccion por promedio de area. Para achicar da mejor resultado que el
   muestreo simple: los bordes de los circulos quedan limpios en 32px. */
function escalar(im, w, h) {
  const out = Buffer.alloc(w * h * 4);
  const fx = im.width / w;
  const fy = im.height / h;

  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.min(im.height, Math.ceil((y + 1) * fy)));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.min(im.width, Math.ceil((x + 1) * fx)));

      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) {
        for (let sx = x0; sx < x1; sx++) {
          const i = (sy * im.width + sx) * 4;
          const al = im.rgba[i + 3];
          // El color se pondera por alfa: promediar el RGB de pixeles
          // transparentes arrastraria negro hacia los bordes.
          r += im.rgba[i] * al;
          g += im.rgba[i + 1] * al;
          b += im.rgba[i + 2] * al;
          a += al;
          n++;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) {
        out[o] = Math.round(r / a);
        out[o + 1] = Math.round(g / a);
        out[o + 2] = Math.round(b / a);
        out[o + 3] = Math.round(a / n);
      }
    }
  }
  return { rgba: out, width: w, height: h };
}

function guardar(im, nombre) {
  fs.writeFileSync(path.join(OUT, nombre), encodePNG(im.rgba, im.width, im.height));
  const kb = (fs.statSync(path.join(OUT, nombre)).size / 1024).toFixed(1);
  const vis = bbox(im);
  console.log('   ' + nombre.padEnd(16) + im.width + 'x' + im.height +
    '  ' + kb + ' KB  ' + (vis ? vis.visibles + ' px visibles' : 'VACIA'));
}

// --- Proceso ---------------------------------------------------------------

app.whenReady().then(() => {
  try {
    if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

    // 1. Logo completo para la cabecera --------------------------------
    const c = leer('Flow logo C.png');
    const cb = bbox(c);
    console.log('Flow logo C.png  ' + c.width + 'x' + c.height +
      ' | contenido ' + cb.width + 'x' + cb.height + ' | alfa ' +
      (c.premultiplicado ? 'premultiplicado' : 'directo'));
    const logo = recortar(c, cb);
    const hBase = 22; // altura util en una barra de 52px
    guardar(escalar(logo, Math.round((cb.width / cb.height) * hBase * 2), hBase * 2), 'logo.png');
    guardar(escalar(logo, Math.round((cb.width / cb.height) * hBase * 3), hBase * 3), 'logo@3x.png');

    /* Variante para fondo oscuro. No sirve un filter: invert() en CSS porque
       volvería cian los puntos rojos. Se recolorea SOLO la parte gris (el
       logotipo), detectada por saturación baja; el isotipo se queda igual. */
    const oscuro = { rgba: Buffer.from(logo.rgba), width: logo.width, height: logo.height };
    const TINTA_CLARA = [232, 236, 242]; // --c-d-100
    let recoloreados = 0;
    for (let i = 0; i < oscuro.rgba.length; i += 4) {
      if (oscuro.rgba[i + 3] < 8) continue;
      const r = oscuro.rgba[i], g = oscuro.rgba[i + 1], b = oscuro.rgba[i + 2];
      const sat = Math.max(r, g, b) - Math.min(r, g, b);
      if (sat > 40) continue; // tiene color propio: es el isotipo, no se toca
      oscuro.rgba[i] = TINTA_CLARA[0];
      oscuro.rgba[i + 1] = TINTA_CLARA[1];
      oscuro.rgba[i + 2] = TINTA_CLARA[2];
      recoloreados++;
    }
    guardar(escalar(oscuro, Math.round((cb.width / cb.height) * hBase * 2), hBase * 2), 'logo-dark.png');
    guardar(escalar(oscuro, Math.round((cb.width / cb.height) * hBase * 3), hBase * 3), 'logo-dark@3x.png');
    console.log('   ' + recoloreados + ' px del logotipo recoloreados; isotipo intacto');

    // 2. Isotipo cuadrado para el icono --------------------------------
    const i = leer('Flow logo I.png');
    const ib = bbox(i);
    console.log('Flow logo I.png  ' + i.width + 'x' + i.height +
      ' | contenido ' + ib.width + 'x' + ib.height +
      ' (ocupa ' + ((ib.width * ib.height) / (i.width * i.height) * 100).toFixed(1) + '% del lienzo)');
    const iso = cuadrar(recortar(i, ib), 0.12);
    const tamanos = [256, 128, 64, 48, 32, 16];
    const escalados = {};
    for (const px of [512].concat(tamanos)) {
      escalados[px] = escalar(iso, px, px);
      guardar(escalados[px], 'icon-' + px + '.png');
    }
    fs.copyFileSync(path.join(OUT, 'icon-256.png'), path.join(OUT, 'icon.png'));
    console.log('   icon.png        copia de icon-256.png');

    // 3. .ico para el acceso directo de Windows -------------------------
    const ico = encodeICO(tamanos.map(function (px) { return escalados[px]; }));
    fs.writeFileSync(path.join(OUT, 'flow.ico'), ico);
    console.log('   flow.ico        ' + tamanos.join('/') + ' px  ' +
      (ico.length / 1024).toFixed(1) + ' KB');
  } catch (err) {
    console.log('ERROR: ' + err.message + '\n' + err.stack);
  }
  app.quit();
});
