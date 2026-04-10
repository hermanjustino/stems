from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
from google.cloud import storage, pubsub_v1
import yt_dlp
import os
import uuid
import json

app = Flask(__name__, static_folder=os.path.abspath('static'), static_url_path='')
CORS(app, resources={r"/*": {
    "origins": ["http://localhost:5173", "http://127.0.0.1:5173", "*"],
    "methods": ["GET", "POST", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type"]
}})

app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 20MB

PROJECT_ID = 'stem-splitter-492719'
BUCKET_NAME = os.environ.get('GCS_BUCKET', f'{PROJECT_ID}-demucs-stems')
PUBSUB_TOPIC = os.environ.get('PUBSUB_TOPIC', f'projects/{PROJECT_ID}/topics/demucs-jobs')

try:
    storage_client = storage.Client()
    bucket = storage_client.bucket(BUCKET_NAME)
    publisher = pubsub_v1.PublisherClient()
except Exception as e:
    print(f"Warning: GCP Clients failed to initialize (Ensure you are logged in via gcloud). {e}")


@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'}), 200


@app.route('/favicon.ico')
def favicon():
    return send_from_directory(app.static_folder, 'favicon.svg')


@app.route('/soundcloud/search', methods=['GET'])
def soundcloud_search():
    try:
        query = request.args.get('q', '')
        if not query:
            return jsonify({'error': 'Search query is required'}), 400

        ydl_opts = {
            'quiet': True,
            'extract_flat': True,
            'skip_download': True,
        }

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            result = ydl.extract_info(f"scsearch10:{query}", download=False)

        tracks = []
        for entry in (result.get('entries') or []):
            if not entry:
                continue
            url = entry.get('url') or entry.get('webpage_url', '')
            tracks.append({
                'id': str(entry.get('id', '')),
                'title': entry.get('title', 'Unknown'),
                'channel': entry.get('uploader') or entry.get('channel', 'Unknown Artist'),
                'duration': int(entry.get('duration') or 0),
                'thumbnail': entry.get('thumbnail', ''),
                'url': url,
            })

        return jsonify({'results': tracks}), 200
    except Exception as e:
        print(f"SoundCloud search error: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    try:
        return send_from_directory(app.static_folder, 'index.html')
    except Exception:
        return jsonify({'error': 'File not found'}), 404


@app.route('/process', methods=['POST'])
def process_audio():
    """Uploads file to GCS and pushes a job to Pub/Sub"""
    if 'file' not in request.files:
        return jsonify({'error': 'No file part'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No selected file'}), 400

    session_id = str(uuid.uuid4())
    filename = secure_filename(file.filename)
    gcs_blob_name = f"uploads/{session_id}/{filename}"

    try:
        blob = bucket.blob(gcs_blob_name)
        blob.upload_from_file(file)

        message_data = json.dumps({
            "session_id": session_id,
            "filename": filename,
            "type": "file",
            "gcs_path": gcs_blob_name
        }).encode("utf-8")

        publisher.publish(PUBSUB_TOPIC, data=message_data)

        return jsonify({
            'message': 'Job queued successfully',
            'session_id': session_id,
            'status': 'processing'
        }), 202

    except Exception as e:
        print(f"Error starting process: {e}")
        return jsonify({'error': 'Failed to queue job'}), 500


@app.route('/soundcloud/download', methods=['POST'])
def process_soundcloud():
    """Pushes a SoundCloud URL to the GPU worker via Pub/Sub"""
    data = request.get_json()
    track_url = data.get('url', '')

    if not track_url:
        return jsonify({'error': 'URL required'}), 400

    session_id = str(uuid.uuid4())

    try:
        message_data = json.dumps({
            "session_id": session_id,
            "type": "soundcloud",
            "url": track_url,
        }).encode("utf-8")

        publisher.publish(PUBSUB_TOPIC, data=message_data)

        return jsonify({
            'message': 'Job queued successfully',
            'session_id': session_id,
            'status': 'processing'
        }), 202

    except Exception as e:
        return jsonify({'error': 'Failed to queue job'}), 500


@app.route('/status/<session_id>', methods=['GET'])
def check_status(session_id):
    """Polls GCS for completed stems"""
    try:
        prefix = f"completed/{session_id}/"
        blobs = list(bucket.list_blobs(prefix=prefix))

        if len(blobs) >= 4:
            stems = {}
            for blob in blobs:
                stem_type = blob.name.split('-')[-1].replace('.wav', '')
                stems[stem_type] = f"/download/{session_id}/{blob.name.split('/')[-1]}"

            return jsonify({
                'status': 'completed',
                'stems': stems
            })

        return jsonify({'status': 'processing'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/download/<session_id>/<filename>')
def download_gcs_file(session_id, filename):
    """Proxies WAV download from Cloud Storage"""
    try:
        blob = bucket.blob(f"completed/{session_id}/{filename}")
        data = blob.download_as_bytes()
        return data, 200, {
            'Content-Type': 'audio/wav',
            'Content-Disposition': f'attachment; filename={filename}'
        }
    except Exception as e:
        return jsonify({'error': 'Download failed'}), 500


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=8080)
