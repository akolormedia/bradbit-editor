# Instalar Bradbit Editor en macOS

[English](INSTALL.md) · [Volver al README](../README.md)

Bradbit Editor es una aplicación de escritorio para macOS, distribuida como build **universal** para **Apple Silicon e Intel**. Está firmada de forma ad-hoc pero **no está notarizada**, así que el primer arranque necesita una confirmación adicional de macOS.

## Requisitos

- **macOS 13 Ventura o posterior**.
- Un Mac con **Apple Silicon** o **Intel**.
- Alrededor de **1 GB** de espacio libre.
- Internet para los modelos de IA y la sincronización con GitHub (opcional para escribir sin conexión).
- **No hace falta instalar Git, Node, Rust, Xcode, Command Line Tools ni OpenCode.** El historial, las versiones y GitHub usan el motor libgit2 incluido; el runtime del agente viaja dentro de la app.

## 1. Descargar

1. Abre la página oficial de releases: <https://github.com/akolormedia/bradbit-editor/releases/latest>.
2. Descarga el último archivo terminado en **`_universal.dmg`**, por ejemplo:
   `Bradbit Editor_0.1.0-alpha.5_universal.dmg`.
3. Descarga solo desde la página oficial de releases. No uses copias de terceros.

> **Software alpha/beta:** mantén copias de seguridad de tus proyectos. La app incluye historial de versiones, pero todavía es software temprano.

## 2. Instalar

1. Haz doble clic en el `.dmg` para abrirlo.
2. Arrastra **Bradbit Editor** a la carpeta **Aplicaciones**.
3. Expulsa la imagen de disco.
4. Abre **Bradbit Editor** desde Aplicaciones (o Spotlight).

## 3. Primer arranque: «Abrir de todos modos»

Como la app aún no está notarizada, macOS bloquea el primer arranque con un mensaje parecido a *«Apple no ha podido verificar que Bradbit Editor no contiene software malicioso»*. Es lo esperado.

1. Intenta abrir la app una vez y cierra el aviso.
2. Abre **Ajustes del Sistema → Privacidad y seguridad**.
3. Baja hasta la sección **Seguridad**.
4. Pulsa **Abrir de todos modos** junto al mensaje de Bradbit Editor.
5. Escribe la contraseña del Mac si te la pide y pulsa **Abrir**.

Los siguientes arranques funcionarán con normalidad.

En versiones anteriores de macOS también puedes hacer **clic derecho en la app → Abrir → Abrir**. Si no ves **Abrir de todos modos**, intenta abrir la app otra vez y vuelve a **Privacidad y seguridad**.

## 4. Primeros pasos

1. Abre una carpeta o crea un proyecto desde la pantalla de bienvenida.
2. Revisa la tarjeta **Primeros pasos**: motor Bradbit, historial, modelo de IA y plantillas.
3. Para usar el chat, pulsa **Conectar modelo** y sigue el asistente. Las claves se guardan en el **Keychain** de macOS, nunca en el proyecto.
4. Usa **Versiones** para guardar una versión, revisar cambios, restaurar un archivo o crear borradores paralelos. No hace falta instalar Git.

## Solución de problemas

### «Apple no ha podido verificar…» sigue apareciendo

Usa **Ajustes del Sistema → Privacidad y seguridad → Abrir de todos modos**. Si el botón no aparece, intenta abrir la app otra vez y vuelve a esa pantalla. En sistemas anteriores, haz clic derecho en la app y elige **Abrir**.

### «Bradbit Editor está dañado y no se puede abrir»

Normalmente significa que la descarga está incompleta o que es un alpha antiguo con una firma inválida.

1. Borra la app de Aplicaciones.
2. Vuelve a descargar el último `_universal.dmg` desde la página oficial.
3. Arrástralo a Aplicaciones y repite el paso **Abrir de todos modos**.

No uses un DMG alpha antiguo. Si el mensaje continúa con la última versión, abre un issue e incluye tu versión de macOS y la versión de la app.

### La app se abre pero no aparece ninguna ventana

1. Cierra Bradbit Editor por completo (`⌘Q`) y vuelve a abrirlo.
2. Confirma que tienes macOS 13 o posterior.
3. Si sigue fallando, abre un issue con tu versión de macOS, modelo de Mac y versión de la app.

### «The Bradbit agent runtime was not found» / «No se encontró el runtime de Bradbit»

El runtime `bradbit` está dentro del bundle de la app. Reinstala desde el DMG y no muevas el ejecutable fuera de `Bradbit Editor.app`. Si compilas desde el código, ejecuta `npm run fetch:bradbit`.

### La conexión con el modelo falla

Abre el asistente **Conectar modelo** y usa **Probar conexión**:

- Un **401/403** suele significar que la API key es incorrecta o ha caducado.
- Un **429** significa que el proveedor está limitando las peticiones; espera y vuelve a intentarlo.
- Si el proveedor no ofrece un endpoint de prueba, usa **Guardar sin probar** y compruébalo desde el chat.

### La sincronización con GitHub falla

Crea un token de GitHub con permisos de repositorio, pégalo en **Ajustes → GitHub** y verifica la cuenta. GitHub es opcional; escribir y guardar versiones locales funciona sin él.

### El historial no funciona

El historial está incluido en la app y no usa el Git del sistema. Comprueba que la carpeta tenga permisos de escritura y, si el problema continúa, reinstala la última versión y abre un issue.

## Seguridad y privacidad

- La app está **firmada de forma ad-hoc pero no notarizada** porque todavía no hay Apple Developer Program. Por eso hay que usar **Abrir de todos modos** una vez.
- Bradbit no requiere cuenta. Los proyectos se quedan en tu Mac.
- Las claves de los proveedores de IA se guardan en el **Keychain de macOS** y solo se envían al proveedor que configures.
- La red se usa para las peticiones de IA y, si lo eliges, para GitHub.
- La app todavía no se actualiza automáticamente. Descarga las nuevas versiones desde la página oficial de releases.

## Desinstalar

1. Cierra Bradbit Editor.
2. Arrastra **Bradbit Editor** de Aplicaciones a la Papelera.
3. Opcional: borra los ajustes y las plantillas de `~/Library/Application Support/Bradbit`.
4. Opcional: borra las claves guardadas desde **Acceso a Llaveros** (busca `bradbit`).

## Ayuda

- Issues: <https://github.com/akolormedia/bradbit-editor/issues>
- Changelog: [`CHANGELOG.md`](../CHANGELOG.md)
- Compilar desde el código: consulta el [README](../README.md#installation-alpha).

Al reportar un problema, incluye tu versión de macOS, modelo de Mac (Apple Silicon o Intel), versión de Bradbit y el mensaje exacto.
