# Lector de Transferencias

MVP de una app Android (Capacitor + JS vanilla) que lee los SMS del
dispositivo, detecta transferencias bancarias (Transfermóvil, EnZona,
bancos cubanos), pide catalogar cada número la primera vez, y acumula
totales mensuales por persona.

100% local, sin backend.

## Estructura del proyecto

```
lector-transferencias/
├── package.json
├── capacitor.config.ts
├── index.html
├── test-parser.mjs              # prueba rápida del parser sin Android
├── src/
│   ├── main.js                  # orquestador principal
│   ├── parser/
│   │   ├── patterns.js          # regex genéricas (teléfono, monto, fecha, tipo)
│   │   ├── index.js             # elige el parser de banco y normaliza
│   │   └── banks/
│   │       ├── transfermovil.js
│   │       ├── enzona.js
│   │       └── generic.js       # fallback para bancos no identificados
│   ├── services/
│   │   ├── database.js          # SQLite: contactos, transacciones, resumen mensual
│   │   └── smsReader.js         # wrapper JS del plugin nativo
│   └── ui/
│       ├── styles.css
│       └── render.js            # funciones de pintado del DOM
├── android-plugin/               # plugin nativo Kotlin/Java personalizado
│   └── src/main/java/com/lectortransferencias/sms/
│       ├── SmsReaderPlugin.java
│       └── IncomingSmsReceiver.java
└── docs/
    ├── ejemplos-sms.md
    ├── android-manifest-snippet.xml
    └── MainActivity-ejemplo.java
```

## 1. Instalación de dependencias

```bash
npm install
```

## 2. Probar el parser sin Android (recomendado primero)

```bash
node test-parser.mjs
```

Esto valida que las expresiones regulares reconocen correctamente los
SMS de ejemplo en `docs/ejemplos-sms.md`. Cuando tengas SMS reales de
Transfermóvil/EnZona/bancos, reemplaza los ejemplos ahí y reajusta
`src/parser/patterns.js` si algún campo no se extrae bien.

## 3. Build del frontend

```bash
npm run build
```

Esto genera `dist/`, que es lo que Capacitor empaqueta dentro del APK.

## 4. Añadir la plataforma Android

```bash
npx cap add android
npx cap sync android
```

## 5. Integrar el plugin nativo de SMS (manual, una sola vez)

Capacitor no tiene un plugin oficial fiable para leer el historial de
SMS + escuchar entrantes, así que este proyecto incluye uno propio en
`android-plugin/`. Como es un plugin **local** (no publicado en npm),
hay que copiarlo dentro del proyecto Android generado:

```bash
mkdir -p android/app/src/main/java/com/lectortransferencias/sms
cp android-plugin/src/main/java/com/lectortransferencias/sms/*.java \
   android/app/src/main/java/com/lectortransferencias/sms/
```

Luego:

1. **Permisos y receiver**: copia el contenido de
   `docs/android-manifest-snippet.xml` dentro de
   `android/app/src/main/AndroidManifest.xml` (permisos como hijos de
   `<manifest>`, el `<receiver>` dentro de `<application>`).

2. **Registrar el plugin en MainActivity**: edita
   `android/app/src/main/java/.../MainActivity.java` siguiendo el
   ejemplo de `docs/MainActivity-ejemplo.java` (hay que llamar a
   `registerPlugin(SmsReaderPlugin.class)` **antes** de `super.onCreate()`).

## 6. Compilar el APK

```bash
npx cap sync android
npx cap open android
```

Esto abre Android Studio. Desde ahí: `Build > Build Bundle(s) / APK(s) > Build APK(s)`.

También puedes compilar por línea de comandos con Gradle una vez
abierto el proyecto al menos una vez en Android Studio:

```bash
cd android
./gradlew assembleDebug
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.

## 7. Instalar en el teléfono

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
