/* Pruebas del formato de las notas.
   Uso:  node tools/prueba-notas.js

   Se prueban aparte y sin interfaz por dos razones. La primera es que el
   resultado se inyecta con innerHTML: si una nota que contenga <script> saliera
   sin escapar, el bloc se convertiría en un agujero. La segunda es que los
   fallos de un editor no se ven al escribir, se ven al releer — descubres tres
   meses después que media clase quedó dentro de una cursiva que nunca cerraste. */
const N = require('../app/js/notas.js');

let pasan = 0, fallan = 0;
function ok(nombre, cond, extra) {
  if (cond) { pasan++; console.log('PASS ' + nombre + (extra ? ' :: ' + extra : '')); }
  else { fallan++; console.log('FALL ' + nombre + (extra ? ' :: ' + extra : '')); }
}

// --- Seguridad --------------------------------------------------------------
{
  const malo = N.aHtml('<script>alert(1)</script>');
  ok('el HTML de la nota queda escapado',
     malo.indexOf('<script') === -1 && malo.indexOf('&lt;script&gt;') !== -1, malo);
  ok('las comillas también se escapan',
     N.aHtml('dijo "hola"').indexOf('&quot;hola&quot;') !== -1, N.aHtml('dijo "hola"'));
  ok('un & suelto no rompe la entidad siguiente',
     N.aHtml('A & <b>').indexOf('&amp; &lt;b&gt;') !== -1, N.aHtml('A & <b>'));
}

// --- Marcas de dentro de la línea -------------------------------------------
ok('negrita', N.aHtml('esto es **fuerte**') === '<p>esto es <strong>fuerte</strong></p>',
   N.aHtml('esto es **fuerte**'));
ok('cursiva', N.aHtml('esto es *inclinado*') === '<p>esto es <em>inclinado</em></p>',
   N.aHtml('esto es *inclinado*'));
ok('subrayado', N.aHtml('esto va __debajo__') === '<p>esto va <u>debajo</u></p>',
   N.aHtml('esto va __debajo__'));
ok('tachado', N.aHtml('esto ~~ya no~~') === '<p>esto <s>ya no</s></p>',
   N.aHtml('esto ~~ya no~~'));

/* El caso que rompe cualquier reemplazo ingenuo: procesando la doble antes que
   la triple salen etiquetas cruzadas (<strong><em>x</strong></em>) y el
   navegador reordena el resto del documento por su cuenta. */
ok('negrita y cursiva a la vez no cruza etiquetas',
   N.aHtml('***las dos***') === '<p><strong><em>las dos</em></strong></p>',
   N.aHtml('***las dos***'));

ok('dos negritas en la misma línea no se comen lo de en medio',
   N.aHtml('**a** y **b**') === '<p><strong>a</strong> y <strong>b</strong></p>',
   N.aHtml('**a** y **b**'));

// Un solo guion bajo no marca nada: en notas de poker hay check_raise y
// hero_call, y subrayar medio nombre es peor que no subrayar.
ok('un guion bajo suelto no subraya',
   N.aHtml('un check_raise limpio').indexOf('<u>') === -1,
   N.aHtml('un check_raise limpio'));
ok('dos guiones bajos sí subrayan', N.aHtml('__x__').indexOf('<u>x</u>') !== -1);

ok('los asteriscos sueltos se quedan como están',
   N.aHtml('2 * 3 * 4') === '<p>2 * 3 * 4</p>', N.aHtml('2 * 3 * 4'));
ok('una marca sin cerrar no arrastra el resto',
   N.aHtml('**sin cerrar') === '<p>**sin cerrar</p>', N.aHtml('**sin cerrar'));

// --- Los tres tamaños --------------------------------------------------------
ok('título 1', N.aHtml('# Grande') === '<h1>Grande</h1>', N.aHtml('# Grande'));
ok('título 2', N.aHtml('## Medio') === '<h2>Medio</h2>', N.aHtml('## Medio'));
ok('título 3', N.aHtml('### Pequeño') === '<h3>Pequeño</h3>', N.aHtml('### Pequeño'));
// Solo hay tres tamaños. El cuarto se queda como texto en vez de degradarse
// en silencio a un tercero, que sería mentirle al que lo escribió.
ok('un cuarto nivel no es un título',
   N.aHtml('#### Cuarto') === '<p>#### Cuarto</p>', N.aHtml('#### Cuarto'));
