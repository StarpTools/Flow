# Flow

Centro de mando personal para organizar el trabajo de un jugador de poker:
planificar los días, saber en cada momento qué toca, certificar que de verdad
estuviste en la tarea, y ver si las horas de estudio se convierten en dinero.

## Arrancar

Doble clic en el icono **Flow** del Escritorio. Sin terminal, sin consola
negra detrás.

Si el acceso directo no existe todavía, o moviste la carpeta del proyecto (el
acceso directo guarda rutas absolutas):

```bash
powershell -ExecutionPolicy Bypass -File tools\acceso-directo.ps1
```

Desde la terminal también vale:

```bash
npm install
npm start
```

No hay servidor, ni puertos, ni tres terminales.

## Qué hace

**Hoy** — En dos columnas: el plan del día y el registro diario a la
izquierda, la tarea suelta y lo ya registrado a la derecha. La sesión en curso
ocupa una franja arriba cuando hay una.

Va en dos columnas porque en una sola crecía con cada tarea del plan y
empujaba fuera de pantalla justo lo que más se mira.

**Planificar** — Calendario mensual. Haces clic en un día y agendas.
Los chips de repetición (Lun/Mar/Mié…) aplican lo mismo a todos esos días del
mes de una vez. Los días ya pasados nunca se tocan, para no ensuciar el
historial de cumplimiento.

La duración se escribe, no se elige de una lista cerrada: `5h`, `1h30`,
`1h 30m`, `1.5h`, `1:30`, `90m`, o un número suelto que se toma como minutos.
Las flechas ↑↓ suben y bajan de a 15 minutos (de a 5 por debajo de la hora), y
debajo del campo se confirma en texto cómo se interpretó lo que escribiste.

**Registro diario** — Lo que se anota una vez al día y no se cronometra:
dormir, peso, pasos. Tiene meta diaria y aparece en su propio bloque en Hoy,
separado del plan, porque dormir 7h no es tiempo de trabajo y sumarlo a las
horas registradas sería mentir. Se crean en Actividades eligiendo el tipo
"Registro diario".

Si la unidad es horas, el campo entiende lo mismo que el del planificador:
`7`, `7.5`, `7h 30m`, `450m` o `7:30`. Con una diferencia deliberada: **un
número suelto aquí son horas**, no minutos. En el planificador escribes `90`
y quieres 90 minutos; en "dormir" escribes `7` y quieres 7 horas. El valor se
normaliza al salir del campo, así que escribes `450m` y ves `7h 30m` — nunca
te quedas con la duda de si `0.3` era media hora (son 18 minutos).

Para unidades que no son tiempo (kg, pasos) el campo es un número normal.

**Días de descanso** — Un día se puede marcar como descanso desde el modal del
calendario. Queda fuera de todas las cuentas de cumplimiento: decidiste no
trabajar, así que medirte contra un plan que anulaste convertiría el descanso
en un fallo. Se ve rayado y no rompe la racha.

**Dashboard** — Semana, mes y año. Tiempo certificado, porcentaje de
cumplimiento, días completos, racha, reparto por actividad, cumplimiento del
registro diario, mapa de calor anual y una tabla explícita de **lo que quedó
sin hacer**.

**Exportar** — El botón *Exportar* del dashboard genera una imagen de una
página con las cifras del periodo, el reparto por actividad, el registro
diario y el gráfico de bb/100 contra horas estudiadas. Se copia al
portapapeles al generarse, para pegarla directamente en el chat o el blog del
grupo, y también se puede guardar como PNG.

**Spots** — La pestaña tiene dos mitades, con un interruptor arriba: *Mis
spots* y *Bloc de lógicas*. Son las dos caras del mismo trabajo — cuánto rinde
lo que estudias, y lo que aprendes estudiándolo.

*Mis spots*: cada spot con su color —el que lo identifica en el bloc—, sus horas
invertidas, su resultado en dinero, su bb/100 y su retorno por hora. Dos
gráficas: ganancia acumulada, y **rendimiento contra horas estudiadas** — que es
la que responde si el estudio está funcionando. Con cuatro o más registros la
app compara tus primeras sesiones contra las últimas y da un veredicto. Debajo,
las lógicas que has apuntado trabajando ese spot, con *Abrir en el bloc*.

