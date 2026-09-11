@echo off
REM sync-android.bat
REM Script completo: sincroniza la fuente web, sincroniza Capacitor,
REM compila Debug/Release/Ambos y firma opcionalmente.
setlocal enabledelayedexpansion
cd /d "%~dp0"

set "PROJECT_ROOT=%CD%"
set "ANDROID_DIR=%PROJECT_ROOT%\android"
set "WWW_DIR=%PROJECT_ROOT%\www"
set "ASSETS_DIR=%ANDROID_DIR%\app\src\main\assets\public"
set "CONFIG_FILE=%PROJECT_ROOT%\capacitor.config.json"
set "CONFIG_DEST=%ANDROID_DIR%\app\src\main\assets\capacitor.config.json"
set "KEY_ALIAS=yode86"
set "UNSIGNED_APK=%ANDROID_DIR%\app\build\outputs\apk\release\app-release-unsigned.apk"
set "SIGNED_APK=%PROJECT_ROOT%\app-release.apk"

echo ========================================================
echo   SINCRONIZACION Y COMPILACION ANDROID (CAPACITOR)
echo ========================================================
echo.

REM --------------------------------------------------------
REM PASO 1: Regenerar WWW desde la fuente canonica
REM --------------------------------------------------------
REM IMPORTANTE:
REM La fuente real es index.html + src\.
REM www\ es una copia generada y NO debe usarse como fuente.

echo -^> Regenerando www\ desde index.html + src\ ...

if not exist "%PROJECT_ROOT%\index.html" (
    echo [ERROR] No se encuentra index.html en la raiz del proyecto.
    pause
    exit /b 1
)

if not exist "%PROJECT_ROOT%\src\main.js" (
    echo [ERROR] No se encuentra src\main.js.
    pause
    exit /b 1
)

if not exist "%PROJECT_ROOT%\src\services\smsReader.js" (
    echo [ERROR] No se encuentra src\services\smsReader.js.
    pause
    exit /b 1
)

if exist "%WWW_DIR%" rmdir /s /q "%WWW_DIR%"
mkdir "%WWW_DIR%"
if errorlevel 1 (
    echo [ERROR] No se pudo crear www\.
    pause
    exit /b 1
)

xcopy /e /i /y "%PROJECT_ROOT%\src\*" "%WWW_DIR%\src\" >nul
if errorlevel 1 (
    echo [ERROR] No se pudo copiar src\ hacia www\src\.
    pause
    exit /b 1
)

copy /y "%PROJECT_ROOT%\index.html" "%WWW_DIR%\index.html" >nul
if errorlevel 1 (
    echo [ERROR] No se pudo copiar index.html hacia www\.
    pause
    exit /b 1
)

echo [OK] www\ regenerado correctamente desde la fuente.
echo.

REM --------------------------------------------------------
REM PASO 2: Sincronizacion Capacitor / archivos web
REM --------------------------------------------------------
echo Has instalado o eliminado algun plugin de Capacitor recientemente?
echo.
echo   [1] SI - Sincronizar plugins y archivos web (requiere Node/npx)
echo   [2] NO - Solo actualizar archivos web (rapido, sin Node)
echo.
choice /c 12 /n /m "Elige una opcion [1 o 2]: "

if errorlevel 2 goto WebOnly
if errorlevel 1 goto FullSync

:FullSync
echo.
echo -^> Ejecutando sincronizacion completa de Capacitor...
where npx >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Node/npx no esta instalado.
    pause
    exit /b 1
)
call npx cap sync android
if errorlevel 1 (
    echo [ERROR] Fallo la sincronizacion con Capacitor.
    pause
    exit /b 1
)
echo [OK] Sincronizacion completa terminada.
goto ChooseBuild

:WebOnly
echo.
echo -^> Copiando www\ actualizado a los assets Android...

if not exist "%WWW_DIR%" (
    echo [ERROR] No se encuentra la carpeta "%WWW_DIR%".
    pause
    exit /b 1
)
if not exist "%CONFIG_FILE%" (
    echo [ERROR] No se encuentra "%CONFIG_FILE%".
    pause
    exit /b 1
)

if exist "%ASSETS_DIR%" rmdir /s /q "%ASSETS_DIR%"
mkdir "%ASSETS_DIR%"
if errorlevel 1 (
    echo [ERROR] No se pudo crear el directorio de assets Android.
    pause
    exit /b 1
)

xcopy /e /i /y "%WWW_DIR%\*" "%ASSETS_DIR%\" >nul
if errorlevel 1 (
    echo [ERROR] Fallo al copiar www\ a los assets Android.
    pause
    exit /b 1
)

copy /y "%CONFIG_FILE%" "%CONFIG_DEST%" >nul
if errorlevel 1 (
    echo [ERROR] Fallo al copiar capacitor.config.json.
    pause
    exit /b 1
)

echo [OK] Archivos web y configuracion Android actualizados.

REM --------------------------------------------------------
REM PASO 3: Escoger tipo de build
REM --------------------------------------------------------
:ChooseBuild
echo.
echo ========================================================
echo   QUE TIPO DE BUILD QUIERES GENERAR?
echo ========================================================
echo   [1] Debug    (rapido, para probar en tu celular)
echo   [2] Release  (para distribuir / Play Store)
echo   [3] Ambos     (Debug y Release)
echo.
choice /c 123 /n /m "Elige una opcion [1, 2 o 3]: "