// Sin espacio detrás no es un título: es una etiqueta. El espacio es lo único
// que separa las dos cosas, y por eso el título lo exige.
ok('una almohadilla sin espacio no es un título',
   N.aHtml('#hashtag').indexOf('<h1>') === -1 &&
   N.aHtml('#hashtag').indexOf('nota-tag') !== -1, N.aHtml('#hashtag'));
ok('el título admite marcas dentro',
   N.aHtml('## Rangos de **CO**') === '<h2>Rangos de <strong>CO</strong></h2>',
   N.aHtml('## Rangos de **CO**'));

// --- Listas ------------------------------------------------------------------
ok('lista con puntos',
   N.aHtml('- uno\n- dos') === '<ul><li>uno</li><li>dos</li></ul>', N.aHtml('- uno\n- dos'));
ok('lista con asterisco',
   N.aHtml('* uno\n* dos') === '<ul><li>uno</li><li>dos</li></ul>', N.aHtml('* uno\n* dos'));
ok('lista numerada',
   N.aHtml('1. uno\n2. dos') === '<ol><li>uno</li><li>dos</li></ol>', N.aHtml('1. uno\n2. dos'));
ok('numerada con paréntesis',
   N.aHtml('1) uno') === '<ol><li>uno</li></ol>', N.aHtml('1) uno'));
ok('pasar de puntos a números cierra la primera lista',
   N.aHtml('- a\n1. b') === '<ul><li>a</li></ul><ol><li>b</li></ol>', N.aHtml('- a\n1. b'));
ok('una línea en blanco cierra la lista',
   N.aHtml('- a\n\ntexto') === '<ul><li>a</li></ul><p>texto</p>', N.aHtml('- a\n\ntexto'));
ok('la lista se cierra al acabar la nota',
   N.aHtml('- a').indexOf('</ul>') !== -1, N.aHtml('- a'));

// --- Cajas de alerta y de nota importante ------------------------------------
ok('caja de alerta',
   N.aHtml('!! Cuidado con esto') ===
   '<div class="nota-caja alerta">Cuidado con esto</div>',
   N.aHtml('!! Cuidado con esto'));
ok('caja de nota importante',
   N.aHtml('>> No olvidar') ===
   '<div class="nota-caja importante">No olvidar</div>',
   N.aHtml('>> No olvidar'));
ok('la marca vale sin espacio detrás',
   N.aHtml('!!pegado').indexOf('>pegado</div>') !== -1, N.aHtml('!!pegado'));

/* Lo que hace usable la caja: varias líneas seguidas son UNA caja, no tres
   avisos apilados. Escribir una advertencia de tres frases no puede obligar a
   pensar en ellas como tres cosas distintas. */
ok('líneas seguidas forman una sola caja',
   N.aHtml('!! Una\n!! Dos') ===
   '<div class="nota-caja alerta">Una<br>Dos</div>',
   N.aHtml('!! Una\n!! Dos'));
ok('una línea en blanco cierra la caja',
   N.aHtml('!! Una\n\ntexto') ===
   '<div class="nota-caja alerta">Una</div><p>texto</p>',
   N.aHtml('!! Una\n\ntexto'));
ok('pasar de alerta a importante abre otra caja',
   N.aHtml('!! Una\n>> Dos') ===
   '<div class="nota-caja alerta">Una</div><div class="nota-caja importante">Dos</div>',
   N.aHtml('!! Una\n>> Dos'));
ok('un título cierra la caja abierta',
   N.aHtml('!! Una\n## Título').indexOf('</div><h2>') !== -1,
   N.aHtml('!! Una\n## Título'));
ok('una lista cierra la caja abierta',
   N.aHtml('!! Una\n- punto').indexOf('</div><ul>') !== -1,
   N.aHtml('!! Una\n- punto'));
