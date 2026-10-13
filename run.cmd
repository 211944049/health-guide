@echo off
REM Local command entry: use the Node/pnpm bundled with DSH.
REM
REM Why this exists: this machine's PATH has neither node nor pnpm, and the shims in
REM node_modules\.bin fall back to `node` from PATH, so a bare `pnpm build` fails with
REM "'node' is not recognized as an internal or external command".
REM
REM Usage:
REM   run.cmd install
REM   run.cmd dev
REM   run.cmd build
REM   run.cmd new --title "leftover dishes" --slug leftover-dishes --category food-label
REM
REM Keep this file ASCII-only: cmd.exe reads .cmd files in the OEM codepage, and
REM non-ASCII bytes (e.g. a Chinese category label) can corrupt the next line.
REM The category labels are listed in README.md and src/site.config.ts.
REM
REM On a machine with Node already installed, this still works: it just uses PATH.
REM
REM Python is set up the same way, because `og:images` needs it. This machine's PATH
REM has a Windows Store *stub* python.exe that exits 9009 instead of running, so
REM `run.cmd og:images` used to fail. The bundled python has Pillow under
REM Lib\site-packages, so PYTHONPATH is set as well (otherwise `import PIL` fails).

setlocal

set "NODEBIN=C:\Users\17878\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin"
set "PNPM=%NODEBIN%\..\..\pnpm\bin\pnpm.mjs"
set "PYTHONDIR=C:\Users\17878\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python"

if exist "%NODEBIN%\node.exe" set "PATH=%NODEBIN%;%PATH%"
if exist "%PYTHONDIR%\python.exe" (
  set "PATH=%PYTHONDIR%;%PYTHONDIR%\Scripts;%PATH%"
  set "PYTHONPATH=%PYTHONDIR%\Lib\site-packages"
)

REM Astro telemetry would create %APPDATA%\astro\Config. Switch it off.
REM Note: a .env file does NOT work for this variable; it must be in the process env.
set "ASTRO_TELEMETRY_DISABLED=1"

where node >nul 2>nul
if errorlevel 1 (
  echo [run.cmd] node not found. Install Node or edit NODEBIN in this file.
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 goto usebundled

pnpm %*
exit /b %ERRORLEVEL%

:usebundled
if not exist "%PNPM%" (
  echo [run.cmd] pnpm not found. Install pnpm or edit PNPM in this file.
  exit /b 1
)
node "%PNPM%" %*
exit /b %ERRORLEVEL%
