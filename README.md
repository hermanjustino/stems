# Stemify - Audio Splitter

Stemify is a web app for splitting songs into stems (vocals, drums, bass, other) using Demucs.

Current state:
- React/Vite frontend (`demucs-gui`)
- Flask web API service for job creation and status (`demucs-backend/web.py`)
- Flask GPU worker for Pub/Sub processing (`demucs-backend/worker.py`)
- Asynchronous pipeline on GCP: Cloud Run + Pub/Sub + Cloud Storage + Secret Manager

## Architecture (Current)

1. Frontend calls `/process` or `/youtube/download` on the web API.
2. Web API uploads source files to Cloud Storage and publishes Pub/Sub jobs.
3. GPU worker receives push messages, downloads source, runs Demucs, uploads stem WAV files to Cloud Storage.
4. Frontend polls `/status/<session_id>` until completed.
5. Downloads are served via `/download/<session_id>/<filename>`.

Primary files:
- Web API: `demucs-backend/web.py`
- Worker: `demucs-backend/worker.py`
- Terraform: `terraform/main.tf`
- Web image Dockerfile: `Dockerfile.web`
- Worker image Dockerfile (GPU): `Dockerfile` (your build workflow swaps in `Dockerfile.worker`)

## Local Development

### Backend (legacy/local synchronous mode)
Use `app.py` for local development/debug:

```bash
cd demucs-backend
export YTDLP_COOKIEFILE="$PWD/cookies.txt"
uv run python app.py
```

### Frontend

```bash
cd demucs-gui
npm install
npm run dev -- --port 5173
```

Open `http://localhost:5173`.

## GCP Deployment (Current Workflow)

Project: `stem-splitter-492719`  
Region: `us-east4`

### 1. Build Web Image

```bash
mv Dockerfile.web Dockerfile
gcloud builds submit --project=stem-splitter-492719 --tag us-east4-docker.pkg.dev/stem-splitter-492719/stemify-repo/stemify-web .
mv Dockerfile Dockerfile.web
```

### 2. Build GPU Worker Image

```bash
mv Dockerfile.worker Dockerfile
gcloud builds submit --project=stem-splitter-492719 --tag us-east4-docker.pkg.dev/stem-splitter-492719/stemify-repo/stemify-worker .
mv Dockerfile Dockerfile.worker
```

Note: The worker build can take longer because CUDA/PyTorch dependencies and Demucs model caching are heavy.

### 3. Provision Infra with Terraform

```bash
cd terraform
terraform init
terraform plan
terraform apply
```

This creates:
- Cloud Storage bucket for uploads/completed stems
- Pub/Sub topic/subscription for worker jobs
- Secret Manager secret for YouTube cookies
- Cloud Run web service
- Cloud Run GPU worker service (NVIDIA L4 annotation)

## YouTube Authentication Notes

YouTube extraction may require valid cookies.

- Local: place cookies at `demucs-backend/cookies.txt`
- Cloud: secret is read from Secret Manager (`ytdlp-cookies`) by worker

`cookies.txt` is ignored via `.gitignore`.

## Key Environment Variables

Web service:
- `GCS_BUCKET`
- `PUBSUB_TOPIC`

Worker service:
- `GCS_BUCKET`
- `GOOGLE_CLOUD_PROJECT`
- `ytdlp-cookies` secret mounted/read by worker

## Tech Stack

- Frontend: React 19, Vite, TypeScript, Tailwind
- Web API / Worker: Flask, Gunicorn
- Audio splitting: Demucs (PyTorch)
- Cloud: Cloud Run, Pub/Sub, Cloud Storage, Secret Manager
- IaC: Terraform

## License

MIT License. See [LICENSE](LICENSE).
