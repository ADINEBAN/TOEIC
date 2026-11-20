# Build stage (caches Maven dependencies separately from src/)
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -B dependency:go-offline
COPY src ./src
RUN mvn -B clean package -DskipTests

# Runtime stage (Java 17 + Python3/OCR + FFmpeg + yt-dlp)
FROM eclipse-temurin:17-jre
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        python3 python3-venv python3-pip ffmpeg libgomp1 ca-certificates curl unzip \
    && curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh \
    && python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir \
        "yt-dlp[default]" youtube-transcript-api pillow rapidocr-onnxruntime imageio-ffmpeg faster-whisper \
    && rm -rf /var/lib/apt/lists/*

ENV PATH="/opt/venv/bin:${PATH}"

COPY --from=build /app/target/*.jar app.jar
COPY scripts ./scripts
RUN mkdir -p /app/data/uploads/videos /app/data/uploads/avatars

EXPOSE 8080
ENTRYPOINT ["sh", "-c", "java ${JAVA_TOOL_OPTIONS:--Xms256m -Xmx1200m} -jar app.jar"]
