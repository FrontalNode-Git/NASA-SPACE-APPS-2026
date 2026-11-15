@echo off
rem Windows: double-click this file to start VITAL. It runs start.mjs with Node.js.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 22 from https://nodejs.org and try again.
  pause
  exit /b 1
)
node start.mjs %*
if errorlevel 1 pause
