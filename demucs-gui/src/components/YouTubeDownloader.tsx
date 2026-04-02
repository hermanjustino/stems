import { useState } from 'react';
import { Youtube, Download, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { downloadYouTube, YouTubeVideo } from '../lib/api';

interface YouTubeDownloaderProps {
  video: YouTubeVideo | null;
  onDownloadComplete: (filename: string, session_id: string, title: string) => void;
  onCancel: () => void;
}

export function YouTubeDownloader({ video, onDownloadComplete, onCancel }: YouTubeDownloaderProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<'starting' | 'downloading' | 'converting' | 'complete'>('starting');

  const handleDownload = async () => {
    if (!video) return;

    setIsDownloading(true);
    setError(null);
    setProgress('starting');

    try {
      // Simulate progress stages
      setTimeout(() => setProgress('downloading'), 500);
      setTimeout(() => setProgress('converting'), 3000);

      const result = await downloadYouTube(video.url);
      setProgress('complete');
      
      setTimeout(() => {
        onDownloadComplete(result.filename, result.session_id, result.title);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download from YouTube');
      setIsDownloading(false);
    }
  };

  if (!video) return null;

  return (
    <div className="bg-gray-800/80 backdrop-blur-sm rounded-xl p-6">
      <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Youtube className="w-5 h-5 text-red-500" />
        Download Audio
      </h3>

      <div className="flex gap-4 mb-6">
        <img
          src={video.thumbnail}
          alt={video.title}
          className="w-32 h-20 object-cover rounded-lg flex-shrink-0"
        />
        <div className="flex-1">
          <h4 className="font-medium text-gray-200">{video.title}</h4>
          <p className="text-sm text-gray-400">{video.channel}</p>
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-red-400 hover:text-red-300 underline mt-1 inline-block"
          >
            Watch on YouTube
          </a>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500 rounded-lg flex items-center gap-2 text-red-300 mb-4">
          <AlertCircle className="w-5 h-5" />
          {error}
        </div>
      )}

      {isDownloading && (
        <div className="mb-4">
          <div className="flex items-center gap-3 text-gray-300 mb-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>
              {progress === 'starting' && 'Starting download...'}
              {progress === 'downloading' && 'Downloading audio...'}
              {progress === 'converting' && 'Converting to MP3...'}
              {progress === 'complete' && 'Download complete!'}
            </span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                progress === 'complete'
                  ? 'bg-green-500 w-full'
                  : progress === 'converting'
                  ? 'bg-yellow-500 w-3/4'
                  : progress === 'downloading'
                  ? 'bg-red-500 w-1/2'
                  : 'bg-gray-500 w-1/4'
              }`}
            />
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleDownload}
          disabled={isDownloading}
          className="flex-1 px-6 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-700 rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isDownloading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              Download & Split
            </>
          )}
        </button>
        <button
          onClick={onCancel}
          disabled={isDownloading}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 rounded-lg transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
