"""
Development server with auto-reload.
Watches Python files and restarts the application on changes.
"""
import sys
import subprocess
from pathlib import Path
from watchfiles import run_process

def main():
    """Run the application with auto-reload on file changes."""
    print("🔄 Starting npy-backend with auto-reload...")
    print("📁 Watching: *.py files")
    print("🛑 Press Ctrl+C to stop\n")
    
    # Watch all Python files in the project
    watch_path = Path(__file__).parent
    
    # Run main.py and reload on any .py file change
    run_process(
        watch_path,
        target=lambda: subprocess.run([sys.executable, "main.py"]),
        watch_filter=lambda change, path: path.endswith('.py')
    )

if __name__ == "__main__":
    main()
