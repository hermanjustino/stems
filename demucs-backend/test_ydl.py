import yt_dlp
import sys

ydl_opts = {
    'quiet': False,
    'extract_flat': True,
    'default_search': 'ytsearch10',
    'extractor_args': {'youtube': {'player_client': ['web', 'ios', 'android']}}
}

try:
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        results = ydl.extract_info("ytsearch1:test", download=False)
        print("Success!")
except Exception as e:
    print(f"Error: {e}")