**Grupos.** Los spots se agrupan: Poker, Programación, lo que quieras. Es una
lista plana, **no una jerarquía por la que navegar** — el grupo agrupa la lista
y decide qué cifras se ven, pero no hay que entrar en él para llegar a un spot.
Cada nivel que se añade es una decisión que hay que tomar cada vez que creas
algo ("¿esto es Programación > Git o Programación > Web > HTML?"), y esa duda se
paga para siempre.

Un grupo declara si **lleva resultados en dinero**. Con la casilla puesta, sus
fichas enseñan bb/100, resultado y $ por hora. Quítala para cursos y temas de
estudio: ahí esas cifras no significan nada y solo tapan lo que sí mides. Un
spot sin dinero enseña horas, sesiones, cuántas lógicas le has sacado y cuántas
te tocan hoy, y no te pide que registres manos jugadas.

Todos los spots que ya existían entraron en **Poker** al actualizar, con dinero
puesto: subir de versión no cambia ni una cifra de lo que ya estabas mirando.
Mover un curso a un grupo sin dinero es decisión tuya. Borrar un grupo **no
borra sus spots** — se quedan sin grupo.

*Bloc de lógicas*: ver abajo. Abre en el ámbito del spot que tengas
seleccionado, y cada spot es un mundo aparte que no comparte nada con los demás.

**Life** — Los ámbitos de fuera de la mesa: Trabajo, Vida personal, Familia,
Salud, Pareja, Lectura, Hijos/Mascotas. Los siete vienen de fábrica y se
pueden renombrar, recolorear, borrar o ampliar. Cada ámbito tiene tres capas,
en este orden a propósito:

1. **Dónde estoy** — el reconocimiento honesto. Sin esto, lo demás son buenos
   propósitos.
2. **Paradigmas** — dos columnas: la creencia que sale y la que entra en su
   lugar. Borrar sin reemplazar deja un hueco, por eso van emparejadas.
3. **Estrategias** — lo concreto que vas a probar, con su fuente (el vídeo, el
   coach, el libro) y su veredicto: *Probando*, *Funciona* o *Descartada*.
   Clic en el estado para cambiarlo.

El veredicto es lo que separa esto de una libreta de notas. Una estrategia que
llevas seis meses "probando" es una estrategia que no funciona, y verla ahí
arriba en ámbar todos los días es el punto.

**Widget** — Ventana flotante siempre visible. Te dice qué toca ahora, cuenta
el tiempo, y es donde respondes las verificaciones. Se arrastra a donde
quieras. Para volver a la ventana grande: clic en el logo, o doble clic en
cualquier parte del widget.

## El bloc de lógicas (repaso espaciado, método Woźniak)

Vive en la pestaña **Spots**, en la mitad *Bloc de lógicas*. Es el sitio donde
se escribe todo lo que aprendes: el resumen de una clase, la conclusión de una
revisión, lo que salió en un conversatorio, y las lógicas sueltas de siempre.
Ordenado por apartados, y con repetición espaciada encima.

Estudiar algo una vez no sirve: se olvida. El método SM-2 —el de SuperMemo y
Anki— te devuelve cada lógica **justo antes de que se te olvide**, y aleja el
siguiente repaso cada vez que aciertas.

**Ámbitos: cada spot es un mundo aparte.** El bloc enseña siempre **un solo
ámbito**: un spot, o *General* (las notas que no son de ningún spot). Dos
ámbitos no comparten nada — ni notas, ni apartados, ni el buscador. Y no existe
ninguna vista de "todos": mientras hubiera una pantalla capaz de mezclar dos
mundos, acabarían mezclados.

Esto existe porque en la misma app conviven cosas que no tienen nada que ver.
Un spot de 3-bet y unos apuntes de git no pueden compartir la lista de
categorías: "Rebase" no pinta nada en el bloc de un spot de poker.

**Se nota a la vista.** Cada spot tiene su color, elegido al crearlo. El bloc
abre con una barra ancha arriba que dice en qué ámbito estás, en ese color, y
cada nota lleva una franja del mismo color. La pregunta "¿dónde estoy
escribiendo?" tiene que poder contestarse sin leer.

**Apartados.** Dentro de cada ámbito, las notas se clasifican por tipo de
lógica. *General* trae cinco de fábrica (Preflop, Postflop, HUDs y reads,
Mental, Clases y conversatorios) y se renombran, recolorean, crean o borran. Un
solo nivel a propósito: un bloc con carpetas dentro de carpetas se ordena una
vez y no se vuelve a tocar.

