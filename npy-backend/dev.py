"""
Development server with auto-reload.
Watches Python files and restarts the application on changes.
"""
import sys
import subprocess
from pathlib import Path
from watchfiles import run_process


def run_server():
    subprocess.run([sys.executable, "main.py"])


def watch_filter(change, path):
    return path.endswith(".py")


def main():
    print("🔄 Starting npy-backend with auto-reload...")
    print("📁 Watching: *.py files")
    print("🛑 Press Ctrl+C to stop\n")

    watch_path = Path(__file__).parent

    run_process(
        watch_path,
        target=run_server,
        watch_filter=watch_filter,
    )


if __name__ == "__main__":
    main()
