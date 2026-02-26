# AI Service Dockerfile
FROM python:3.11-slim

WORKDIR /app

# System deps for OpenCV + rasterio
RUN apt-get update && apt-get install -y \
    libgdal-dev libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Train model at build time so the container is ready immediately
RUN python train_model.py

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