Un spot nuevo **nace sin apartados**, porque sembrarlo con categorías de poker
sería absurdo en unos apuntes de git. Cuando sí quieres las mismas, hay un
*Copiar apartados de…* que los trae de otro ámbito; desde ese momento son copias
independientes y renombrar una no toca la otra.

Borrar un apartado **no borra sus notas** — pasan a *Sin clasificar*. Borrar un
spot se lleva sus apartados, pero sus notas se recogen en *General*.

**Si una nota acabó en el sitio equivocado**, el desplegable *Ámbito* del editor
la mueve. Al cambiarla de mundo se queda sin apartado, porque el que tenía era
del ámbito anterior y allí no significa nada.

**Título y cuerpo.** El título es el anverso de la tarjeta y el cuerpo el
reverso: en **Hoy** ves el título, intentas recordar el cuerpo, y solo entonces
se destapa. Por eso el título es obligatorio y el cuerpo no.

**El formato.** Marcas de teclado, no barra de botones que inserta HTML:

| Escribes | Sale |
|---|---|
| `**texto**` | **negrita** |
| `*texto*` | *cursiva* |
| `__texto__` | subrayado |
| `~~texto~~` | tachado |
| `# ## ###` | los tres tamaños de título |
| `- texto` | lista con puntos |
| `1. texto` | lista numerada |
| `!texto!` | caja de **alerta** |
| `>texto<` | caja de **nota importante** |
| `#etiqueta` | etiqueta de una palabra |
| `#varias palabras#` | etiqueta de varias |
| `---` | línea divisoria |

**Las dos cajas** se abren y se cierran, como los paréntesis. Una para lo que te
va a costar dinero (*alerta*, en ámbar) y otra para lo que tienes que recordar sí
o sí (*importante*, en el color de marca). Dos y no seis: una paleta de avisos
con matices entre ellos obliga a decidir cuál usar cada vez, y acabas usando
siempre el mismo.

Cerrarlas es lo que permite que abarquen **varias líneas** sin repetir la marca
en cada una:

```
!Esto es importante:
porque si no lo miras
te cuesta dinero!
```

Una caja sin cerrar se corta en la primera línea en blanco. Es una concesión a
propósito: sin ella, un `!` suelto al principio de una línea se tragaría el
resto de la nota dentro de un recuadro ámbar.

Las marcas de línea de antes (`!! texto` y `>> texto`) siguen valiendo, para no
romper lo que ya esté escrito.

**Las etiquetas** van dentro del texto, no en un campo aparte: si borras
`#leak` de la nota, deja de estar etiquetada, sin más. Un campo separado se
queda con etiquetas de cosas que el texto ya no dice, y a los seis meses no te
fías de ninguna. Se recogen solas en la columna de la izquierda, con cuántas
notas lleva cada una, y pulsando una filtras por ella (pulsándola otra vez
quitas el filtro). Se cruzan con el apartado: *Preflop + #leak*.

`#palabra` etiqueta una sola palabra. Para varias hay que cerrarla:
`#control de versiones#`. La cerrada exige que el carácter antes de la
almohadilla final no sea un espacio — sin esa condición, `#git y #push` se
leería como una sola etiqueta llamada *git y* que se come la segunda.

Una etiqueta tiene que empezar por letra. Así `#1` y `#3bet` —que en poker se
escribe constantemente— siguen siendo texto normal. Y el título lleva espacio
detrás de la almohadilla (`# Título`) mientras que la etiqueta no (`#leak`):
ese espacio es lo único que las separa.

**Los botones abrazan lo seleccionado.** Negrita, cursiva, subrayado, tachado,
las dos cajas y la etiqueta funcionan igual: marcas lo que quieras y pulsas.
Sin nada seleccionado dejan las dos marcas y el cursor en medio. Los títulos y
las listas siguen siendo prefijos de línea, porque eso es lo que son.

## Corregir la ortografía

El corrector va en **español e inglés a la vez**, y eso es deliberado: estas
notas están llenas de *check-raise*, *commit*, *merge* y *overbet*. Con solo
español media nota sale subrayada y el subrayado deja de significar nada.
Chromium da por buena una palabra si la conoce cualquiera de los dos idiomas.

**Clic derecho sobre la palabra subrayada** y salen las sugerencias arriba del
todo, sin submenús: corregir tiene que ser dos clics. Debajo, *Añadir al
diccionario* para las palabras que usas y no están en ninguno, y cortar / copiar
/ pegar.

