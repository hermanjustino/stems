from flask import Flask, request, jsonify, send_from_directory, send_file, make_response
from flask_cors import CORS
import demucs.separate
import shlex
import os
import time
from pathlib import Path
from werkzeug.utils import secure_filename
import shutil
import uuid
import yt_dlp
from yt_dlp.utils import DownloadError

app = Flask(__name__, static_folder=os.path.abspath('static'), static_url_path='')
# Explicit CORS config for the development frontend
CORS(app, resources={r"/*": {
    "origins": ["http://localhost:5173", "http://127.0.0.1:5173"],
    "methods": ["GET", "POST", "DELETE", "OPTIONS"],
    "allow_headers": ["Content-Type"]
}})

@app.errorhandler(413)
def file_too_large(error):
    return jsonify({"error": "File is too large. Maximum size is 20MB."}), 413

@app.errorhandler(Exception)
def handle_exception(e):
    # Ensure all errors are return as JSON with CORS headers
    print(f"Unhandled Exception: {str(e)}")
    import traceback
    traceback.print_exc()
    response = jsonify({"error": str(e)})
    response.status_code = 500
    return response

app.config['MAX_CONTENT_LENGTH'] = 20 * 1024 * 1024  # 20MB in bytes

# Define base directories
BASE_DIR = Path(__file__).parent.absolute()
UPLOAD_FOLDER = BASE_DIR / 'temp'

# Ensure directory exists
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)

def apply_ytdlp_auth_options(ydl_opts):
    """
    Adds optional authentication options for yt-dlp.
    Supported env vars:
      - YTDLP_COOKIEFILE=/abs/path/to/cookies.txt
      - YTDLP_COOKIES_FROM_BROWSER=chrome|firefox|edge|safari|brave[:profile_or_container]
    """
    cookiefile = os.getenv('YTDLP_COOKIEFILE', '').strip()
    if cookiefile:
        ydl_opts['cookiefile'] = cookiefile
        print(f"yt-dlp: using cookie file at {cookiefile}")

    cookies_from_browser = os.getenv('YTDLP_COOKIES_FROM_BROWSER', '').strip()
    if cookies_from_browser:
        # Accept "chrome" or "chrome:Default" etc.
        parts = [p.strip() for p in cookies_from_browser.split(':', 1)]
        browser = parts[0]
        profile = parts[1] if len(parts) > 1 and parts[1] else None
        ydl_opts['cookiesfrombrowser'] = (browser, profile) if profile else (browser,)
        print(f"yt-dlp: using browser cookies from {cookies_from_browser}")

    # EJS / signature challenge solving defaults for newer YouTube protections.
    # Can be overridden with env vars:
    #   YTDLP_JS_RUNTIMES=node
    #   YTDLP_REMOTE_COMPONENTS=ejs:github
    js_runtimes = os.getenv('YTDLP_JS_RUNTIMES', 'node').strip()
    if js_runtimes:
        # yt-dlp expects a dict format: {runtime_name: {config}}
        ydl_opts['js_runtimes'] = {
            item.strip(): {}
            for item in js_runtimes.split(',')
            if item.strip()
        }

    remote_components = os.getenv('YTDLP_REMOTE_COMPONENTS', 'ejs:github').strip()
    if remote_components:
        ydl_opts['remote_components'] = [item.strip() for item in remote_components.split(',') if item.strip()]

    return ydl_opts

def classify_ytdlp_error(err_msg: str, stage: str):
    """
    Map common yt-dlp failures to clearer API responses.
    """
    lower_msg = err_msg.lower()

    if "sign in to confirm you're not a bot" in lower_msg or "use --cookies" in lower_msg:
        return {
            "status": 403,
            "code": "youtube_auth_required",
            "user_message": (
                f"YouTube {stage} requires authentication cookies. "
                "Configure YTDLP_COOKIEFILE or YTDLP_COOKIES_FROM_BROWSER on the backend."
            ),
        }

    if "429" in lower_msg or "too many requests" in lower_msg:
        return {
            "status": 429,
            "code": "youtube_rate_limited",
            "user_message": f"YouTube is rate limiting {stage} requests right now. Please retry later.",
        }

    return {
        "status": 502,
        "code": "youtube_upstream_error",
        "user_message": f"YouTube {stage} failed due to an upstream extraction error.",
    }

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def catch_all(path):
    try:
        static_folder = app.static_folder  
        if static_folder is None:  
            return jsonify({'error': 'Static folder not set'}), 500
        return send_from_directory(static_folder, 'index.html')
    except Exception as e:
        print(f"Error serving index.html: {str(e)}")
        return jsonify({'error': 'File not found'}), 404

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({"status": "healthy"})