if errorlevel 3 set "BUILD_TASK=assembleDebug assembleRelease" & set "DO_SIGN_PROMPT=1" & goto Compile
if errorlevel 2 set "BUILD_TASK=assembleRelease" & set "DO_SIGN_PROMPT=1" & goto Compile
if errorlevel 1 set "BUILD_TASK=assembleDebug" & set "DO_SIGN_PROMPT=0" & goto Compile

REM --------------------------------------------------------
REM PASO 4: Compilacion
REM --------------------------------------------------------
:Compile
echo.
echo -^> Compilando: %BUILD_TASK%
cd /d "%ANDROID_DIR%"
call gradlew.bat %BUILD_TASK%
if errorlevel 1 (
    echo [ERROR] Fallo la compilacion con Gradle.
    cd /d "%PROJECT_ROOT%"
    pause
    exit /b 1
)
cd /d "%PROJECT_ROOT%"
echo [OK] Compilacion terminada.
echo     Debug:   android\app\build\outputs\apk\debug\app-debug.apk
echo     Release: %UNSIGNED_APK%

REM --------------------------------------------------------
REM PASO 5: Firmar (solo si se compilo Release)
REM --------------------------------------------------------
if "%DO_SIGN_PROMPT%"=="0" goto End

echo.
choice /c SN /n /m "Quieres firmar el APK Release ahora? [S/N]: "
if errorlevel 2 goto End
if errorlevel 1 goto Sign

:Sign
echo.

REM --- Buscar keystore automaticamente ---
set "KEYSTORE_PATH="
set "SEARCH_PATHS=%ANDROID_DIR%\app\mi-app-keystore.jks %ANDROID_DIR%\app\app-keystore.jks %ANDROID_DIR%\app\release.jks %ANDROID_DIR%\app\keystore.jks %PROJECT_ROOT%\mi-app-keystore.jks %PROJECT_ROOT%\app-keystore.jks %PROJECT_ROOT%\release.jks %PROJECT_ROOT%\keystore.jks"

for %%p in (%SEARCH_PATHS%) do (
    if not defined KEYSTORE_PATH (
        if exist "%%p" set "KEYSTORE_PATH=%%p"
    )
)

REM Si no se encontro, buscar cualquier .jks o .keystore en android\app
if not defined KEYSTORE_PATH (
    for /f "delims=" %%f in ('dir /b /s "%ANDROID_DIR%\app\*.jks" "%ANDROID_DIR%\app\*.keystore" 2^>nul') do (
        if not defined KEYSTORE_PATH set "KEYSTORE_PATH=%%f"
    )
)

REM Si tampoco se encontro, buscar en la raiz del proyecto
if not defined KEYSTORE_PATH (
    for /f "delims=" %%f in ('dir /b /s "%PROJECT_ROOT%\*.jks" "%PROJECT_ROOT%\*.keystore" 2^>nul') do (
        if not defined KEYSTORE_PATH set "KEYSTORE_PATH=%%f"
    )
)

if not defined KEYSTORE_PATH (
    echo [ERROR] No se encontro ningun archivo .jks o .keystore.
    echo Coloca tu keystore en android\app\ o en la raiz del proyecto.
    pause
    exit /b 1
)
echo -^> Keystore encontrado: !KEYSTORE_PATH!

if not exist "%UNSIGNED_APK%" (
    echo [ERROR] No se encuentra el APK sin firmar en: %UNSIGNED_APK%
    pause
    exit /b 1
)

REM --- Detectar automaticamente la ultima version de build-tools ---
set "BUILD_TOOLS_ROOT=%LOCALAPPDATA%\Android\Sdk\build-tools"
set "APKSIGNER="
for /f "delims=" %%i in ('dir /b /ad /o-n "%BUILD_TOOLS_ROOT%" 2^>nul') do (
    if not defined APKSIGNER (
        if exist "%BUILD_TOOLS_ROOT%\%%i\apksigner.bat" (
            set "APKSIGNER=%BUILD_TOOLS_ROOT%\%%i\apksigner.bat"
        )
    )
)

if not defined APKSIGNER (
    echo [ERROR] No se encontro apksigner.bat en %BUILD_TOOLS_ROOT%
    pause
    exit /b 1
)
echo -^> Usando: !APKSIGNER!

echo.
echo -^> Firmando APK...
echo     (Se te pedira la contrasena del keystore y del alias)
echo.

if exist "%SIGNED_APK%" del /q "%SIGNED_APK%"

call "!APKSIGNER!" sign ^
    --ks "!KEYSTORE_PATH!" ^
    --ks-key-alias "%KEY_ALIAS%" ^
    --out "%SIGNED_APK%" ^
    "%UNSIGNED_APK%"

if errorlevel 1 (
    echo [ERROR] Fallo la firma del APK.
    pause
    exit /b 1
)

echo.
echo [OK] APK firmado generado en:
echo     %SIGNED_APK%
echo.
echo -^> Verificando firma...
call "!APKSIGNER!" verify --verbose "%SIGNED_APK%"

:End
echo.
echo ========================================================
echo   PROCESO COMPLETADO
 echo ========================================================
echo.
pause
endlocal
