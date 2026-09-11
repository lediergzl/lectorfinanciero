@echo off
REM sync-android.bat
REM
REM Sincroniza la fuente canónica (index.html + src\) hacia www\ y luego
REM copia www\ a los assets públicos de Android. No requiere Node ni npx.

setlocal
cd /d "%~dp0"

set "WWW_DIR=www"
set "ASSETS_DIR=android\app\src\main\assets\public"

echo -^> Sincronizando index.html + src\ -^> %WWW_DIR%\
if exist "%WWW_DIR%" rmdir /s /q "%WWW_DIR%"
mkdir "%WWW_DIR%"
xcopy /e /i /y "src\*" "%WWW_DIR%\src\" >nul
copy /y "index.html" "%WWW_DIR%\index.html" >nul


echo -^> Limpiando %ASSETS_DIR%
if exist "%ASSETS_DIR%" rmdir /s /q "%ASSETS_DIR%"
mkdir "%ASSETS_DIR%"

echo -^> Copiando www\ -^> %ASSETS_DIR%
xcopy /e /i /y "%WWW_DIR%\*" "%ASSETS_DIR%\" >nul

echo -^> Copiando capacitor.config.json -^> android\app\src\main\assets\
copy /y "capacitor.config.json" "android\app\src\main\assets\capacitor.config.json" >nul

echo.
echo Listo. Ahora puedes compilar con:
echo     cd android
echo     gradlew.bat assembleDebug

echo.
echo Fuente canonica: index.html + src\
echo www\ y los assets Android fueron regenerados.

endlocal