Hay botones para todo eso —y `Ctrl+S` guarda—, pero lo que se guarda en el
disco sigue siendo **texto plano**. Se puede leer, buscar con grep y respaldar
sin abrir Flow. Un editor que guarda HTML te ata al programa que lo escribió, y
estas notas van a durar más que cualquier versión de esta app.

Tres tamaños de título y no más: un bloc con nueve niveles de encabezado deja
de estar ordenado, que es justo lo que se venía a arreglar. Un solo guion bajo
no subraya nada, a propósito — en notas de poker aparece `check_raise` y
subrayar medio nombre por accidente es peor que no tener subrayado.

**Solo consulta.** Cada nota tiene un interruptor *Entra en repaso espaciado*.
Quítalo para el material de referencia. Sacarla de la rotación **no borra su
calendario**: al reactivarla retoma donde estaba.

## De la clase entera a las tarjetas

Este es el flujo, y el orden importa:

1. **Un spot por curso o por tema.** Programación, 3-bet pot OOP, lo que sea.
2. **Apuntas la clase entera en el bloc**, larga, con sus títulos y sus cajas.
   Esa nota es **material de consulta**, no una tarjeta.
3. **De ahí sacas tarjetas**: seleccionas un trozo, pulsas *Sacar tarjeta*, y
   escribes la **pregunta**. Eso es lo que repasa SM-2.

**Por qué un texto largo no puede ser una tarjeta.** En Hoy solo ves el título e
intentas recordar el cuerpo. Con un documento de mil palabras pasan tres cosas,
las tres malas:

- **No lo puedes puntuar.** De un texto largo siempre recuerdas una parte.
  ¿Pulsas *Bien* o *Me costó*? Lo que pulses decide el calendario de los
  próximos seis meses, y lo decides con una sensación vaga.
- **Un intervalo para veinte cosas distintas.** La dificultad de la nota acaba
  siendo la del hecho más difícil, así que los diecinueve que ya sabes vuelven
  al ritmo del que no sabes. Es exactamente el desperdicio que SM-2 existe para
  eliminar.
- **Fallar es casi seguro**, siempre se te ha olvidado algo. El EF baja, la nota
  vuelve cada pocos días para siempre, y al mes dejas de abrir la app.

Y de fondo: lo que fija la memoria es el **esfuerzo de recuperar**, no leer.
Releer es de los métodos de estudio más flojos que hay, y un documento de media
hora solo se puede releer. La regla de Woźniak es el principio de mínima
información: una tarjeta, una cosa, contestable en **diez segundos**.

**Sacar tarjeta** está en el editor. Copia el trozo seleccionado a la respuesta
—la nota original **no se toca**— y te pide la pregunta, que nace vacía a
propósito: rellenarla con el texto marcado reproduciría el error que esto viene
a arreglar. La tarjeta nace en el mismo ámbito y apartado, y guarda el enlace de
vuelta (*Sale de…*) para cuando la tarjeta sola no baste.

**El aviso.** Si una nota que está en rotación pasa de 150 palabras, el editor
lo dice y ofrece las dos salidas: sacar tarjetas, o pasarla a solo consulta. No
bloquea nada — la nota larga es legítima; lo que no lo es es preguntártela como
si fuera una tarjeta.

Regla para escribir tarjetas: **si el título no es una pregunta, no es una
tarjeta**. "Nivel Junior" no se puede contestar; "¿Qué hace `git reflog` que no
hace `git log`?" sí.

**El bloc sigue al spot que estás trabajando.** Las dos mitades de la pestaña
miran el mismo spot: si estás en la ficha de *3-bet pot OOP* y pulsas *Bloc de
lógicas*, el bloc abre en el ámbito de ese spot, y al volver, *Mis spots*
selecciona el que estuvieras mirando. Lo que escribas ahí es de ese spot sin
tener que decirlo otra vez, y la barra de arriba lo está diciendo mientras
escribes.

**Buscar.** La caja de arriba busca en el título y en el cuerpo **del ámbito
abierto**, sin distinguir acentos ni mayúsculas: *salio* encuentra *salió*. Los
demás ámbitos no se tocan; si lo escribiste en otro, se cambia arriba.

**Hoy es la excepción, y a propósito.** La cola de repaso saca las notas que
vencen de *todos* los ámbitos, porque es tu repaso del día y no el bloc. Cada
tarjeta dice de qué apartado y de qué spot viene.

