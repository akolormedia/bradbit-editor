# Bradbit Editor (`bradbit-editor`)

Editor de texto de escritorio agnóstico para escritura creativa (`.md`, `.mdx`, `.fountain`, `.txt`), construido con **Tauri v2**, **CodeMirror 6** y **Rust**.

## Características (Story 1.1)

- **Menú nativo de macOS (`Story 1.1.1`):** La barra superior del sistema incluye **Bradbit Editor, Archivo, Edición, Visualización y Ventana**:
  - *Archivo:* Abrir carpeta (`⌘O`), Abrir reciente, Nuevo archivo (`⌘N`), Guardar (`⌘S`) y Cerrar pestaña (`⌘W`).
  - *Edición:* Deshacer/Rehacer conectados al historial de cada pestaña, Cortar/Copiar/Pegar/Seleccionar todo, Buscar (`⌘F`) y Buscar y reemplazar (`⌥⌘F`).
  - *Visualización:* Mostrar/ocultar explorador (`⌘B`), Ajuste de línea, Números de línea y Pantalla completa.
  - *Ventana:* Minimizar, Zoom y Traer todo al frente.
  - Los ítems se habilitan, deshabilitan y marcan según el estado real, y las etiquetas cambian con el idioma.
- **Cualquier carpeta es un proyecto:** Abre cualquier carpeta del disco sin requerir archivos de configuración propietarios (`project.yaml`).
- **Pantalla de bienvenida y proyectos recientes:** Abre carpetas del disco o retoma cualquiera de tus proyectos recientes en un clic.
- **Explorador de archivos lateral redimensionable y colapsable (`⌘B`):**
  - Oculta por defecto `.git`, `.DS_Store` y `.opencode` con opción *Mostrar archivos de configuración*.
  - Acciones integradas: Nuevo archivo (`⌘N`), Nueva carpeta, Renombrar y Eliminar (con confirmación).
- **Pestañas inteligentes:**
  - Un clic abre en modo *preview* (cursiva); doble clic o editar fija la pestaña.
  - Indicador de cambios sin guardar (`•`), cierre seguro con confirmación (`⌘W`) y guardado atómico en disco (`⌘S`).
- **Edición profesional con CodeMirror 6:**
  - Deshacer/rehacer por pestaña, buscar y reemplazar en el archivo (`⌘F`), *word wrap*, números de línea opcionales, corrector ortográfico nativo y resaltado para Markdown y Fountain.
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