ok('la caja se cierra al acabar la nota',
   (N.aHtml('!! Sola').match(/<\/div>/g) || []).length === 1, N.aHtml('!! Sola'));
ok('la caja admite marcas dentro',
   N.aHtml('!! Esto es **grave**').indexOf('<strong>grave</strong>') !== -1,
   N.aHtml('!! Esto es **grave**'));
// --- Cajas cerradas: !texto! y >texto< ---------------------------------------
ok('caja de alerta cerrada',
   N.aHtml('!Cuidado con esto!') === '<div class="nota-caja alerta">Cuidado con esto</div>',
   N.aHtml('!Cuidado con esto!'));
ok('caja de importante cerrada',
   N.aHtml('>Recuerda esto<') === '<div class="nota-caja importante">Recuerda esto</div>',
   N.aHtml('>Recuerda esto<'));

/* Lo que hace que la forma cerrada valga la pena: abarca varias líneas sin
   repetir la marca en cada una. Escribir una advertencia de tres frases con
   "!!" delante de cada una las convierte mentalmente en tres avisos. */
{
  const r = N.aHtml('!Esto es importante:\nporque si no lo miras\nte cuesta dinero!');
  ok('la caja cerrada abarca varias líneas',
     r === '<div class="nota-caja alerta">Esto es importante:<br>' +
           'porque si no lo miras<br>te cuesta dinero</div>', r);
}
ok('la caja cerrada admite marcas dentro',
   N.aHtml('!Ojo con el **4-bet** #leak#').indexOf('<strong>4-bet</strong>') !== -1,
   N.aHtml('!Ojo con el **4-bet** #leak#'));

/* Una caja sin cerrar se corta en la línea en blanco. Sin esto, un "!" suelto
   al principio de una línea se tragaría el resto de la nota entera. */
{
  const r = N.aHtml('!empieza y no cierra\n\ntexto de después');
  ok('una caja sin cerrar se corta en la línea en blanco',
     r === '<div class="nota-caja alerta">empieza y no cierra</div><p>texto de después</p>', r);
}

// Una frase que acaba en admiración no es una caja: la marca tiene que ABRIR
// la línea. Si no, media nota en español se volvería un recuadro ámbar.
ok('una frase que solo acaba en ! no es una caja',
   N.aHtml('Qué bien!') === '<p>Qué bien!</p>', N.aHtml('Qué bien!'));
ok('un ! solo, sin nada detrás, no es una caja',
   N.aHtml('!') === '<p>!</p>', N.aHtml('!'));

// Las marcas de línea de siempre siguen valiendo: las notas ya escritas con
// ellas no se pueden romper por cambiar de sintaxis.
ok('la marca de línea !! sigue funcionando',
   N.aHtml('!! sigue valiendo') === '<div class="nota-caja alerta">sigue valiendo</div>',
   N.aHtml('!! sigue valiendo'));
ok('y la marca de línea >>',
   N.aHtml('>> esta también') === '<div class="nota-caja importante">esta también</div>',
   N.aHtml('>> esta también'));

// --- Etiquetas ---------------------------------------------------------------
ok('etiqueta al principio de línea',
   N.aHtml('#leak en river') ===
   '<p><span class="nota-tag">#leak</span> en river</p>', N.aHtml('#leak en river'));
ok('etiqueta en medio del texto',
   N.aHtml('esto es un #leak claro').indexOf('<span class="nota-tag">#leak</span>') !== -1,
   N.aHtml('esto es un #leak claro'));
ok('varias etiquetas en la misma línea',
   (N.aHtml('#leak y #mental').match(/nota-tag/g) || []).length === 2,
   N.aHtml('#leak y #mental'));
ok('la etiqueta admite acentos y guiones',
   N.aHtml('#revisión-3bet').indexOf('#revisión-3bet</span>') !== -1,
   N.aHtml('#revisión-3bet'));

