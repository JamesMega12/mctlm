@echo off
cd /d "%~dp0"
where node >nul 2>nul && (start "" http://localhost:3000 & node server.js & goto :eof)
where python >nul 2>nul && (start "" http://localhost:3000 & python -m http.server 3000 & goto :eof)
echo Install Node.js or Python to run the demo.
pause
