@echo off
cd /d "%~dp0"
node -e "if(Number(process.versions.node.split('.')[0])<24)process.exit(1)" >nul 2>&1
if errorlevel 1 (
 echo Please install Node.js 24 or newer from https://nodejs.org and try again.
 pause
 exit /b 1
)
echo Portfolio: http://localhost:3000
echo Admin: http://localhost:3000/admin
call npm start
pause
