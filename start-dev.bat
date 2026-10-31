@echo off
echo ============================================================================
echo   TripWise AI — Travel Planning and Policy Assistant (Dev Launcher)
echo ============================================================================
echo Starting FastAPI Backend on http://127.0.0.1:8000 ...
start "TripWise AI Backend" cmd /k "cd /d %~dp0backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo Starting React + Vite Frontend on http://localhost:5173 ...
start "TripWise AI Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Both services launched in separate windows!
echo - Frontend UI:  http://localhost:5173
echo - Backend API:  http://127.0.0.1:8000/api/health
echo - Swagger Docs: http://127.0.0.1:8000/docs