**Cómo entran.** Tres vías. En el **bloc**, con *Nueva lógica* — nace en el
ámbito abierto. En el detalle de un **spot**, escribiendo el título. O al
**terminar una sesión** ligada a un spot: la app pregunta qué concreto quieres
no olvidar y en qué apartado de ese spot va. Ese momento es el bueno — acabas de estudiarlo y sabes
formularlo; mañana ya no te acuerdas ni de qué querías recordar.

**Cómo salen.** Solas, en **Hoy**, el día que tocan. Una cada vez: ver quince a
la vez invita a despacharlas sin pensar, y una respuesta sin pensar corrompe el
calendario durante meses. El cuerpo está tapado hasta que pulsas *Ver la nota*,
porque recordar con la respuesta delante no fija nada.

**Las cuatro respuestas** y qué hacen con el calendario:

| Respuesta | Efecto |
|---|---|
| No me acordaba | Vuelve mañana, y crecerá más despacio para siempre |
| Me costó | Intervalo más corto de lo normal |
| Bien | Intervalo normal |
| Fácil | Intervalo más largo |

Acertando siempre, la curva es **1 → 6 → 15 → 38 → 95 → 238 → 595 días**. Pero
no todas las lógicas van igual: una que fallas se queda repasándose cada 13
días mientras una fácil salta a 147. Ese reparto desigual es el método entero.

También puedes **aplazar sin responder** ("Hoy no"). Existe a propósito: si la
única salida fuera responder, un día con prisa acabaría con todo marcado
"bien" sin pensarlo, y eso sí estropea el calendario.

Las dos piezas delicadas viven aparte, sin interfaz y sin datos, y con sus
propias pruebas ejecutables desde node:

- [`app/js/repaso.js`](app/js/repaso.js) — el algoritmo SM-2, 30 pruebas
  (`node tools/prueba-repaso.js`). Separado porque si los intervalos crecen mal
  el daño no se ve hoy: se ve dentro de seis meses, cuando descubres que llevas
  medio año repasando lo que ya sabías.
- [`app/js/notas.js`](app/js/notas.js) — la gramática del formato, 52 pruebas
  (`node tools/prueba-notas.js`). Separado por dos razones: el resultado se
  inyecta como HTML, así que una nota sin escapar sería un agujero; y los
  fallos de un editor no se ven al escribir, se ven al releer.

## El tamaño de la ventana

La app abre a un tamaño calculado desde tu pantalla, no a un número fijo, y lo
bastante alto para que **Hoy** y **Planificar** quepan sin scroll: son vistas
de vistazo, se abren para mirar y actuar. Dashboard, Spots y Life sí se
desplazan, porque son de lectura y ahí el scroll es lo natural.

Si cambias el tamaño o mueves la ventana, se recuerda para la próxima vez. Y
si esa posición deja de existir —desconectas un monitor, cambias de
resolución— se descarta y vuelve al tamaño calculado, en vez de abrir fuera de
pantalla.

Hay una prueba que rellena Hoy y el mes entero con datos realistas y comprueba
que las dos siguen cabiendo. Si algún día añades un panel a Hoy, esa prueba lo
caza antes que tú.

## Cómo funciona la certificación

Mientras una sesión corre, la app te pregunta **en momentos aleatorios** (por
defecto entre 10 y 20 minutos) si sigues en la tarea. Tienes 2 minutos para
responder.

- **Confirmas** → todo el tiempo hasta ese punto queda certificado.
- **No respondes** → la sesión se pausa sola, la ventana de gracia no cuenta, y
  el tramo desde la última confirmación queda marcado como **no verificado**.

Ese tramo **no se borra**. Podrías haber estado trabajando y solo levantarte al
final. Pero tampoco se da por bueno: se reporta aparte. Por eso el dashboard
dice "tiempo certificado" y no solo "tiempo registrado" — el número grande
significa algo.

Los rangos se cambian en **Ajustes**.

## Dónde viven tus datos

Un único archivo JSON:

```
%APPDATA%\Flow\flow-data.json
```

Ajustes → *Abrir carpeta* te lleva ahí. Se escribe de forma atómica (a un
temporal y luego se renombra), así que un corte de luz a mitad de guardado no
te deja el archivo a medias. Si alguna vez queda ilegible, se aparta con
sufijo `.corrupto-<fecha>` en vez de borrarse.

