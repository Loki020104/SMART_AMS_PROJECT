# Use Python 3.11 slim image (dlib works best with this)
FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for dlib and face recognition
ARG CACHEBUST=1
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    libopenblas-dev \
    liblapack-dev \
    libx11-dev \
    libjpeg-dev \
    libpng-dev \
    gcc \
    g++ \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first (for better caching)
COPY requirements.txt .

# Install Python dependencies
RUN pip install --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend.py ./
COPY qr_security.py ./
COPY database.py ./

# Expose port (Cloud Run uses PORT env var)
EXPOSE 8080

# Set environment variables
ENV PORT=8080
ENV FLASK_APP=backend.py

# Run Flask app
CMD exec gunicorn --bind 0.0.0.0:${PORT} --workers 2 --timeout 60 backend:app
