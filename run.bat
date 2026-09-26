@echo off
setlocal

if /i "%~1"=="backend" goto :backend
if /i "%~1"=="frontend" goto :frontend

rem Start the InteLiDar backend and Vite frontend in separate terminals.
rem The Python override avoids relying on a virtual environment copied from
rem another machine. It requires Python 3.11+ registered with the py launcher.
where npm.cmd >nul 2>nul
if errorlevel 1 (
  echo Node.js/npm was not found on PATH.
  pause
  exit /b 1
)

for /f "delims=" %%P in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do set "INTELIDAR_PYTHON=%%P"
if not defined INTELIDAR_PYTHON (
  echo Python 3.11+ was not found through the Windows py launcher.
  echo Install Python 3.11+ or set INTELIDAR_PYTHON before running this file.
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
if not defined INTELIDAR_PYTHON (
  for /f "delims=" %%P in ('py -3 -c "import sys; print(sys.executable)" 2^>nul') do set "INTELIDAR_PYTHON=%%P"
)
npm.cmd run backend
goto :eof

:frontend
npm.cmd run dev -- --host 127.0.0.1 --port 5176
goto :eof
