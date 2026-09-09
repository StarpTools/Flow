/* Formato de las notas — un markdown recortado a propósito.

   Por qué marcas de teclado (**negrita**) y no una barra de herramientas que
   inserta HTML: lo que se guarda en el disco sigue siendo texto plano. Se
   puede leer, buscar con grep y respaldar sin abrir Flow. Un editor que
   guarda HTML te ata al programa que lo escribió, y estas notas van a durar
   más que cualquier versión de esta app.

   Por qué un recorte y no markdown entero: tres tamaños de título, negrita,
   cursiva, subrayado, tachado, listas y una línea divisoria. Nada más. Un
   bloc con nueve niveles de encabezado deja de estar ordenado, que es
   justamente lo que se venía a arreglar.

   Aquí solo vive la gramática: funciones puras, sin interfaz y sin datos.
   Por eso se puede probar desde node y por eso tools/prueba-notas.js vale
   algo.

   Las marcas:
     # ## ###     los tres tamaños de título
     **texto**    negrita
     *texto*      cursiva
     ***texto***  las dos
     __texto__    subrayado
     ~~texto~~    tachado
     - texto      lista con puntos (también vale "* texto")
     1. texto     lista numerada
     !! texto     caja de alerta
     >> texto     caja de nota importante
     #etiqueta    etiqueta
     ---          línea divisoria

   Un solo guion bajo NO hace nada, a propósito: en notas de poker aparecen
   nombres como check_raise o hero_call, y subrayar medio nombre por accidente
   es peor que no tener subrayado.

   Una etiqueta tiene que empezar por letra: así "#1" o "#3bet" siguen siendo
   texto normal y no se convierten en etiquetas por accidente. */
