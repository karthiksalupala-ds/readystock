@echo off
setlocal

if /i "%~1"=="backend" goto :backend
if /i "%~1"=="frontend" goto :frontend

rem Start the InteLiDar backend and Vite frontend in separate terminals.
rem Prefer the repository virtual environment so the backend dependencies match
rem this checkout. Set INTELIDAR_PYTHON before running to override it.
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js/npm was not found on PATH.
  pause
  exit /b 1
)

if exist "%~dp0.venv\Scripts\python.exe" set "INTELIDAR_PYTHON=%~dp0.venv\Scripts\python.exe"
if not defined INTELIDAR_PYTHON for /f "delims=" %%P in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do set "INTELIDAR_PYTHON=%%P"
if not defined INTELIDAR_PYTHON (
  echo No Python interpreter was found.
  echo Install dependencies in .venv or set INTELIDAR_PYTHON before running this file.
  pause
  exit /b 1
)

start "InteLiDar Backend" /d "%~dp0" cmd.exe /k call "%~f0" backend
start "InteLiDar Frontend" /d "%~dp0" cmd.exe /k call "%~f0" frontend

echo Started backend and frontend in separate windows.
echo Open http://127.0.0.1:5176/
goto :eof

:backend
set "INTELIDAR_PYTHON=%INTELIDAR_PYTHON%"
set "INTELIDAR_API_PORT=8020"
if not defined INTELIDAR_PYTHON (
  if exist "%~dp0.venv\Scripts\python.exe" set "INTELIDAR_PYTHON=%~dp0.venv\Scripts\python.exe"
)
if not defined INTELIDAR_PYTHON (
  for /f "delims=" %%P in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do set "INTELIDAR_PYTHON=%%P"
)
npm.cmd run backend
goto :eof

:frontend
set "INTELIDAR_API_URL=http://127.0.0.1:8020"
npm.cmd run dev -- --host 127.0.0.1 --port 5176
goto :eof
