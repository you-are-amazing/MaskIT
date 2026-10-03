FROM python:3.11-slim

# build-essential: insightface compiles a small extension; libgl1/libglib2.0-0: needed by OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends build-essential libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 1000 user

ENV PATH=/home/user/.local/bin:$PATH
WORKDIR /home/user/app

# data/ is .docker-ignored, so it isn't in the image. Create it while still root
# and hand it to `user`, otherwise the unprivileged app gets PermissionError on
# faces.db at import time (config.py calls makedirs on startup).
RUN mkdir -p data/outputs && chown -R user:user /home/user/app

USER user

COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY --chown=user . .

# Download the ~300 MB face model while the image builds, so the first visitor doesn't wait
RUN python -c "from insightface.app import FaceAnalysis; FaceAnalysis(name='buffalo_l', providers=['CPUExecutionProvider']).prepare(ctx_id=-1, det_size=(640,640))"

EXPOSE 8000
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]