(function (raiz) {
  'use strict';

  const N = {};

  /* Escapar ANTES de aplicar formato, nunca después: si se hiciera al revés,
     los <strong> que acabamos de poner se convertirían en texto visible. */
  N.escapar = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  /* Marcas de dentro de una línea. Se aplica sobre texto YA escapado.

     El orden importa. La triple va primero porque si pasara antes la doble,
     ***x*** se partiría en <strong>*x</strong>* y la cursiva posterior
     cerraría las etiquetas cruzadas. */
  N.enLinea = function (txt) {
    /* Los enlaces a imágenes se apartan ANTES de aplicar nada más y se
       devuelven al final. No basta con procesarlos primero: el nombre se
       quedaría en la cadena y las marcas siguientes seguirían entrando dentro,
       así que un [[mapa *general*]] acabaría con una cursiva metida en el
       nombre y el enlace dejaría de coincidir con la imagen guardada. */
    const apartadas = [];
    const conMarcadores = String(txt).replace(N.RE_IMAGEN, function (_, nombre) {
      apartadas.push(nombre);
      return '<<' + (apartadas.length - 1) + '>>';
    });

    return conMarcadores
      .replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(?=\S)([^*]*?\S|\S)\*/g, '<em>$1</em>')
      .replace(/__(?=\S)([\s\S]*?\S)__/g, '<u>$1</u>')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>')
      // La cerrada primero: si pasara antes la suelta, "#control de
      // versiones#" se quedaría etiquetado solo en "control".
      .replace(N.RE_ETIQUETA_CERRADA, '$1<span class="nota-tag">#$2</span>')
      .replace(N.RE_ETIQUETA, '$1<span class="nota-tag">#$2</span>')
      /* Se devuelven al final. El marcador es <<n>>, y no puede colisionar con
         nada escrito: enLinea trabaja sobre texto YA escapado, donde un "<"
         suelto es imposible. */
      .replace(/<<(\d+)>>/g, function (_, i) {
        const n = apartadas[Number(i)];
        return '<span class="nota-img" data-act="verImagen" data-nombre="' +
          n + '">' + n + '</span>';
      });
  };

  /* Etiquetas, en dos formas.

     #palabra          una sola palabra
     #varias palabras# cerrada, para etiquetas de más de una palabra

     Las dos empiezan por letra, así "#1" y "#3bet" siguen siendo texto. Y las
     dos tienen que ir pegadas a un espacio, al principio de la línea o detrás
     de un paréntesis: sin eso, cualquier almohadilla dentro de una palabra
     (una URL con ancla, por ejemplo) se convertiría en etiqueta.

     La cerrada exige que el carácter antes de la almohadilla final NO sea un
     espacio. Sin esa condición, "#git y #push" se leería como una sola
     etiqueta cerrada llamada "git y " y se comería la segunda. */
  /* Enlaces a las imágenes del papel: [[nombre]].

     Al pulsarlos la imagen sale en el panel de la derecha, sin tapar el texto
     que estabas leyendo. Por eso son un enlace y no una imagen incrustada: una
     captura de pantalla metida en medio parte la lectura en dos, y al volver a
     leer el párrafo tienes que saltarla.

     El nombre puede llevar espacios y acentos; solo no puede llevar corchetes
     ni saltos de línea. */
  N.RE_IMAGEN = /\[\[([^\]\n]+)\]\]/g;

  // Los nombres de imagen que cita un texto, sin repetidos.
  N.imagenesCitadas = function (texto) {
    const vistas = [];
    const re = new RegExp(N.RE_IMAGEN.source, 'g');
    let m;
    while ((m = re.exec(String(texto == null ? '' : texto))) !== null) {
      const n = m[1].trim();
      if (n && vistas.indexOf(n) === -1) vistas.push(n);
    }
    return vistas;
  };

  N.RE_ETIQUETA_CERRADA = /(^|[\s(¡¿])#(\p{L}(?:[^#\n]*[^#\s])?)#/gu;
  N.RE_ETIQUETA = /(^|[\s(¡¿])#(\p{L}[\p{L}\p{N}_-]*)/gu;

  N.NIVELES = 3;

  /* Las dos cajas. Comparten mecánica con las listas: líneas seguidas con la
     misma marca forman UNA caja, y una línea en blanco la cierra. Así una
     advertencia de tres frases no obliga a repetir la marca mentalmente como
     si fueran tres avisos distintos. */
  N.CAJAS = [
    { marca: '!! ', clase: 'alerta', patron: /^!!\s*(.+)$/ },
    { marca: '>> ', clase: 'importante', patron: /^>>\s*(.+)$/ }
  ];

  /* Cajas cerradas: se abren y se cierran, como los paréntesis.

       !Cuidado con esto!        una línea
       >Recuerda esto<           la otra caja

     Y abarcan varias líneas, que es de lo que sirven de verdad:

       !Esto es importante:
       porque si no lo miras
       te cuesta dinero!

     Conviven con las marcas de línea (!! y >>). La cerrada gana cuando la
     línea empieza por una sola marca; "!! texto" lo sigue cogiendo la de
     línea, por el (?!!) del patrón.

     Una caja sin cerrar se cierra en la primera línea en blanco. Es una
     concesión a propósito: sin ella, un "!" suelto al principio de una línea
     se tragaría el resto de la nota entera dentro de un recuadro ámbar. */
  N.CAJAS_CERRADAS = [
    { clase: 'alerta', abre: /^!(?!!)(.*)$/, cierra: '!', marca: '!' },
    { clase: 'importante', abre: /^>(?!>)(.*)$/, cierra: '<', marca: '>' }
  ];

  /* De texto a HTML. Se procesa línea a línea: ninguna marca cruza un salto
     de línea, así que un ** sin cerrar estropea como mucho su propia línea en
     vez de arrastrar el resto de la nota. */
  N.aHtml = function (texto) {
    const lineas = String(texto == null ? '' : texto).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let lista = null;
    let caja = null;
    let parrafo = [];

    function cerrarParrafo() {
      if (!parrafo.length) return;
      // Salto simple dentro de un párrafo = <br>. Escribir dos líneas
      // seguidas y ver una sola es lo que hace que un bloc se sienta roto.
      out.push('<p>' + parrafo.join('<br>') + '</p>');
      parrafo = [];
    }

    function cerrarLista() {
      if (!lista) return;
      out.push('</' + lista + '>');
      lista = null;
    }

    function abrirLista(tipo) {
      if (lista === tipo) return;
      cerrarLista();
      out.push('<' + tipo + '>');
      lista = tipo;
    }

    function cerrarCaja() {
      if (!caja) return;
      out.push('</div>');
      caja = null;
    }

    function abrirCaja(clase) {
      if (caja === clase) {
        // Segunda línea seguida de la misma caja: va dentro, no en otra caja.
        out.push('<br>');
        return;
      }
      cerrarCaja();
      out.push('<div class="nota-caja ' + clase + '">');
      caja = clase;
    }

    function cerrarBloques() {
      cerrarParrafo();
      cerrarLista();
      cerrarCaja();
    }

    // Caja cerrada en curso: qué marca la cierra, mientras siga abierta.
    let cerrandoCon = null;

    for (const cruda of lineas) {
      const linea = cruda.trim();

      if (!linea) {
        cerrandoCon = null;
        cerrarBloques();
        continue;
      }

      // Dentro de una caja cerrada de varias líneas: todo va dentro hasta que
      // aparezca la marca de cierre.
      if (cerrandoCon) {
        const cierra = linea.slice(-1) === cerrandoCon;
        const dentro = cierra ? linea.slice(0, -1) : linea;
        out.push('<br>' + N.enLinea(N.escapar(dentro)));
        if (cierra) { cerrandoCon = null; cerrarCaja(); }
        continue;
      }

      if (/^-{3,}$/.test(linea)) {
        cerrarBloques();
        out.push('<hr>');
        continue;
      }

      const enCaja = N.CAJAS.filter(function (c) { return c.patron.test(linea); })[0];
      if (enCaja) {
        cerrarParrafo();
        cerrarLista();
        abrirCaja(enCaja.clase);
        out.push(N.enLinea(N.escapar(linea.match(enCaja.patron)[1])));
        continue;
      }

      // Caja cerrada: !texto! · >texto< · o abierta aquí y cerrada más abajo.
      let abrio = false;
      for (const c of N.CAJAS_CERRADAS) {
        const m = linea.match(c.abre);
        if (!m || !m[1]) continue;
        const cierraAqui = m[1].length > 0 && m[1].slice(-1) === c.cierra;
        const dentro = cierraAqui ? m[1].slice(0, -1) : m[1];
        // "!!" sin nada dentro no es una caja, es texto.
        if (cierraAqui && !dentro) break;
        cerrarParrafo();
        cerrarLista();
        cerrarCaja();
        out.push('<div class="nota-caja ' + c.clase + '">');
        caja = c.clase;
        out.push(N.enLinea(N.escapar(dentro)));
        if (cierraAqui) cerrarCaja();
        else cerrandoCon = c.cierra;
        abrio = true;
        break;
      }
      if (abrio) continue;

      // #### (cuatro) no es un título: solo hay tres tamaños y el cuarto se
      // queda como texto, que es menos sorprendente que degradarlo en silencio.
      const titulo = linea.match(/^(#{1,3})\s+(.+)$/);
      if (titulo) {
        cerrarBloques();
        const n = titulo[1].length;
        out.push('<h' + n + '>' + N.enLinea(N.escapar(titulo[2])) + '</h' + n + '>');
        continue;
      }

      // "* texto" lleva espacio; *cursiva* no. Por eso no chocan.
      const punto = linea.match(/^[-*]\s+(.*)$/);
      if (punto) {
        cerrarParrafo();
        cerrarCaja();
        abrirLista('ul');
        out.push('<li>' + N.enLinea(N.escapar(punto[1])) + '</li>');
        continue;
      }

      const numero = linea.match(/^\d+[.)]\s+(.*)$/);
      if (numero) {
        cerrarParrafo();
        cerrarCaja();
        abrirLista('ol');
        out.push('<li>' + N.enLinea(N.escapar(numero[1])) + '</li>');
        continue;
      }

      cerrarLista();
      cerrarCaja();
      parrafo.push(N.enLinea(N.escapar(linea)));
    }

    cerrarBloques();
    return out.join('');
  };

  /* Las etiquetas que lleva una nota, sin repetidas y en el orden en que
     aparecen. Es lo que permite juntar en el bloc todo lo etiquetado igual sin
     guardar nada aparte: la etiqueta vive dentro del texto, así que no puede
     desincronizarse con él. */
  N.etiquetas = function (texto) {
    const vistas = [];
    let t = String(texto == null ? '' : texto);

    // Regex propias y no las compartidas: una /g guarda lastIndex entre
    // llamadas, y compartirlas con enLinea haría que a veces se saltara la
    // primera.
    const cerradas = new RegExp(N.RE_ETIQUETA_CERRADA.source, 'gu');
    let m;
    while ((m = cerradas.exec(t)) !== null) {
      if (vistas.indexOf(m[2]) === -1) vistas.push(m[2]);
    }
    // Las cerradas se sacan del texto antes de buscar las sueltas: si no,
    // "#varias palabras#" contaría además como la etiqueta suelta "varias".
    t = t.replace(new RegExp(N.RE_ETIQUETA_CERRADA.source, 'gu'), '$1');

    const sueltas = new RegExp(N.RE_ETIQUETA.source, 'gu');
    while ((m = sueltas.exec(t)) !== null) {
      if (vistas.indexOf(m[2]) === -1) vistas.push(m[2]);
    }
    return vistas;
  };

  /* Texto sin marcas. Es lo que se busca y lo que se enseña en las listas:
     un resumen que empiece por "## " le dice al ojo que hay un fallo. */
  N.aTextoPlano = function (texto) {
    return String(texto == null ? '' : texto)
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map(function (l) {
        return l
          .trim()
          .replace(/^#{1,3}\s+/, '')
          .replace(/^[-*]\s+/, '')
          .replace(/^\d+[.)]\s+/, '')
          .replace(/^(!!|>>)\s*/, '')
          .replace(/^-{3,}$/, '')
          // El nombre de la imagen se queda, los corchetes no: en un extracto
          // "[[esquema]]" es ruido y "esquema" dice algo.
          .replace(/\[\[([^\]\n]+)\]\]/g, '$1')
          .replace(/\*\*\*|\*\*|\*|__|~~/g, '');
      })
      .filter(function (l) { return l !== ''; })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  /* Cuántas palabras tiene la nota, sin contar las marcas.

     Sirve para avisar de lo que este bloc no puede impedir por sí solo: una
     tarjeta de repaso tiene que contestarse en diez segundos. Un documento de
     mil palabras no se recuerda, se relee — y releer es de los métodos de
     estudio más flojos que hay. El aviso no bloquea nada: la nota larga es
     legítima, lo que no lo es es preguntártela como si fuera una tarjeta. */
  N.palabras = function (texto) {
    const plano = N.aTextoPlano(texto);
    if (!plano) return 0;
    return plano.split(/\s+/).length;
  };

  // Por encima de aquí una nota ya no es una tarjeta. No es una frontera
  // exacta —no la hay— pero sí el orden de magnitud: una tarjeta buena tiene
  // veinte o treinta palabras, y ciento cincuenta ya son media pantalla.
  N.PALABRAS_MAX_TARJETA = 150;

  N.resumen = function (texto, max) {
    const plano = N.aTextoPlano(texto);
    const tope = max || 140;
    if (plano.length <= tope) return plano;
    // Cortar por palabra: media palabra partida se lee como un error de datos.
    const corte = plano.slice(0, tope);
    const espacio = corte.lastIndexOf(' ');
    return (espacio > tope * 0.6 ? corte.slice(0, espacio) : corte) + '…';
  };

  // --- Lo que hacen los botones de la barra ---------------------------------

  /* Envolver la selección con una marca, o quitarla si ya está.

     Va aquí y no en la vista porque es donde se rompe sin avisar: un botón de
     negrita que devuelve mal las posiciones deja el cursor a tres caracteres
     de donde estaba y escribes encima de tu propia nota.

     Devuelve { texto, desde, hasta } con la selección ya recolocada. */
  /* `cierre` sirve para las marcas que no son simétricas: la caja de nota
     importante se escribe >así< y abre con un signo y cierra con otro. Cuando
     no se pasa, cierra con la misma marca con la que abre. */
  N.envolver = function (texto, desde, hasta, marca, cierre) {
    const t = String(texto == null ? '' : texto);
    const a = Math.max(0, Math.min(t.length, desde));
    const b = Math.max(a, Math.min(t.length, hasta));
    const fin = cierre || marca;
    const m = marca.length;
    const f = fin.length;

    const dentro = t.slice(a, b);

    // Ya marcado por fuera: "**|texto|**" -> se quita.
    if (t.slice(Math.max(0, a - m), a) === marca && t.slice(b, b + f) === fin) {
      return {
        texto: t.slice(0, a - m) + dentro + t.slice(b + f),
        desde: a - m,
        hasta: b - m
      };
    }

    // Ya marcado por dentro: "|**texto**|" -> se quita.
    if (dentro.length >= m + f && dentro.slice(0, m) === marca && dentro.slice(-f) === fin) {
      const limpio = dentro.slice(m, -f);
      return { texto: t.slice(0, a) + limpio + t.slice(b), desde: a, hasta: a + limpio.length };
    }

    // Sin selección: se dejan las marcas y el cursor en medio, listo para escribir.
    if (a === b) {
      return { texto: t.slice(0, a) + marca + fin + t.slice(a), desde: a + m, hasta: a + m };
    }

    return {
      texto: t.slice(0, a) + marca + dentro + fin + t.slice(b),
      desde: a + m,
      hasta: b + m
    };
  };

  /* Poner (o quitar) un prefijo de línea: títulos, puntos, numeración.

     Actúa sobre TODAS las líneas que toca la selección, que es lo que espera
     cualquiera que haya usado un editor: seleccionas cinco líneas, pulsas
     lista, y salen cinco puntos. */
  N.prefijar = function (texto, desde, hasta, prefijo) {
    const t = String(texto == null ? '' : texto);
    const a = Math.max(0, Math.min(t.length, desde));
    const b = Math.max(a, Math.min(t.length, hasta));

    const iniLinea = t.lastIndexOf('\n', a - 1) + 1;
    const finBusca = t.indexOf('\n', b);
    const finLinea = finBusca === -1 ? t.length : finBusca;

    const bloque = t.slice(iniLinea, finLinea).split('\n');
    const numerado = /^\d+[.)]\s$/.test(prefijo);

    const patron = numerado ? /^\d+[.)]\s+/ : new RegExp('^' + prefijo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    /* Las líneas en blanco de una selección de varias no se marcan: seleccionas
       un párrafo con un hueco en medio, pulsas lista, y el hueco sigue siendo
       un hueco.

       Pero si TODO lo seleccionado está en blanco —el caso de una nota recién
       creada, con el cursor en la primera línea vacía— hay que marcarla igual.
       Sin esta distinción el botón no hacía absolutamente nada sobre una nota
       vacía, que es justo cuando más se usa: abres una nota y lo primero que
       quieres es escribir una alerta. */
    const conTexto = bloque.filter(function (l) { return l.trim() !== ''; });
    const vacio = conTexto.length === 0;

    // Si TODAS las que tienen texto ya lo llevan, el botón lo quita. Si solo
    // algunas, lo pone en todas: eso hace que pulsar dos veces sea reversible.
    const todas = !vacio && conTexto.every(function (l) { return patron.test(l); });

    const nuevo = bloque.map(function (l, i) {
      if (l.trim() === '' && !vacio) return l;
      // Fuera cualquier prefijo previo: una línea no puede ser título y punto
      // de lista a la vez, y encadenarlos produce "## - ## texto".
      const desnudo = l.replace(/^(#{1,3}\s+|[-*]\s+|\d+[.)]\s+|!!\s*|>>\s*)/, '');
      if (todas) return desnudo;
      return (numerado ? i + 1 + '. ' : prefijo) + desnudo;
    });

    const resultado = nuevo.join('\n');
    const salida = t.slice(0, iniLinea) + resultado + t.slice(finLinea);

    /* Sin selección, el cursor se queda donde estaba, corrido por lo que haya
       crecido o menguado la línea. Devolver la línea entera seleccionada era un
       fallo caro: pulsabas el botón, escribías, y la primera tecla borraba todo
       lo que había en esa línea. */
    if (a === b) {
      const pos = Math.max(iniLinea, Math.min(salida.length,
        a + (resultado.length - (finLinea - iniLinea))));
      return { texto: salida, desde: pos, hasta: pos };
    }

    return {
      texto: salida,
      desde: iniLinea,
      hasta: iniLinea + resultado.length
    };
  };

  if (raiz.H) raiz.H.notas = N;
  if (typeof module !== 'undefined' && module.exports) module.exports = N;
})(typeof window !== 'undefined' ? window : globalThis);
