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
            
            # Use htdemucs_6s model for 6 stems (vocals, drums, bass, other, guitar, piano)
            # Ensure the command is formatted correctly
            cmd = f'-n htdemucs_6s --mp3 --out "{output_dir}" "{file_path}"'
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
        model_name = 'htdemucs_6s'
        separated_track_dir = output_dir / model_name / Path(filename).stem
        
        print(f"Searching for separated files in: {separated_track_dir}")
        if not separated_track_dir.exists():
            # Sometimes demucs might use a different folder structure depending on model or version
            # Let's search for any mp3 files in the output directory
            separated_files = list(output_dir.rglob('*.mp3'))
            print(f"Found files via rglob: {separated_files}")
            if not separated_files:
                return jsonify({'error': 'Separated files not found in output directory'}), 500
            
            for stem_file in separated_files:
                stem_type = stem_file.stem
                new_filename = f"{original_name}-{stem_type}.mp3"
                new_file_path = session_folder / new_filename
                shutil.copy2(stem_file, new_file_path)
                stems[stem_type] = f'/download/{session_id}/{new_filename}'
        else:
            for stem_file in separated_track_dir.glob('*.mp3'):
                stem_type = stem_file.stem
                new_filename = f"{original_name}-{stem_type}.mp3"
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
        }
        
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
            
    except Exception as e:
        print(f"Error searching YouTube: {str(e)}")
        return jsonify({'error': 'Failed to search YouTube'}), 500

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
        }
        
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
        
    except Exception as e:
        print(f"Error downloading from YouTube: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)