# Flow

App de escritorio (Electron) para estudiar: planificación diaria, tiempo
certificado por verificaciones aleatorias, apuntes con imágenes y repetición
espaciada. Ver README.md para la arquitectura.

## La oficina (pestaña Estudio)

Cuatro niveles, y cada uno es una colección en el archivo de datos:

    estante  → spotGroups   desplegable en la cabecera
    tema     → spots        el cajón: "Git y control de versiones"
    carpeta  → noteTypes    "Comandos", "Ramas y merge"
    papel    → reviews      teoría + imágenes + tarjetas

El papel NO es una tarjeta: es el documento, y sus tarjetas cuelgan de él con
un calendario SM-2 cada una. Hoy saca tarjetas, no papeles.

Cada nivel se lista SIEMPRE dentro de su padre: los temas son los de un
estante, los papeles los de un tema. Así que un hijo sin padre no aparece en
ninguna pantalla — sigue en el archivo y parece borrado. Dos reglas de ahí:

- Nada se crea sin padre. El modal de tema trae puesto el estante que estás
  mirando y no ofrece "Sin estante" habiendo estantes.
- Lo que se queda sin padre se recoge. La pantalla "Papeles sueltos" sale junto
  a los temas (no pertenece a ningún estante) y reúne los papeles sin tema, los
  temas sin estante y las carpetas sin tema, con un desplegable para devolver
  cada uno a su sitio, o para tirarlo sin tener que colocarlo antes. Borrar un
  tema NO borra sus papeles ni un estante sus temas: caen ahí.
- Lo que se crea se borra. El estante se renombra y se elimina con el lápiz de
  la cabecera; sin él su modal no tenía puerta y era de solo lectura.

Las imágenes viven sueltas en `<datos>/imagenes/`, se enlazan desde el texto
con `[[nombre]]` — y el enlace lo escribe la app al pegarlas, no tú: escribirlo
a mano era acertar un nombre que no habías visto ("captura"), y fallar dejaba
un aviso sin salida con la imagen entera al lado. Un enlace que no cuadra abre
el modal que enseña las imágenes del papel y lo repara de un clic — y se leen bajo demanda como data URL (la CSP sigue cerrada:
solo `self` y `data:`). El panel de la derecha se ensancha y tiene tamaño real,
pero nunca se pone encima del texto: la teoría conserva 400px como mínimo.

## Eventos (pestaña Planificar)

Un evento NO es plan. El plan son horas que cumples o no; un evento es un punto
en el tiempo que simplemente llega — una entrega, una reunión. Por eso vive en
`events`, no suma horas y no entra en ninguna cuenta de cumplimiento.

El aviso lo decide `main.js`, no la ventana, por lo mismo que el cronómetro: un
recordatorio que solo funciona con la pantalla abierta no es un recordatorio.
Una ronda cada 30s, una al arrancar para recuperar lo vencido con la app
cerrada, y nada que venciera hace más de 6h (abrir Flow el jueves no puede
soltar de golpe los avisos del lunes). Un evento sin hora se avisa contando
desde las 9:00. Mover un evento o cambiar su antelación rearma el aviso.

Para que el aviso llegue de verdad hay tres piezas que no se ven:
`app.setAppUserModelId` (sin él Windows no enseña la notificación, y sin dar
error), el bloqueo de instancia única, y `--oculto` con
`setLoginItemSettings` — solo en la app empaquetada: en desarrollo registraría
electron.exe.

## Simbolos y formulas

Se escriben por su nombre de LaTeX y se convierten AL TECLEAR, en el propio
textarea: \sigma + espacio queda como una σ de verdad en el archivo. Guardar
el nombre en crudo romperia la busqueda, la copia fuera de Flow y la pregunta
de una tarjeta. La tabla y el renderizador viven en `notas.js` (puros, con
pruebas), asi que los heredan el papel, la respuesta de una tarjeta en Hoy y la
exportacion sin trabajo extra.

    $ORMULA$        en linea: simbolos, subindices, superindices
    $$ ... $$     en bloque: ademas fracciones apiladas y raices

El bloque tambien se abre con $$ en su linea y se cierra con otro $$ mas abajo.

`_` y `^` funcionan SOLO dentro de una formula. Fuera son texto: si el
subindice valiera en cualquier sitio, `flow_data.json` o `user_name` saldrian
con media palabra encogida y debajo de la linea, en silencio.

Los limites, a proposito: la fraccion se apila solo en bloque (en linea
levantaria el renglon del parrafo), y la raiz cubre un nivel de parentesis
dentro. Mas que eso pedia una libreria de LaTeX, y eso es 1,2 MB de fuentes y
la primera dependencia de la app.

## Repetir en el plan

Agendar repite sobre un TRAMO, no sobre el mes: del día que abres al que diga
"Hasta el". Con el mes como única unidad había que elegir entre un solo día o
todos los lunes que quedaran, y "esta asignatura todos los días hasta el
examen" no se podía decir. Los atajos (todos los días / entre semana / fin de
semana) evitan picar los siete chips a mano. El pasado no se toca nunca.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

## Pruebas

Cuatro suites, 450 comprobaciones en total:

- `HQ_SELFTEST=1 npm start` — app completa (191) · `HQ_SELFTEST=2` (202, incluye
  verificaciones contra el reloj real). Escriben en un almacén temporal aparte,
  nunca en los datos reales del usuario.
- `node tools/prueba-repaso.js` — algoritmo SM-2 (30), sin interfaz.
- `node tools/prueba-notas.js` — formato de las notas, sus marcas y las
  fórmulas (150), sin interfaz.
- `node tools/prueba-datos.js` — resistencia del archivo de datos (79).

El almacén de pruebas (`%TEMP%/flow-pruebas`) **persiste entre corridas** y el
selftest borra el ámbito "Salud" sin reponerlo: a partir de la segunda corrida
fallan dos comprobaciones de Life. Borra `flow-data.json` de esa carpeta antes
de correrlo.

## Empaquetar

`npm run dist` deja `dist/Flow-<version>-instalador.exe` (NSIS, por usuario, sin
admin). La suite completa se puede correr contra el ejecutable ya construido:
`HQ_SELFTEST=1 ./dist/win-unpacked/Flow.exe`. Sin firma de código, así que
SmartScreen avisa en la máquina de destino.
