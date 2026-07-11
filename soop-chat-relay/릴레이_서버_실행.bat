@echo off
cd /d "%~dp0"
echo Starting chunmusic SOOP chat relay server...
echo Keep this window open - closing it disconnects the chat relay.
echo.
npm start

echo.
echo Server stopped. Check the log above for errors.
pause
