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

Las imágenes viven sueltas en `<datos>/imagenes/`, se enlazan desde el texto
con `[[nombre]]` y se leen bajo demanda como data URL (la CSP sigue cerrada:
solo `self` y `data:`). El panel de la derecha se ensancha y tiene tamaño real,
pero nunca se pone encima del texto: la teoría conserva 400px como mínimo.

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

Cuatro suites, 355 comprobaciones en total:

- `HQ_SELFTEST=1 npm start` — app completa (133) · `HQ_SELFTEST=2` (143, incluye
  verificaciones contra el reloj real). Escriben en un almacén temporal aparte,
  nunca en los datos reales del usuario.
- `node tools/prueba-repaso.js` — algoritmo SM-2 (30), sin interfaz.
- `node tools/prueba-notas.js` — formato de las notas y sus marcas (121), sin interfaz.
- `node tools/prueba-datos.js` — resistencia del archivo de datos (71).

El almacén de pruebas (`%TEMP%/flow-pruebas`) **persiste entre corridas** y el
selftest borra el ámbito "Salud" sin reponerlo: a partir de la segunda corrida
fallan dos comprobaciones de Life. Borra `flow-data.json` de esa carpeta antes
de correrlo.

## Empaquetar

`npm run dist` deja `dist/Flow-<version>-instalador.exe` (NSIS, por usuario, sin
admin). La suite completa se puede correr contra el ejecutable ya construido:
`HQ_SELFTEST=1 ./dist/win-unpacked/Flow.exe`. Sin firma de código, así que
SmartScreen avisa en la máquina de destino.