@app.route('/process', methods=['POST'])
def process_audio():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file part'}), 400

        file = request.files['file']
        if file.filename is None or file.filename == '':
            return jsonify({'error': 'No selected file'}), 400

        # Create session directory
        session_id = str(uuid.uuid4())
        session_folder = UPLOAD_FOLDER / session_id
        session_folder.mkdir(parents=True, exist_ok=True)

        # Save uploaded file
        filename = secure_filename(file.filename)
        original_name = Path(filename).stem  # Get filename without extension
        file_path = session_folder / filename
        file.save(str(file_path))
        print(f"File saved to {file_path}")

        # Run Demucs
        try:
            output_dir = session_folder / 'separated'
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # Use htdemucs model for 4 stems (vocals, drums, bass, other)
            # We output wav for exact playback sync
            cmd = f'-n htdemucs --out "{output_dir}" "{file_path}"'
            print(f"Executing: demucs.separate.main({cmd})")
            demucs.separate.main(shlex.split(cmd))
            print(f"Separation complete for {file_path}")
        except Exception as e:
            print(f"Error in Demucs separation: {str(e)}")
            import traceback
            traceback.print_exc()
            return jsonify({'error': f'Demucs separation failed: {str(e)}'}), 500

        # Find and prepare separated files
        stems = {}
        model_name = 'htdemucs'
        separated_track_dir = output_dir / model_name / Path(filename).stem
        
        print(f"Searching for separated files in: {separated_track_dir}")
        if not separated_track_dir.exists():
            # Sometimes demucs might use a different folder structure depending on model or version
            # Let's search for any wav files in the output directory
            separated_files = list(output_dir.rglob('*.wav'))
            print(f"Found files via rglob: {separated_files}")
            if not separated_files:
                return jsonify({'error': 'Separated files not found in output directory'}), 500
            
            for stem_file in separated_files:
                stem_type = stem_file.stem
                new_filename = f"{original_name}-{stem_type}.wav"
                new_file_path = session_folder / new_filename
                shutil.copy2(stem_file, new_file_path)
                stems[stem_type] = f'/download/{session_id}/{new_filename}'
        else:
            for stem_file in separated_track_dir.glob('*.wav'):
                stem_type = stem_file.stem
                new_filename = f"{original_name}-{stem_type}.wav"
                new_file_path = session_folder / new_filename
                shutil.copy2(stem_file, new_file_path)
                stems[stem_type] = f'/download/{session_id}/{new_filename}'

        # Clean up
        try:
            shutil.rmtree(output_dir)
            if file_path.exists():
                os.remove(file_path)
        except Exception as cleanup_err:
            print(f"Warning: Cleanup error: {cleanup_err}")

        print(f"Separated stems: {list(stems.keys())}")
        return jsonify({
            'message': 'Processing complete',
            'session_id': session_id,
            'stems': stems
        }), 200

    except Exception as e:
        print(f"Critical error in process_audio: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/cleanup/<session_id>', methods=['DELETE'])
def cleanup_session(session_id):
    try:
        session_folder = UPLOAD_FOLDER / session_id
        if session_folder.exists():
            shutil.rmtree(session_folder)
            return jsonify({'message': 'Session cleaned up successfully'}), 200
        else:
            return jsonify({'error': 'Session not found'}), 404
    except Exception as e:
        print(f"Error cleaning up session: {str(e)}")
        return jsonify({'error': 'Cleanup failed'}), 500

@app.route('/download/<session_id>/<filename>')
def download_file(session_id, filename):
    try:
        session_folder = UPLOAD_FOLDER / session_id
        return send_from_directory(
            session_folder,
            filename,
            as_attachment=True,
            mimetype='audio/mpeg',
            download_name=filename
        )
    except Exception as e:
        print(f"Error downloading file: {str(e)}")
        return jsonify({'error': 'Download failed'}), 500

# YouTube Search Endpoint
@app.route('/youtube/search', methods=['GET'])
def youtube_search():
    try:
        query = request.args.get('q', '')
        if not query:
            return jsonify({'error': 'Search query is required'}), 400
        
        # Use yt-dlp to search YouTube
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,
            'default_search': 'ytsearch10',  # Search YouTube, return 10 results
            'noplaylist': True,
        }
        ydl_opts = apply_ytdlp_auth_options(ydl_opts)
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            results = ydl.extract_info(f"ytsearch10:{query}", download=False)
            
            videos = []
            if results and 'entries' in results:
                for entry in results['entries']:
                    if entry:
                        videos.append({
                            'id': entry.get('id', ''),
                            'title': entry.get('title', 'Unknown'),
                            'channel': entry.get('channel', 'Unknown'),
                            'duration': entry.get('duration', 0),
                            'thumbnail': entry.get('thumbnail', f"https://img.youtube.com/vi/{entry.get('id', '')}/mqdefault.jpg"),
                            'url': f"https://www.youtube.com/watch?v={entry.get('id', '')}"
                        })
            
            return jsonify({'results': videos}), 200
            
    except DownloadError as e:
        err_msg = str(e)
        mapped = classify_ytdlp_error(err_msg, stage='search')
        print(f"[YouTube search] DownloadError: {err_msg}")
        return jsonify({
            'error': mapped['user_message'],
            'code': mapped['code'],
            'stage': 'search',
            'details': err_msg
        }), mapped['status']
    except Exception as e:
        print(f"[YouTube search] Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': 'Unexpected backend error during YouTube search.',
            'code': 'youtube_search_internal_error',
            'stage': 'search',
            'details': str(e)
        }), 500

