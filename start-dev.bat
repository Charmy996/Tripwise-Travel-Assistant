@echo off
set ROOT_DIR=%~dp0

echo ============================================================================
echo   TripWise AI - Travel Planning and Policy Assistant (Dev Launcher)
echo ============================================================================

:: 1. Check Python installation
where python >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python is not installed or not in your PATH.
    echo Please install Python 3.10+ and restart this script.
    pause
    exit /b 1
)

:: 2. Check Node / npm installation
where npm >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js / npm is not installed or not in your PATH.
    echo Please install Node.js 18+ and restart this script.
    pause
    exit /b 1
)

:: 3. Setup environment files if missing
if not exist "%ROOT_DIR%backend\.env" (
    if exist "%ROOT_DIR%backend\.env.example" (
        echo [INFO] Creating backend\.env from template
        copy "%ROOT_DIR%backend\.env.example" "%ROOT_DIR%backend\.env" >nul
    )
)

if not exist "%ROOT_DIR%frontend\.env" (
    if exist "%ROOT_DIR%frontend\.env.example" (
        echo [INFO] Creating frontend\.env from template
        copy "%ROOT_DIR%frontend\.env.example" "%ROOT_DIR%frontend\.env" >nul
    )
)

:: 4. Check and install backend dependencies if missing
echo [INFO] Verifying backend Python dependencies
python -c "import fastapi, uvicorn, pydantic, httpx, fitz, faiss" >nul 2>&1
if errorlevel 1 (
    echo [INFO] Installing backend dependencies from requirements.txt
    cd /d "%ROOT_DIR%backend"
    pip install -r requirements.txt
)

:: 5. Check and install frontend dependencies if missing
if not exist "%ROOT_DIR%frontend\node_modules" (
    echo [INFO] Installing frontend dependencies
    cd /d "%ROOT_DIR%frontend"
    call npm install
)

:: 6. Launch Backend and Frontend in separate windows
echo [INFO] Starting FastAPI Backend on http://127.0.0.1:8000
start "TripWise AI Backend" cmd /k "cd /d %ROOT_DIR%backend && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

echo [INFO] Starting React + Vite Frontend on http://localhost:5173
start "TripWise AI Frontend" cmd /k "cd /d %ROOT_DIR%frontend && npm run dev"

echo.
echo ============================================================================
echo   TripWise AI Services Launched!
echo ============================================================================
echo - Frontend UI:  http://localhost:5173
echo - Backend API:  http://127.0.0.1:8000/api/health
echo - Swagger Docs: http://127.0.0.1:8000/docs
echo ============================================================================
echo.
