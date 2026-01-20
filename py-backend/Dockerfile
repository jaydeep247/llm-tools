# Python API Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

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

# Run the application
CMD ["python", "run.py"]
