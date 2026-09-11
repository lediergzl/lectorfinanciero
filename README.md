# Lector de Transferencias

MVP de una app Android (Capacitor + JS vanilla) que lee los SMS del
dispositivo, detecta transferencias bancarias (Transfermóvil, EnZona,
bancos cubanos), pide catalogar cada número la primera vez, y acumula
totales mensuales por persona.

100% local, sin backend.

## Sin Node ni TypeScript

Este proyecto **no depende de Node.js, npm ni TypeScript para compilar**.
Todo lo que antes requería esas herramientas fue migrado:

- `capacitor.config.ts` → `capacitor.config.json` (config plana, sin TS).
- El frontend ya no se compila con Vite: es JS plano con módulos ES
  (`<script type="module">`), servido directamente desde `www/`.
- `src/services/smsReader.js` y `src/services/database.js` ya no
  importan los paquetes npm `@capacitor/core` / `@capacitor-community/sqlite`:
  usan directamente el objeto global `window.Capacitor` que el propio
  runtime nativo de Capacitor inyecta en el WebView de la app.
- El código nativo de `@capacitor/android` y `@capacitor-community/sqlite`
  ya está copiado ("vendorizado") dentro de `android/capacitor-android/`
  y `android/capacitor-community-sqlite/`. `android/capacitor.settings.gradle`
  apunta a esas carpetas locales en vez de a `node_modules/`.

Con esto, **compilar solo requiere JDK 17 + Android SDK + Gradle**
(vía `./gradlew`, sin Android Studio). Node solo sirve, de forma
opcional, para correr `node test-parser.mjs` y probar las expresiones
regulares del parser en tu computadora antes de tocar Android — pero
ni siquiera eso requiere `npm install` (el script no tiene dependencias
externas).

## Estructura del proyecto

```
lector-transferencias/
├── capacitor.config.json        # config de Capacitor (JSON, sin TS)
├── index.html                   # fuente original (referencia)
├── www/                         # sitio estático ya listo, sin build
│   ├── index.html
│   └── src/                     # copia de src/, JS plano con módulos ES
├── sync-android.sh              # reemplaza "npx cap sync" (solo bash/cp)
├── test-parser.mjs              # prueba rápida del parser (node puro)
├── src/
│   ├── main.js                  # orquestador principal
│   ├── parser/
│   │   ├── patterns.js          # regex genéricas (teléfono, monto, fecha, tipo)
│   │   ├── index.js             # elige el parser de banco y normaliza
│   │   └── banks/
│   │       ├── recarga-y-transferencia-completada.js
│   │       ├── transferencia-recibida.js
│   │       ├── transferencia-saliente-cuenta.js
│   │       ├── transfermovil.js
│   │       ├── enzona.js
│   │       └── generic.js       # fallback para bancos no identificados
│   ├── services/
│   │   ├── database.js          # llama a window.Capacitor.Plugins.CapacitorSQLite
│   │   └── smsReader.js         # llama a window.Capacitor.registerPlugin
│   └── ui/
│       ├── styles.css
│       └── render.js            # funciones de pintado del DOM
├── android-plugin/               # plugin nativo Java personalizado (fuente)
│   └── src/main/java/com/lectortransferencias/sms/
│       ├── SmsReaderPlugin.java
│       └── IncomingSmsReceiver.java
├── android/                      # proyecto Android nativo, ya generado
│   ├── capacitor-android/               # código nativo vendorizado (sin node_modules)
│   ├── capacitor-community-sqlite/      # código nativo vendorizado (sin node_modules)
│   ├── capacitor-cordova-android-plugins/
│   ├── app/
│   │   └── src/main/
│   │       ├── AndroidManifest.xml      # ya con permisos SMS + receiver
│   │       ├── java/
│   │       │   ├── cu/lectortransferencias/app/MainActivity.java   # plugin ya registrado
│   │       │   └── com/lectortransferencias/sms/                   # plugin ya copiado
│   │       └── assets/public/           # copia de www/ (generada por sync-android.sh)
│   └── gradlew
└── docs/
    ├── ejemplos-sms.md
    ├── android-manifest-snippet.xml     # referencia histórica
    └── MainActivity-ejemplo.java        # referencia histórica
```

