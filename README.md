# Bradbit Editor (`bradbit-editor`)

Editor de texto de escritorio agnóstico para escritura creativa (`.md`, `.mdx`, `.fountain`, `.txt`), construido con **Tauri v2**, **CodeMirror 6** y **Rust**.

## Características (Fase 1 + inicio de Fase 2)

- **Chat integrado con OpenCode (`T-2.1.1`):**
  - Layout dividido estilo `opencode-desktop`: **sesión de escritura a la izquierda** y `EditorWorkspace` a la derecha, con divisor redimensionable.
  - Los botones **💬** y **◫** de la barra superior muestran/ocultan el chat y el editor sin perder el estado de CodeMirror. Al ocultar uno, el otro ocupa todo el ancho de la ventana, con los mensajes y el composer centrados.
  - **Pestañas de sesión múltiples** con `+`, cambio y cierre; cada pestaña conserva su historial, su estado de generación y su borrador del composer.
  - **Persistencia por proyecto:** al reabrir la app se restauran las pestañas abiertas, la sesión activa, el ancho del chat y el estado de los paneles.
  - Inicia o reutiliza **`opencode serve`** automáticamente para la carpeta abierta, crea una sesión si no hay ninguna y transmite la respuesta en vivo.
  - Composer con **Enter para enviar**, **Shift+Enter** para nueva línea y botón **Detener** durante la generación.
  - **Herramientas en vivo con permisos (`T-2.1.3`):** tarjetas compactas para `read`, `edit`, `write`, `shell`, búsquedas y skills, con estado en curso/completado/error y detalle expandible de entrada y resultado. Al pulsar un archivo leído/editado se abre en el editor; si la herramienta lo modificó, el botón abre directamente su **Diff**. Si OpenCode pide permiso, aparece una tarjeta para **Permitir una vez**, **Permitir siempre** o **Rechazar**.
  - **Preguntas interactivas (`T-2.1.4`):** cuando el agente usa la herramienta `question`, aparece una tarjeta con opciones, respuesta libre y varios campos; al responder, la tarjeta queda como **Respondida** o **Cancelada** y la conversación continúa automáticamente con la respuesta del escritor.
  - **Kit del proyecto (`T-2.2.1`/`T-2.2.2`):** descubre agentes, comandos y skills de `.opencode/` y `.bradbit/`, con actualización automática al editar el kit. El composer incluye autocompletado de comandos con **`/`**, adjuntos con **`@`** o el botón **＋**, y el botón **↗** del editor envía la selección actual al chat activo.
  - **Composer estilo `opencode-desktop` (`T-2.2.3`):** panel único con placeholder instructivo, selector de **modelo** con búsqueda, recientes y agrupación por proveedor, selector de **effort/variante** separado, botón de enviar **↑** y menú **＋** con archivo de contexto, comando, agente del kit y **Gestionar modelos**. En *Ajustes → Gestionar modelos* se busca y activa/desactiva qué modelos aparecen; la visibilidad y los recientes se guardan en los ajustes.
  - **Terminal integrada (`T-2.3.1`):** botón **`>_`** en la barra inferior para alternar **Chat / Terminal** en la columna izquierda sin perder el editor ni el buffer. PTY nativo en Rust con selector **Shell / opencode / claude / comando personalizado**, resize automático, reinicio, limpieza y cierre de la sesión al cerrar la carpeta.
  - **Barra superior mínima y menú de aplicación (`T-2.4.2`):** el título del proyecto y los toggles **Chat/Editor** viven arriba; las acciones de archivo, edición, vista y ajustes se agrupan en un menú desplegable accesible con atajos. Los toggles del panel izquierdo y del terminal están en la barra inferior, junto al branch.
  - **Superficies Chat/Editor (`T-2.4.3`):** Chat/Terminal y `EditorWorkspace` se presentan como dos paneles independientes con borde, radio y separación sobre el fondo de la app, al estilo `opencode-desktop`. El árbol y el documento comparten la superficie del editor y los divisores mantienen el resize relativo al arrastre.
  - Muestra estado de conexión, errores accionables, uso de contexto/tokens y conserva el historial de la sesión mientras cambias de archivo.
  - Usa la configuración, agentes y modelos de OpenCode; Bradbit no almacena claves de modelo.

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
  - Selector compacto de iconos **Archivos / Esquema / Versiones** en el extremo izquierdo de la barra inferior; solo se muestra la sección activa y el árbol gana altura al no ocupar una fila de pestañas.
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
- **Archivos externos en vivo (`T-1.4.1`):**
  - Los cambios hechos por `opencode`, `claude` o cualquier proceso externo actualizan el árbol de archivos al instante.
  - Las pestañas limpias se recargan automáticamente.
  - Si una pestaña tiene cambios sin guardar, se conserva tu texto y aparece un aviso `⚠` con el mensaje *Cambió en disco*; nunca se sobrescribe tu borrador.
  - Los archivos eliminados cierran su pestaña si estaba limpia; si tenía cambios, se mantiene la copia para que puedas guardarla.