/* Una etiqueta tiene que empezar por letra. Sin esta regla, "#1" en una lista
   escrita a mano y "#3bet" —que en poker se escribe constantemente— se
   convertirían en etiquetas sin que nadie lo pidiera. */
ok('#1 no es una etiqueta', N.aHtml('el #1 del ranking').indexOf('nota-tag') === -1,
   N.aHtml('el #1 del ranking'));
ok('#3bet tampoco', N.aHtml('un #3bet grande').indexOf('nota-tag') === -1,
   N.aHtml('un #3bet grande'));
ok('una almohadilla pegada a una palabra no es etiqueta',
   N.aHtml('abc#def').indexOf('nota-tag') === -1, N.aHtml('abc#def'));

// Los títulos llevan espacio detrás de la almohadilla; las etiquetas no. Por
// eso pueden convivir sin pisarse.
ok('el título sigue siendo título y no etiqueta',
   N.aHtml('# Título') === '<h1>Título</h1>', N.aHtml('# Título'));
ok('etiquetas dentro de una caja',
   N.aHtml('!! Ojo con el #leak').indexOf('nota-tag') !== -1,
   N.aHtml('!! Ojo con el #leak'));

// --- Etiquetas cerradas: #varias palabras# -----------------------------------
ok('una etiqueta cerrada admite varias palabras',
   N.aHtml('#control de versiones#') ===
   '<p><span class="nota-tag">#control de versiones</span></p>',
   N.aHtml('#control de versiones#'));
ok('y se extrae entera, no solo la primera palabra',
   N.etiquetas('#control de versiones#').length === 1 &&
   N.etiquetas('#control de versiones#')[0] === 'control de versiones',
   JSON.stringify(N.etiquetas('#control de versiones#')));

/* El caso que rompe cualquier reemplazo ingenuo: dos etiquetas sueltas en la
   misma línea. Sin exigir que el carácter antes de la almohadilla de cierre no
   sea un espacio, "#git y #push" se leería como una sola etiqueta cerrada
   llamada "git y " y se comería la segunda. */
ok('dos etiquetas sueltas no se funden en una cerrada',
   JSON.stringify(N.etiquetas('#git y #push')) === '["git","push"]',
   JSON.stringify(N.etiquetas('#git y #push')));
ok('dos cerradas en la misma línea',
   JSON.stringify(N.etiquetas('#uno dos# y #tres cuatro#')) ===
   '["uno dos","tres cuatro"]',
   JSON.stringify(N.etiquetas('#uno dos# y #tres cuatro#')));
ok('una cerrada no cuenta además como suelta',
   N.etiquetas('#varias palabras#').length === 1,
   JSON.stringify(N.etiquetas('#varias palabras#')));
ok('cerradas y sueltas conviven',
   JSON.stringify(N.etiquetas('#git# y #push suave# y #hola')) ===
   '["git","push suave","hola"]',
   JSON.stringify(N.etiquetas('#git# y #push suave# y #hola')));
ok('la cerrada admite acentos y mayúsculas',
   N.etiquetas('#Revisión de código#')[0] === 'Revisión de código',
   JSON.stringify(N.etiquetas('#Revisión de código#')));

{
  const t = N.etiquetas('#leak en river y otro #leak, además #mental');
  ok('se extraen las etiquetas sin repetir',
     t.length === 2 && t[0] === 'leak' && t[1] === 'mental', t.join(','));
  ok('una nota sin etiquetas devuelve lista vacía',
     N.etiquetas('nada aquí').length === 0);
  ok('extraer no se salta la primera al llamar dos veces',
     N.etiquetas('#uno #dos').length === 2 && N.etiquetas('#uno #dos').length === 2);
}

// --- Enlaces a imágenes ------------------------------------------------------
ok('el enlace a una imagen se pinta como tal',
   N.aHtml('mira el [[esquema]]').indexOf(
     '<span class="nota-img" data-act="verImagen" data-nombre="esquema">esquema</span>') !== -1,
   N.aHtml('mira el [[esquema]]'));
ok('el nombre admite espacios y acentos',
   N.aHtml('[[mapa de sesión]]').indexOf('data-nombre="mapa de sesión"') !== -1,
   N.aHtml('[[mapa de sesión]]'));

