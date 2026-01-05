@echo off

if not exist .env (
  echo .env not found.
  exit /b 1
)

for /f "usebackq tokens=1,* delims==" %%A in (`
  type .env ^| findstr /r /v "^[ ]*$" ^| findstr /r /v "^[ ]*#"
`) do (
  if /i "%%A"=="export" (
    for /f "tokens=1,* delims= " %%K in ("%%B") do set "%%K=%%~L"
  ) else (
    set "%%A=%%~B"
  )
)
