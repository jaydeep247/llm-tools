# Python API Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies and clear apt cache (fixes DKL-DI-0005)
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* \
    && rm -rf /var/cache/apt/archives/*

# Upgrade pip to fix security vulnerability (CVE-2025-8869)
RUN pip install --upgrade pip>=25.3

# Copy requirements file
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Download spacy model (required for NLP processing)
RUN python -m spacy download en_core_web_sm

# Copy application code
COPY . .

# Create non-root user
RUN groupadd -r pythonuser && useradd -r -g pythonuser pythonuser

# Change ownership of app directory
RUN chown -R pythonuser:pythonuser /app

# Switch to non-root user
USER pythonuser

# Expose port
EXPOSE 8000

# Add healthcheck (fixes CIS-DI-0006)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health', timeout=5)" || exit 1

# Run the application
CMD ["python", "run.py"]