## 1. Probar el parser (opcional, sin instalar nada)

```bash
node test-parser.mjs
```

Solo necesitas tener Node instalado (cualquier versión reciente).
No hay `npm install` que correr: el script no tiene dependencias.
Esto valida que las expresiones regulares reconocen correctamente los
SMS de ejemplo en `docs/ejemplos-sms.md`.

## 2. Si editas el frontend (src/*.js, index.html)

No hay build. Simplemente:

1. Edita los archivos dentro de `src/` (o `index.html`).
2. Copia tus cambios a `www/` (que es lo que se empaqueta en el APK):
   ```bash
   cp -r src www/
   cp index.html www/index.html   # solo si tocaste index.html
   ```
3. Sincroniza con el proyecto Android nativo:
   - **Linux/macOS/Git Bash/WSL:**
     ```bash
     ./sync-android.sh
     ```
   - **Windows (cmd, sin Git Bash):**
     ```bat
     sync-android.bat
     ```

Estos scripts son solo `cp`/`xcopy` — copian `www/` dentro de
`android/app/src/main/assets/public/` y actualizan
`capacitor.config.json` en los assets. Hacen lo mismo que hacía
`npx cap sync`, sin necesitar Node.

### ⚠️ NUNCA ejecutes `npx cap sync` / `npx cap add` / `npx cap open`

Esos comandos son el **Capacitor CLI real** (`@capacitor/cli`), que
necesita Node, npm y además intenta leer `capacitor.config.ts` con
TypeScript — exactamente lo que esta migración eliminó. Si los
ejecutas, vas a ver errores como:

```
[error] Could not find installation of TypeScript.
        To use capacitor.config.ts files, you must install TypeScript...
```

Eso pasa porque `npx cap` invoca el CLI de Capacitor, que por defecto
busca `capacitor.config.ts` (no lee directamente `capacitor.config.json`
salvo que sea el único archivo de config, y aun así requiere el CLI
instalado vía npm). Usa siempre `sync-android.sh` / `sync-android.bat`
en su lugar — son scripts propios de este proyecto, no el CLI de
Capacitor.

## 3. Requisitos para compilar (solo estos tres)

- **JDK 17** (Capacitor 6 / Android Gradle Plugin 8.2.1 lo requiere).
- **Android SDK** — con `platforms;android-34` y `build-tools;34.0.0`
  instalados (basta con los "Command line tools", no hace falta
  Android Studio).
- Licencias del SDK aceptadas (`sdkmanager --licenses`).

Crea `android/local.properties` apuntando a tu SDK:

```
sdk.dir=/ruta/absoluta/a/tu/android-sdk
```

## 4. Compilar el APK con gradlew

```bash
cd android
chmod +x gradlew        # solo la primera vez
./gradlew assembleDebug
```

La primera ejecución descarga Gradle 8.2.1 y las dependencias de
AndroidX/Google Maven (necesita internet la primera vez; después queda
cacheado). El APK queda en:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

## 5. Instalar en el teléfono

Como usa permisos restringidos (`READ_SMS`, `RECEIVE_SMS`), esta APK
**no se puede publicar en Google Play** tal cual. Se distribuye
directamente (APK sideload), como se acordó para el ecosistema cubano.

```bash
adb install android/app/build/outputs/apk/debug/app-debug.apk
```

## Próximos pasos sugeridos (V2 en adelante)

- Reemplazar los ejemplos de `docs/ejemplos-sms.md` por SMS reales y
  afinar `src/parser/patterns.js`.
- Pantalla de categorías y edición de contactos existentes.
- Exportar a Excel/PDF (función Premium propuesta en el plan de producto).
- Detección de transferencias recurrentes (mismo contacto, monto
  similar, 3+ meses consecutivos).
- Backup/restauración de la base SQLite local.
