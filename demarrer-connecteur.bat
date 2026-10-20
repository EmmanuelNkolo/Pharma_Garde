@echo off
chcp 65001 > nul
title Pharma-Garde - Connecteur Universel d'Officine
color 0A

echo =================================================================
echo           PHARMA-GARDE - CONNECTEUR SERVEUR & OFFICINE
echo =================================================================
echo.
echo Verification de Node.js sur cette machine...
where node >nul 2>nul
if %errorlevel% neq 0 (
    color 0C
    echo [ERREUR] Node.js n'est pas installe sur cette machine.
    echo Veuillez installer Node.js depuis https://nodejs.org/ pour lancer le connecteur.
    echo.
    pause
    exit /b 1
)

echo [OK] Node.js detecte.
echo Demarrage du daemon connecteur sur le port 8080...
echo.

node pharmagarde-connector-daemon.js

echo.
echo Le connecteur s'est arrete.
pause
