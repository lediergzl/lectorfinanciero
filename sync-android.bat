@echo off
REM sync-android.bat
REM
REM Equivalente para Windows (cmd) de sync-android.sh. NO usa Node ni
REM npx, solo comandos nativos de Windows (xcopy/rmdir/copy). Reemplaza
REM a "npx cap sync android", que SÍ requiere tener Node y el propio
REM Capacitor CLI instalados (y por eso pedía TypeScript).
REM
REM Uso (desde la carpeta raíz del proyecto, ej. C:\Users\tú\Downloads\lector):
REM   sync-android.bat
REM
REM Ejecútalo cada vez que cambies algo en index.html o en src\*.js antes
REM de compilar con gradlew.

setlocal
cd /d "%~dp0"

set "ASSETS_DIR=android\app\src\main\assets\public"

echo -^> Limpiando %ASSETS_DIR%
if exist "%ASSETS_DIR%" rmdir /s /q "%ASSETS_DIR%"
mkdir "%ASSETS_DIR%"

echo -^> Copiando www\ -^> %ASSETS_DIR%
xcopy /e /i /y "www\*" "%ASSETS_DIR%\" >nul

echo -^> Copiando capacitor.config.json -^> android\app\src\main\assets\
copy /y "capacitor.config.json" "android\app\src\main\assets\capacitor.config.json" >nul

echo.
echo Listo. Ahora puedes compilar con:
echo     cd android
echo     gradlew.bat assembleDebug

endlocal
