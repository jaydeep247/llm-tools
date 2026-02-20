@echo off
REM Auto-reload development server for npy-backend
echo Installing watchfiles if needed...
call venv\Scripts\activate
pip install watchfiles==0.21.0 -q
echo.
echo Starting development server with auto-reload...
python dev.py