/* El enlace se procesa ANTES que el resto de marcas. Si pasara después, un
   [[mapa *general*]] se comería los asteriscos y el nombre del enlace dejaría
   de coincidir con el de la imagen guardada. */
ok('el nombre del enlace llega entero, sin que otras marcas lo toquen',
   N.aHtml('[[mapa *general*]]').indexOf('data-nombre="mapa *general*"') !== -1,
   N.aHtml('[[mapa *general*]]'));

ok('un corchete suelto no es un enlace',
   N.aHtml('esto [no] es') === '<p>esto [no] es</p>', N.aHtml('esto [no] es'));
ok('unos corchetes vacíos tampoco',
   N.aHtml('[[]]').indexOf('nota-img') === -1, N.aHtml('[[]]'));
ok('el enlace funciona dentro de una caja',
   N.aHtml('!Ojo con el [[diagrama]]!').indexOf('nota-img') !== -1,
   N.aHtml('!Ojo con el [[diagrama]]!'));

{
  const c = N.imagenesCitadas('ver [[uno]] y [[dos]] y otra vez [[uno]]');
  ok('se extraen las imágenes citadas sin repetir',
     c.length === 2 && c[0] === 'uno' && c[1] === 'dos', c.join(','));
  ok('un texto sin enlaces no cita ninguna',
     N.imagenesCitadas('nada aquí').length === 0);
}
ok('en el extracto queda el nombre y no los corchetes',
   N.aTextoPlano('mira el [[esquema]] de arriba') === 'mira el esquema de arriba',
   N.aTextoPlano('mira el [[esquema]] de arriba'));

// --- Párrafos y divisorias ---------------------------------------------------
ok('dos líneas seguidas van en el mismo párrafo con salto',
   N.aHtml('una\notra') === '<p>una<br>otra</p>', N.aHtml('una\notra'));
ok('una línea en blanco separa párrafos',
   N.aHtml('una\n\notra') === '<p>una</p><p>otra</p>', N.aHtml('una\n\notra'));
ok('divisoria', N.aHtml('---') === '<hr>', N.aHtml('---'));
ok('la divisoria no se confunde con una lista',
   N.aHtml('- a\n---\n- b') === '<ul><li>a</li></ul><hr><ul><li>b</li></ul>',
   N.aHtml('- a\n---\n- b'));
ok('los saltos de Windows no duplican párrafos',
   N.aHtml('una\r\notra') === '<p>una<br>otra</p>', N.aHtml('una\r\notra'));
ok('una nota vacía no produce HTML', N.aHtml('') === '', JSON.stringify(N.aHtml('')));
ok('null no revienta', N.aHtml(null) === '', JSON.stringify(N.aHtml(null)));

// --- Texto plano y resumen ---------------------------------------------------
ok('el texto plano se queda sin marcas',
   N.aTextoPlano('## Título\n- un **punto**') === 'Título un punto',
   N.aTextoPlano('## Título\n- un **punto**'));
ok('el resumen corto se devuelve entero',
   N.resumen('corto') === 'corto', N.resumen('corto'));
{
  const largo = 'palabra '.repeat(40);
  const r = N.resumen(largo, 40);
  ok('el resumen largo se corta con puntos suspensivos', r.length <= 41 && r.endsWith('…'), r);
  ok('el resumen no parte una palabra por la mitad', r.indexOf('palab…') === -1, r);
}

// --- Cuántas palabras tiene ---------------------------------------------------
ok('cuenta palabras', N.palabras('una dos tres') === 3, String(N.palabras('una dos tres')));
ok('las marcas no cuentan como palabras',
   N.palabras('## Título\n- **uno**') === 2, String(N.palabras('## Título\n- **uno**')));