- **Insignias de estado Git (`T-1.4.2`):**
  - Insignias en el explorador y las pestañas: **`M`** modificado, **`+`** nuevo/untracked, **`D`** eliminado, **`R`** renombrado y **`!`** conflicto.
  - La barra inferior muestra la rama actual y los contadores `↑`/`↓` de commits adelante/atrás.
  - Las insignias se actualizan al guardar y cuando el File Watcher detecta cambios externos.
  - Los archivos eliminados del disco se reflejarán en el panel de Versiones (`T-1.4.4`), ya que dejan de existir en el árbol.
- **Visor de Diffs integrado (`T-1.4.3`):**
  - El botón **Diff** de la cabecera compara lado a lado la última versión guardada (Git `HEAD`) con el contenido actual de la pestaña, con cambios resaltados y tramos sin cambios colapsados.
  - Los archivos nuevos muestran el aviso *Archivo nuevo (sin versión guardada)* y se comparan contra un documento vacío.
  - El botón **↺ Descartar cambios** pide confirmación y restaura el archivo a `HEAD`; si es un archivo nuevo, lo elimina del disco y del índice. La pestaña, el árbol y las insignias se refrescan al instante.
  - Funciona también con cambios sin guardar: el Diff muestra el texto vivo de la pestaña y el descarte elimina tanto el borrador como los cambios en disco.
- **Panel de Versiones (`T-1.4.4`):**
  - Sección **Versiones** del selector lateral, también accesible con **`⌘⌥G`**.
  - **Guardar versión:** resume los cambios pendientes, permite escribir el resumen y firma el commit con el nombre y correo configurados en *Ajustes → Autor de las versiones*.
  - **Cambios actuales:** lista humana de archivos *Editado*, *Nuevo*, *Eliminado*, *Renombrado* o *Conflicto*; cada fila abre su Diff y ofrece descartar/restaurar.
  - **Historial de versiones:** línea de tiempo de commits con fecha y autor; al expandir una versión se inspeccionan sus archivos y se puede restaurar cualquiera de ellos sin salir del editor.
  - **Borradores paralelos:** lista de ramas Git, creación de un borrador nuevo desde la versión actual y cambio de borrador con recarga segura de las pestañas abiertas.
  - En carpetas sin Git, el panel ofrece **Activar historial** para crear el repositorio y empezar a guardar versiones.
  - Los archivos eliminados del disco ahora sí aparecen en *Cambios actuales* con su acción de restauración.
- **Sincronización con GitHub (`T-1.5.4`):**
  - **Cuenta de GitHub en Ajustes:** token guardado exclusivamente en el **Keychain de macOS** (nunca en `settings.json` ni en el proyecto), verificación de la cuenta, cierre de sesión y enlace para crear un Personal Access Token.
  - **Publicar en GitHub:** crea el repositorio remoto (privado o público) y sube la versión actual. Si ya existía un remoto que no era de GitHub, añade un remoto `github` sin tocar `origin`.
  - **Subir cambios / Traer cambios:** `push` y `pull --ff-only` con el token en el entorno del proceso Git, sin incrustarlo en la URL del remoto. La traída recarga las pestañas abiertas de forma segura.
  - **Proponer cambios al equipo:** sube el borrador actual y abre un Pull Request con título, descripción y rama base; el panel lista los Pull Requests abiertos y permite abrirlos en GitHub.
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
