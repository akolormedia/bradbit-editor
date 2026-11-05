# Bradbit Editor (`bradbit-editor`)

Editor de texto de escritorio agnóstico para escritura creativa (`.md`, `.mdx`, `.fountain`, `.txt`), construido con **Tauri v2**, **CodeMirror 6** y **Rust**.

## Características (Stories 1.1–1.3)

- **Menú nativo de macOS (`Story 1.1.1`):** La barra superior del sistema incluye **Bradbit Editor, Archivo, Edición, Visualización y Ventana**:
  - *Archivo:* Abrir carpeta (`⌘O`), Abrir reciente, Nuevo proyecto (`⇧⌘N`), Guardar como plantilla, Abrir carpeta de plantillas, Apertura rápida (`⌘P`), Nuevo archivo (`⌘N`), Guardar (`⌘S`), Exportar PDF (`⌘E`) y Cerrar pestaña (`⌘W`).
  - *Edición:* Deshacer/Rehacer conectados al historial de cada pestaña, Negrita (`⌘B`) y Cursiva (`⌘I`) en Markdown/MDX, Cortar/Copiar/Pegar/Seleccionar todo, Buscar (`⌘F`), Buscar y reemplazar (`⌥⌘F`) y Buscar en proyecto (`⌘⇧F`).
  - *Visualización:* Mostrar/ocultar explorador (`⌘⇧E`), Vista previa (`⌘⌥P`), Ajuste de línea, Números de línea y Pantalla completa.
  - *Ventana:* Minimizar, Zoom y Traer todo al frente.
  - Los ítems se habilitan, deshabilitan y marcan según el estado real, y las etiquetas cambian con el idioma.
- **Cualquier carpeta es un proyecto:** Abre cualquier carpeta del disco sin requerir archivos de configuración propietarios (`project.yaml`).
- **Pantalla de bienvenida y proyectos recientes:** Abre carpetas del disco o retoma cualquiera de tus proyectos recientes en un clic.
- **Nuevo proyecto y plantillas (`T-1.3.2`):**
  - **Nuevo proyecto (`⇧⌘N`)** desde la pantalla de bienvenida, la barra superior o el menú *Archivo*: elige plantilla, nombre y carpeta de destino.
  - Plantillas integradas: **Guion Audiovisual (`guionista-kit`)** con biblia, estructura, guion, investigación, agentes, comandos y skills; y **Proyecto en blanco**.
  - **Plantillas de usuario:** cualquier carpeta en `~/Library/Application Support/Bradbit/templates/` aparece automáticamente en el selector.
  - Al crear el proyecto se ejecuta **`git init`** si Git está disponible y la app abre la carpeta resultante.
  - **Guardar proyecto actual como plantilla…** y **Abrir carpeta de plantillas** desde el modal y el menú *Archivo*.
- **Explorador de archivos lateral redimensionable y colapsable (`⌘⇧E`):**
  - Pestañas **Archivos | Esquema** en el panel lateral.
  - Oculta por defecto `.git`, `.DS_Store` y `.opencode` con opción *Mostrar archivos de configuración*.
  - Acciones integradas: Nuevo archivo (`⌘N`), Nueva carpeta, Renombrar y Eliminar (con confirmación).
- **Esquema del documento (`T-1.2.2`):**
  - En Markdown/MDX: encabezados (`#`, `##`, `###`…) clicables que saltan a la línea exacta.
  - En Fountain: secciones (`# Acto`) y escenas (`INT.`, `EXT.`, `I/E.`, `.forzada`) con jerarquía y conteo estimado de páginas (`~N páginas`).
  - Se actualiza automáticamente al escribir y funciona también desde la vista previa (al hacer clic vuelve a edición y salta a la línea).
- **Búsqueda y navegación rápida (`T-1.2.4`):**
  - **Apertura rápida (`⌘P`):** paleta que filtra cualquier archivo del proyecto por nombre o ruta y lo abre con Enter.
  - **Buscar en proyecto (`⌘⇧F`):** búsqueda de texto en todos los archivos con resultados `ruta:línea` y fragmento; Enter abre el archivo en la línea exacta.
  - Ambas paletas respetan el ajuste *Mostrar archivos de configuración* y funcionan con navegación por teclado (`↑↓`, Enter, Esc).
- **Pestañas inteligentes:**
  - Un clic abre en modo *preview* (cursiva); doble clic o editar fija la pestaña.
  - Indicador de cambios sin guardar (`•`), cierre seguro con confirmación (`⌘W`) y guardado atómico en disco (`⌘S`).
- **Edición profesional con CodeMirror 6:**
  - Deshacer/rehacer por pestaña, buscar y reemplazar en el archivo (`⌘F`), *word wrap*, números de línea opcionales, corrector ortográfico nativo y resaltado para Markdown y Fountain.
  - Negrita (`⌘B`) y cursiva (`⌘I`) en Markdown/MDX, con selección o cursor entre marcadores.
- **Fountain 1.1 y exportación a PDF (`T-1.2.3`):**
  - Resaltado diferenciado de escenas, secciones, transiciones, personajes, diálogos, paréntesis y notas `[[...]]`.
  - **Exportar PDF (`⌘E`)** desde la cabecera del documento o el menú *Archivo*: genera un PDF determinista con formato de guion (US Letter, Courier 12pt, 55 líneas por página, reglas de `(MORE)` / `(CONT'D)` y numeración de páginas).
  - El PDF se guarda en `exports/` del proyecto conservando la subcarpeta del guion (`exports/guion/acto-1.pdf`) y se abre automáticamente en el visor del sistema. Funciona sin conexión a internet.
- **Cabecera del documento y vista previa de lectura (`T-1.2.1`):**
  - La cabecera sobre el editor muestra el nombre y la ruta del archivo activo, con acciones **Copiar**, **`</>` Vista previa / Editar** (Markdown) y **PDF** (Fountain).
  - Vista previa Markdown/MDX renderizada y sanitizada (`⌘⌥P`), con soporte de encabezados, listas, citas, código, tablas y enlaces.
  - Los enlaces externos se abren en el navegador; los enlaces relativos del proyecto se abren directamente en el editor.
- **Ajustes de aplicación (`⌘,`):** Idioma (Español / Inglés), tema (Oscuro / Claro / Sistema), tamaño de fuente (`12`–`24` px), ajuste de línea, números de línea y visibilidad de archivos de configuración.

## Desarrollo y pruebas

```bash
# Instalar dependencias frontend
npm install

# Ejecutar pruebas unitarias (Frontend + Rust)
npm test
cargo test --manifest-path src-tauri/Cargo.toml

# Ejecutar en modo escritorio nativo (Tauri)
npm run tauri dev
```
