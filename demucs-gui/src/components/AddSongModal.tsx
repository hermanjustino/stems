import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, Music, Music2 } from 'lucide-react';
import { searchSoundCloud, SearchResult } from '../lib/api';

interface AddSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileUpload: (file: File) => Promise<void>;
  onTrackSelect: (url: string) => Promise<void>;
}

interface TestSong {
  label: string;
  query: string;
}

const TEST_SONGS: TestSong[] = [
  { label: 'Another Brick in the Wall Pt 2 - Pink Floyd', query: 'Another Brick in the Wall Part 2 Pink Floyd' },
  { label: 'To Zion - Lauryn Hill', query: 'To Zion Lauryn Hill' },
  { label: 'Ready or Not - Fugees', query: 'Ready or Not Fugees' },
  { label: "Isn't She Lovely - Stevie Wonder", query: "Isn't She Lovely Stevie Wonder" },
  { label: 'Mona Ki Ngi Xica - Bonga', query: 'Mona Ki Ngi Xica Bonga' },
];

export function AddSongModal({ isOpen, onClose, onFileUpload, onTrackSelect }: AddSongModalProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    try {
      await onFileUpload(file);
      onClose();
      setSearchResults([]);
      setUrl('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    // Direct SoundCloud URL — skip search
    if (url.includes('soundcloud.com/')) {
      setIsLoading(true);
      try {
        await onTrackSelect(url);
        onClose();
        setSearchResults([]);
        setUrl('');
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
      return;
    }

    // Otherwise search SoundCloud
    setIsSearching(true);
    setSearchResults([]);
    try {
      const results = await searchSoundCloud(url);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultClick = async (trackUrl: string) => {
    setIsLoading(true);
    try {
      await onTrackSelect(trackUrl);
      onClose();
      setSearchResults([]);
      setUrl('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTestSongClick = async (song: TestSong) => {
    setIsLoading(true);
    try {
      await onTrackSelect(song.query);
      onClose();
      setSearchResults([]);
      setUrl('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center stem-modal-overlay">
      <div className="stem-modal-container p-8 relative w-full max-w-3xl mx-4 animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          disabled={isLoading}
          className="absolute top-6 right-6 text-[#8b7968] hover:text-[#5e5145] transition-colors disabled:opacity-50"
        >
          <X className="w-6 h-6" />
        </button>

        <h2 className="text-2xl font-bold text-[#5e5145] mb-8 tracking-tight text-center">Add a Song</h2>

        <div className="flex flex-col md:flex-row gap-6 items-stretch justify-center">

          {/* SoundCloud Search Input */}
          <form onSubmit={handleSubmit} className="flex-grow flex relative">
            <div className="relative w-full flex">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 text-orange-500">
                <Music2 className="w-6 h-6" />
              </div>
              <input
                type="text"
                placeholder="Search SoundCloud or paste link..."
                disabled={isLoading}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="stem-input w-full pl-16 pr-4 py-4 rounded-full text-lg text-[#5e5145] placeholder-[#8b7968]/60 font-medium"
              />
              <button
                type="submit"
                disabled={isLoading || isSearching || !url.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 stem-button p-2 px-6 rounded-full text-[#5e5145] font-semibold flex items-center disabled:opacity-50 transition-all hover:scale-105 active:scale-95"
              >
                {isSearching ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Search'}
              </button>
            </div>
          </form>

          {/* OR Divider */}
          <div className="hidden md:flex items-center text-[#8b7968] font-bold px-2">OR</div>

          {/* MP3 Upload Button */}
          <button
            onClick={handleFileClick}
            disabled={isLoading}
            className="stem-button rounded-full px-8 py-4 flex items-center justify-center gap-3 text-[#5e5145] font-semibold whitespace-nowrap disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              <>
                <Upload className="w-6 h-6" />
                Add MP3
              </>
            )}
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="audio/*"
              className="hidden"
            />
          </button>

        </div>

        {/* Search Results */}
        {searchResults.length > 0 && !isLoading && (
          <div className="mt-8 w-full max-h-72 overflow-y-auto pr-2 flex flex-col gap-3 custom-scrollbar animate-in slide-in-from-bottom-4 duration-300">
            {searchResults.map((track) => (
              <button
                key={track.id}
                onClick={() => handleResultClick(track.url)}
                className="w-full text-left flex items-center gap-5 p-3 rounded-[20px] bg-white/20 hover:bg-white/40 border border-white/30 hover:border-white/60 transition-all group"
              >
                <div className="relative overflow-hidden rounded-xl shadow-md min-w-[80px] h-20 flex items-center justify-center bg-orange-100/50">
                  {track.thumbnail ? (
                    <img
                      src={track.thumbnail}
                      alt={track.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  ) : (
                    <Music className="w-8 h-8 text-orange-400" />
                  )}
                </div>

                <div className="flex-col flex-1 overflow-hidden">
                  <h3 className="text-[#5e5145] font-bold truncate text-base mb-1">{track.title}</h3>
                  <div className="flex items-center gap-2 text-[#8b7968]">
                    <Music2 className="w-4 h-4 opacity-70 text-orange-500" />
                    <p className="text-sm truncate font-medium">{track.channel}</p>
                    {track.duration > 0 && (
                      <span className="text-xs text-[#8b7968]/60 ml-auto pr-2">
                        {Math.floor(track.duration / 60)}:{(track.duration % 60).toString().padStart(2, '0')}
                      </span>
                    )}
                  </div>
                </div>

                <div className="pr-4 opacity-0 group-hover:opacity-100 transition-opacity -translate-x-4 group-hover:translate-x-0 transform duration-300">
                  <div className="w-10 h-10 rounded-full bg-orange-400/20 text-orange-600 flex items-center justify-center">
                    <Music className="w-5 h-5" />
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Test Picks */}
        {!isLoading && searchResults.length === 0 && (
          <div className="mt-8">
            <p className="text-xs font-semibold tracking-[0.12em] uppercase text-[#8b7968] mb-3 text-center">Test Picks</p>
            <div className="flex flex-col gap-3">
              {TEST_SONGS.map((song) => (
                <button
                  key={song.query}
                  onClick={() => handleTestSongClick(song)}
                  className="stem-button rounded-2xl p-3 text-left text-[#5e5145] font-medium hover:scale-[1.01] active:scale-[0.99] transition-transform flex items-center gap-4"
                >
                  <div className="w-20 h-14 rounded-lg flex-shrink-0 bg-orange-100/60 flex items-center justify-center">
                    <Music2 className="w-7 h-7 text-orange-400" />
                  </div>
                  <span className="text-sm md:text-base">{song.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {isLoading && (
          <div className="mt-10 flex flex-col items-center justify-center animate-in fade-in duration-300">
            <p className="text-[#8b7968] font-medium mb-5 animate-pulse">Processing audio stems via AI... This takes a minute.</p>
            <div className="flex gap-4">
              <div className="w-3 h-3 rounded-full bg-red-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-3 h-3 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <div className="w-3 h-3 rounded-full bg-purple-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              <div className="w-3 h-3 rounded-full bg-orange-400 animate-bounce" style={{ animationDelay: '450ms' }} />
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