ok('una nota vacía tiene cero palabras', N.palabras('') === 0);
ok('null tiene cero palabras', N.palabras(null) === 0);
{
  const larga = 'palabra '.repeat(N.PALABRAS_MAX_TARJETA + 20);
  ok('una nota larga pasa del tope', N.palabras(larga) > N.PALABRAS_MAX_TARJETA,
     String(N.palabras(larga)));
  ok('una tarjeta normal no lo pasa',
     N.palabras('¿Qué hace git reflog? Enseña los commits que ya no apunta ninguna rama.') <
     N.PALABRAS_MAX_TARJETA);
}

// --- Botones de la barra: envolver -------------------------------------------
{
  const r = N.envolver('hola mundo', 5, 10, '**');
  ok('envolver marca la selección', r.texto === 'hola **mundo**', r.texto);
  ok('envolver deja la selección sobre el texto, no sobre las marcas',
     r.texto.slice(r.desde, r.hasta) === 'mundo', r.texto.slice(r.desde, r.hasta));
}
{
  // Pulsar dos veces tiene que dejarlo como estaba. Si no, la barra suma
  // marcas hasta que la nota se llena de asteriscos.
  const uno = N.envolver('hola mundo', 5, 10, '**');
  const dos = N.envolver(uno.texto, uno.desde, uno.hasta, '**');
  ok('envolver dos veces vuelve al original', dos.texto === 'hola mundo', dos.texto);
  ok('y la selección sigue sobre la misma palabra',
     dos.texto.slice(dos.desde, dos.hasta) === 'mundo', dos.texto.slice(dos.desde, dos.hasta));
}
{
  const r = N.envolver('hola **mundo**', 5, 14, '**');
  ok('quita la marca aunque la selección la incluya', r.texto === 'hola mundo', r.texto);
}
{
  const r = N.envolver('hola ', 5, 5, '**');
  ok('sin selección deja el cursor entre las marcas',
     r.texto === 'hola ****' && r.desde === 7 && r.hasta === 7, r.texto + ' @' + r.desde);
}
{
  const r = N.envolver('abc', 99, 200, '**');
  ok('posiciones fuera de rango no rompen nada', r.texto.indexOf('abc') === 0, r.texto);
}

/* Marca de cierre distinta a la de apertura: la caja de nota importante se
   escribe >así<. Sin esto, el botón dejaría >así> y no se pintaría nada. */
{
  const r = N.envolver('recuerda', 0, 8, '>', '<');
  ok('envolver admite marca de cierre distinta', r.texto === '>recuerda<', r.texto);
  ok('y la selección sigue sobre el texto',
     r.texto.slice(r.desde, r.hasta) === 'recuerda', r.texto.slice(r.desde, r.hasta));
  const q = N.envolver(r.texto, r.desde, r.hasta, '>', '<');
  ok('pulsar dos veces la quita', q.texto === 'recuerda', q.texto);
}
{
  const r = N.envolver('', 0, 0, '>', '<');
  ok('sin selección deja el cursor entre las dos marcas distintas',
     r.texto === '><' && r.desde === 1, r.texto + ' @' + r.desde);
}
{
  // Envolver varias líneas es como se hace una caja de varias líneas.
  const r = N.envolver('una\ndos', 0, 7, '!');
  ok('envolver varias líneas produce una caja de varias líneas',
     r.texto === '!una\ndos!' &&
     N.aHtml(r.texto) === '<div class="nota-caja alerta">una<br>dos</div>',
     JSON.stringify(r.texto));
}
{
  const r = N.envolver('varias palabras', 0, 15, '#');
  ok('el botón de etiqueta cierra la etiqueta', r.texto === '#varias palabras#', r.texto);
  ok('y queda como una sola etiqueta',
     N.etiquetas(r.texto).length === 1, JSON.stringify(N.etiquetas(r.texto)));
}