# YouTube Download Endpoint
@app.route('/youtube/download', methods=['POST'])
def youtube_download():
    try:
        data = request.get_json()
        video_url = data.get('url', '')
        
        if not video_url:
            return jsonify({'error': 'Video URL is required'}), 400
        
        # Create session directory
        session_id = str(uuid.uuid4())
        session_folder = UPLOAD_FOLDER / session_id
        session_folder.mkdir(parents=True, exist_ok=True)
        
        # Download audio from YouTube
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
        ydl_opts = apply_ytdlp_auth_options(ydl_opts)
        
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(video_url, download=True)
            title = info.get('title', 'Unknown')
            # Sanitize title for filename
            safe_title = secure_filename(title)[:50]
        
        # Find the downloaded MP3 file
        mp3_files = list(session_folder.glob('*.mp3'))
        if not mp3_files:
            # Try m4a or other formats
            audio_files = list(session_folder.glob('*.*'))
            if audio_files:
                mp3_file = audio_files[0]
            else:
                return jsonify({'error': 'Failed to download audio'}), 500
        else:
            mp3_file = mp3_files[0]
        
        # Rename file if needed
        final_filename = f"{safe_title}.mp3" if not mp3_file.name.endswith('.mp3') else mp3_file.name
        if mp3_file.name != final_filename:
            final_path = session_folder / final_filename
            shutil.move(str(mp3_file), str(final_path))
        else:
            final_path = mp3_file
        
        # Return session info and stems endpoint
        return jsonify({
            'message': 'Download complete',
            'session_id': session_id,
            'filename': final_filename,
            'title': title,
            'download_url': f'/download/{session_id}/{final_filename}'
        }), 200
        
    except DownloadError as e:
        err_msg = str(e)
        mapped = classify_ytdlp_error(err_msg, stage='download')
        print(f"[YouTube download] DownloadError: {err_msg}")
        return jsonify({
            'error': mapped['user_message'],
            'code': mapped['code'],
            'stage': 'download',
            'details': err_msg
        }), mapped['status']
    except Exception as e:
        print(f"[YouTube download] Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({
            'error': 'Unexpected backend error during YouTube download.',
            'code': 'youtube_download_internal_error',
            'stage': 'download',
            'details': str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
