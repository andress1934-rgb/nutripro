@echo off
title Imperium - Servidor Local
echo.
echo  =====================================
echo   Imperium corriendo en localhost
echo  =====================================
echo.
echo  Abriendo http://localhost:8765 ...
echo  (Cierra esta ventana para detener)
echo.

REM Detecta Python automáticamente
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start "" "http://localhost:8765"
    python -m http.server 8765
    goto :end
)

where py >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start "" "http://localhost:8765"
    py -m http.server 8765
    goto :end
)

REM Fallback a Node si Python no está
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    start "" "http://localhost:8765"
    npx --yes http-server -p 8765 -c-1
    goto :end
)

echo  ERROR: No se encontro Python ni Node.js
echo  Instala uno desde:
echo    Python: https://python.org
echo    Node:   https://nodejs.org
echo.
pause

:end