Cópialo para respaldar. Eso es todo el respaldo que necesitas.

## Traer los datos del Poker HQ v1

Ajustes → *Importar de Poker HQ v1*. Trae las actividades y los días
planificados del `Poker HQ.html` viejo. El modal te da el snippet exacto para
pegar en la consola de Chrome.

## Atajos

| Tecla | Acción |
|-------|--------|
| `1` `2` `3` `4` `5` | Hoy · Planificar · Dashboard · Spots · Life |
| `Esc` | Cerrar el modal abierto |
| `↑` `↓` | En un campo de duración: subir o bajar el tiempo |
| `Enter` | En el campo de duración del planificador: agendar |

## Marca

Los originales `Flow logo C.png` (completo) y `Flow logo I.png` (isotipo) viven
en la raíz. De ahí sale todo lo demás:

```bash
electron tools/logos.js
```

Recorta al contenido real, centra el isotipo en un cuadrado con margen y
exporta a `app/assets/`: `logo.png` y `logo@3x.png` para la cabecera,
`icon-{512,256,128,64,48,32,16}.png` para ventana y barra de tareas, y
`flow.ico` para el acceso directo del Escritorio.

Si cambias los originales, vuelve a correrlo y luego rehaz el acceso directo
con `tools\acceso-directo.ps1`. No edites `app/assets/` a mano.

## Pasársela a otra persona

```bash
npm run dist
```

Deja **`dist/Flow-2.0.0-instalador.exe`**, unos 71 MB. Ese único archivo es todo
lo que hay que enviar: lleva dentro Electron entero, así que en la otra máquina
no hace falta Node, ni npm, ni terminal.

Se instala **para el usuario, no para la máquina**: no pide permisos de
administrador, crea el acceso directo del Escritorio y del menú Inicio, y
aparece en "Agregar o quitar programas" con su desinstalador.

Tres cosas que conviene avisar antes de mandarlo:

**No cabe por WhatsApp ni por correo.** 71 MB. Google Drive, WeTransfer o un
USB.

**Windows va a dar un aviso.** El ejecutable no está firmado —una firma de
código cuesta dinero todos los años— así que SmartScreen dice *"Windows protegió
su PC"*. Se abre igual: **Más información → Ejecutar de todas formas**. Es el
mismo aviso que sale con cualquier programa sin firmar, no significa que haya
nada malo, pero hay que avisar o la otra persona no pasa de ahí.

**Tus datos no viajan.** Dentro del instalador solo va el programa: el archivo
de datos vive en `%APPDATA%\Flow` de cada máquina y nunca entra en el paquete.
Tu amigo abre Flow y se encuentra la app vacía, con los spots, actividades y
apartados de fábrica.

Para comprobar que el empaquetado funciona antes de mandarlo, la suite completa
se puede correr contra el ejecutable ya construido:

```bash
HQ_SELFTEST=1 ./dist/win-unpacked/Flow.exe
```

## Desarrollo

```bash
HQ_SELFTEST=1 npm start        # prueba de humo (~60s, 133 comprobaciones)
HQ_SELFTEST=2 npm start        # + verificaciones contra el reloj real (~4min, 143)
node tools/prueba-repaso.js    # algoritmo de repaso espaciado (30)
node tools/prueba-notas.js     # formato de las notas del bloc (121)
node tools/prueba-datos.js     # resistencia del archivo de datos (71)
HQ_SHOTS=1    npm start   # capturas con datos de ejemplo en ./shots
HQ_DEBUG=1    npm start   # consola del renderer en la terminal
```

Las pruebas y las capturas escriben en un almacén temporal aparte, nunca en
tus datos reales.

## Estructura

```
main.js       Proceso principal: ventanas, cronómetro, verificaciones, IPC
store.js      Persistencia JSON atómica
preload.js    Puente seguro entre proceso principal y ventanas
app/          Ventana principal (vistas, gráficas SVG, modales)
app/assets/   Marca generada — no editar a mano
widget/       Widget flotante
tools/        Generador de assets de marca y del acceso directo
```

El cronómetro vive en el proceso principal, no en una ventana. Por eso el
tiempo sigue corriendo si cierras la ventana grande y dejas solo el widget, y
las dos nunca pueden discrepar sobre cuánto llevas. Las gráficas son SVG
escrito a mano: sin librerías de terceros que actualizar.