// --- Botones de la barra: prefijar -------------------------------------------
{
  const r = N.prefijar('linea', 0, 5, '## ');
  ok('prefijar pone el título', r.texto === '## linea', r.texto);
  const q = N.prefijar(r.texto, 0, r.texto.length, '## ');
  ok('prefijar dos veces lo quita', q.texto === 'linea', q.texto);
}
{
  const r = N.prefijar('a\nb\nc', 0, 5, '- ');
  ok('prefijar alcanza todas las líneas de la selección',
     r.texto === '- a\n- b\n- c', JSON.stringify(r.texto));
}
{
  const r = N.prefijar('a\nb\nc', 0, 5, '1. ');
  ok('la lista numerada se numera sola',
     r.texto === '1. a\n2. b\n3. c', JSON.stringify(r.texto));
  const q = N.prefijar(r.texto, 0, r.texto.length, '1. ');
  ok('y se quita entera', q.texto === 'a\nb\nc', JSON.stringify(q.texto));
}
{
  // Una línea no puede ser título y punto de lista a la vez: encadenar los
  // botones producía "## - texto" y el resultado no era ni una cosa ni otra.
  const t = N.prefijar('linea', 0, 5, '## ');
  const l = N.prefijar(t.texto, 0, t.texto.length, '- ');
  ok('un prefijo nuevo sustituye al anterior', l.texto === '- linea', l.texto);
}
{
  const r = N.prefijar('a\n\nb', 0, 4, '- ');
  ok('prefijar salta las líneas en blanco', r.texto === '- a\n\n- b', JSON.stringify(r.texto));
}
{
  const r = N.prefijar('hola', 2, 2, '# ');
  ok('prefijar funciona con el cursor en medio de la línea',
     r.texto === '# hola', r.texto);
}

/* --- Los dos fallos que hacían que los botones "no funcionaran" -------------

   1. Sobre una línea VACÍA el botón no hacía nada. Y una línea vacía es
      justo el estado de una nota recién creada: abres la nota, pulsas el
      botón de alerta y no pasaba absolutamente nada.

   2. Sin selección devolvía la línea entera seleccionada. Pulsabas el botón,
      empezabas a escribir, y la primera tecla borraba la línea. */
{
  const r = N.prefijar('', 0, 0, '!! ');
  ok('el botón marca una línea vacía', r.texto === '!! ', JSON.stringify(r.texto));
  ok('y deja el cursor detrás de la marca, listo para escribir',
     r.desde === 3 && r.hasta === 3, r.desde + '-' + r.hasta);
}
{
  const r = N.prefijar('', 0, 0, '>> ');
  ok('lo mismo con la caja de importante', r.texto === '>> ' && r.desde === 3,
     JSON.stringify(r.texto));
}
{
  const r = N.prefijar('', 0, 0, '- ');
  ok('y con la lista', r.texto === '- ' && r.desde === 2, JSON.stringify(r.texto));
}
{
  // Sin selección el cursor se queda donde estaba, corrido por la marca.
  const r = N.prefijar('texto', 5, 5, '!! ');
  ok('sin selección no se selecciona la línea entera',
     r.desde === r.hasta, r.desde + '-' + r.hasta);
  ok('y el cursor sigue al final de lo escrito', r.desde === 8, String(r.desde));
}
{
  const r = N.prefijar('!! texto', 8, 8, '!! ');
  ok('quitar la marca devuelve el cursor a su sitio',
     r.texto === 'texto' && r.desde === 5 && r.hasta === 5,
     JSON.stringify(r.texto) + ' @' + r.desde);
}
{
  // Con el cursor dentro de la propia marca, quitarla no puede dejarlo antes
  // del principio de la línea.
  const r = N.prefijar('!! texto', 1, 1, '!! ');
  ok('el cursor nunca se sale de la línea', r.desde >= 0 && r.desde <= r.texto.length,
     String(r.desde));
}
{
  // Una selección de verdad sí conserva el bloque seleccionado: es lo que
  // espera quien marcó cinco líneas a mano.
  const r = N.prefijar('a\nb', 0, 3, '- ');
  ok('con selección se mantiene el bloque seleccionado',
     r.desde === 0 && r.hasta === r.texto.length, r.desde + '-' + r.hasta);
}

console.log('\n===== ' + (fallan === 0
  ? 'TODO OK (' + pasan + ' comprobaciones)'
  : 'HAY FALLOS: ' + fallan + ' de ' + (pasan + fallan)) + ' =====');
process.exit(fallan === 0 ? 0 : 1);
