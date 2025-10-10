# ---- Base Python Image ----
FROM python:3.10-slim

# ---- Set working directory ----
WORKDIR /app

# ---- Install system dependencies for building PyAudio & OpenCV ----
RUN apt-get update && apt-get install -y \
    gcc \
    portaudio19-dev \
    libasound2-dev \
    libjack-dev \
    libgl1 \
    libglib2.0-0 \
    wget \
    unzip \
    && rm -rf /var/lib/apt/lists/*


# ---- Install Python dependencies manually (no requirements.txt) ----
RUN pip install --no-cache-dir \
    mediapipe \
    fastapi \
    opencv-python \
    ultralytics \
    websocket-client \
    omegaconf \
    pyaudio \
    python-dotenv \
    vosk \
    uvicorn \
    openai \
    mysql-connector-python

# ---- Download and place YOLOv8n-face model ----
RUN wget -O yolov8n-face.pt https://github.com/akanametov/yolo-face/releases/download/v0.0.0/yolov8n-face.pt

# ---- Download and extract Vosk model ----
RUN wget -O vosk-model.zip https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip \
    && unzip vosk-model.zip \
    && rm vosk-model.zip

# ---- Copy application code ----
COPY . .

# ---- Expose FastAPI port ----
EXPOSE 8000

# ---- Run FastAPI ----
CMD ["python", "-m", "uvicorn", "index:app", "--host", "0.0.0.0", "--port", "8000"]
