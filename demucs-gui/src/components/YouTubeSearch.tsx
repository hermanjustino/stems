import { useState } from 'react';
import { Search, Youtube, Clock, Download } from 'lucide-react';
import { searchYouTube, YouTubeVideo } from '../lib/api';

interface YouTubeSearchProps {
  onVideoSelect: (video: YouTubeVideo) => void;
}

export function YouTubeSearch({ onVideoSelect }: YouTubeSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<YouTubeVideo[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    setIsSearching(true);
    setError(null);

    try {
      const videos = await searchYouTube(query);
      setResults(videos);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search YouTube');
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-gray-800/80 backdrop-blur-sm rounded-xl p-6">
      <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
        <Youtube className="w-5 h-5 text-red-500" />
        Search YouTube
      </h3>

      <form onSubmit={handleSearch} className="mb-6">
        <div className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for songs, artists, or tracks..."
            className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-white placeholder-gray-500"
          />
          <button
            type="submit"
            disabled={isSearching}
            className="px-6 py-2 bg-red-500 hover:bg-red-600 disabled:bg-gray-700 rounded-lg transition-colors flex items-center gap-2"
          >
            {isSearching ? (
              <Search className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <Search className="w-4 h-4" />
                Search
              </>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="p-4 bg-red-500/20 border border-red-500 rounded-lg text-center text-red-300">
          {error}
        </div>
      )}

      {results.length > 0 && (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {results.map((video) => (
            <div
              key={video.id}
              className="flex gap-4 p-3 bg-gray-900/50 rounded-lg hover:bg-gray-900 transition-colors cursor-pointer group"
              onClick={() => onVideoSelect(video)}
            >
              <img
                src={video.thumbnail}
                alt={video.title}
                className="w-32 h-20 object-cover rounded-lg flex-shrink-0"
              />
              <div className="flex-1 min-w-0">
                <h4 className="font-medium text-gray-200 truncate group-hover:text-white">
                  {video.title}
                </h4>
                <p className="text-sm text-gray-400 truncate">{video.channel}</p>
                <div className="flex items-center gap-4 mt-2">
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Clock className="w-3 h-3" />
                    {formatDuration(video.duration)}
                  </span>
                  <span className="flex items-center gap-1 text-xs text-red-400 group-hover:text-red-300">
                    <Download className="w-3 h-3" />
                    Click to download
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {results.length === 0 && query && !isSearching && !error && (
        <p className="text-center text-gray-500 py-8">
          No results found. Try a different search term.
        </p>
      )}
    </div>
  );
}
