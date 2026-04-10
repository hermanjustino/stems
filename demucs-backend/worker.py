import os
import json
import base64
import shlex
import shutil
import subprocess
from pathlib import Path
from flask import Flask, request, jsonify
from google.cloud import storage
import yt_dlp
import demucs.separate

app = Flask(__name__)

PROJECT_ID = 'stem-splitter-492719'
BUCKET_NAME = os.environ.get('GCS_BUCKET', f'{PROJECT_ID}-demucs-stems')

try:
    storage_client = storage.Client()
    bucket = storage_client.bucket(BUCKET_NAME)
    print(f"INFO: Worker initialized - SoundCloud mode", flush=True)
except Exception as e:
    print(f"Warning: GCP Clients failed to initialize. {e}", flush=True)

UPLOAD_FOLDER = Path('/app/temp')
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)


def download_soundcloud(track_url, session_folder):
    """Download audio from SoundCloud using yt-dlp.

    SoundCloud works cleanly from datacenter IPs — no auth, no bot detection.
    Returns (file_path, original_name) on success, (None, None) on failure.
    """
    output_template = str(session_folder / '%(title)s.%(ext)s')
    ydl_opts = {
        'format': 'bestaudio/best',
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '192',
        }],
        'outtmpl': output_template,
        'quiet': True,
        'no_warnings': True,
        'noplaylist': True,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(track_url, download=True)
            title = info.get('title', 'Unknown')
            original_name = "".join([c for c in title if c.isalpha() or c.isdigit() or c == ' ']).strip()

        mp3_files = list(session_folder.glob('*.mp3'))
        if mp3_files:
            print(f"SUCCESS: Downloaded from SoundCloud: {mp3_files[0].name}", flush=True)
            return mp3_files[0], original_name
    except Exception as e:
        print(f"ERROR: SoundCloud download failed: {e}", flush=True)

    return None, None


@app.route('/process_pubsub', methods=['POST'])
def process_pubsub():
    """Endpoint hit by Cloud Pub/Sub push subscription"""
    envelope = request.get_json()
    if not envelope:
        return 'Bad Request: no JSON', 400
    if 'message' not in envelope:
        return 'Bad Request: missing message', 400

    try:
        pubsub_message = envelope['message']
        data = json.loads(base64.b64decode(pubsub_message['data']).decode('utf-8'))

        session_id = data.get('session_id')
        job_type = data.get('type')
        print(f"INFO: Processing job {session_id} - Type: {job_type}", flush=True)

        session_folder = UPLOAD_FOLDER / session_id
        session_folder.mkdir(parents=True, exist_ok=True)

        file_path = None
        original_name = "song"

        if job_type == 'file':
            gcs_path = data.get('gcs_path')
            filename = data.get('filename')
            original_name = Path(filename).stem
            file_path = session_folder / filename

            print(f"DEBUG: Downloading file from GCS: {gcs_path}", flush=True)
            blob = bucket.blob(gcs_path)
            blob.download_to_filename(file_path)

        elif job_type == 'soundcloud':
            track_url = data.get('url')
            print(f"DEBUG: SoundCloud URL: {track_url}", flush=True)
            file_path, original_name = download_soundcloud(track_url, session_folder)

        if file_path and file_path.exists():
            output_dir = session_folder / 'separated'
            output_dir.mkdir(parents=True, exist_ok=True)

            cmd = f'-n htdemucs --out "{output_dir}" "{file_path}"'
            print(f"INFO: Executing Inference: {cmd}", flush=True)
            demucs.separate.main(shlex.split(cmd))

            stems = list(output_dir.rglob('*.wav'))
            for stem_file in stems:
                stem_type = stem_file.stem
                new_filename = f"{original_name}-{stem_type}.wav"
                final_gcs_path = f"completed/{session_id}/{new_filename}"
                print(f"DEBUG: Uploading stem {stem_type} to {final_gcs_path}", flush=True)
                blob = bucket.blob(final_gcs_path)
                blob.upload_from_filename(stem_file)

            print(f"SUCCESS: Processed and uploaded stems for {session_id}", flush=True)
        else:
            print(f"ERROR: No audio file obtained for job {session_id}", flush=True)

        shutil.rmtree(session_folder, ignore_errors=True)
        return '', 204

    except Exception as e:
        print(f"CRITICAL: Worker Error: {e}", flush=True)
        return '', 204


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8080)
