# guionista-kit

Plantilla base para proyectos de guion (largometraje, serie, micro
drama) trabajados con Bradbit. Contiene los skills, agentes y
comandos comunes a cualquier proyecto, más la estructura de carpetas
de la "biblia" y el guion.

## Cómo usarla

1. Copia esta carpeta completa como el repo de tu nuevo proyecto:
   ```bash
   cp -r guionista-kit mi-proyecto-nuevo
   cd mi-proyecto-nuevo
   git init
   ```
2. Llena `biblia/premisa.md` con la idea inicial (o usa el skill
   `desarrollo-idea` para construirla con ayuda).
3. Ve llenando `biblia/personajes/` (un archivo por personaje) y
   `biblia/mundo/` a medida que el proyecto avanza.
4. Elige un método de estructura en `.bradbit/skills/metodos-estructura/`
   y escribe la escaleta en `estructura/`.
5. Escribe el guion en `guion/*.fountain`.

## Qué hay en `.bradbit/`

- **skills/** — procesos: desarrollo de idea, investigación, fichas
  de personaje, métodos de estructura narrativa, escaleta, escritura
  de escenas, formato Fountain, micro drama, script editor.
- **agents/** — roles con permisos distintos: `guionista` (escribe),
  `editor` (solo da notas, no modifica), `investigador` (solo
  investiga y anota fuentes), `personaje` (chatea en la voz de un
  personaje de la biblia, para probar diálogos).
- **commands/** — atajos: `/idea`, `/investigar`, `/personaje`,
  `/estructura`, `/escena`, `/revisar`, `/voz`.

## Roadmap de este kit (para ir mejorándolo)

- **v0 (actual):** idea, personajes, estructura (2-3 métodos),
  escaleta, agente editor.
- **v1:** escribir-escena más pulido, `/voz` para probar diálogos,
  validador de formato Fountain.
- **v2:** investigación web con fuentes anotadas, micro drama,
  más métodos de estructura, exportación a PDF/Celtx.
- **v3:** documentación amigable para que la use más gente del
  equipo, no solo quien lo construyó.

Nota técnica: Bradbit lee `.bradbit/` como carpeta canónica. Si abres
el kit con OpenCode upstream, renombra `.bradbit/` a `.opencode/`; Bradbit
también sigue leyendo `.opencode/` como compatibilidad legacy.
