@echo off
setlocal
set "relay_node=%ProgramFiles%\nodejs\node.exe"
if not exist "%relay_node%" (
  echo Relay: Node.js nao encontrado em Program Files. Use Node 24 para executar scripts\launch-relay.mjs.
  exit /b 3
)
"%relay_node%" "%~dp0scripts\launch-relay.mjs" %*
exit /b %errorlevel%
