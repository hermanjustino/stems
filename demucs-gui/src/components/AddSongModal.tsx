import React, { useState, useRef } from 'react';
import { Upload, Youtube, X, Loader2, Music } from 'lucide-react';
import { searchYouTube, YouTubeVideo } from '../lib/api';

interface AddSongModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFileUpload: (file: File) => Promise<void>;
  onYouTubeSelect: (url: string) => Promise<void>;
}

export function AddSongModal({ isOpen, onClose, onFileUpload, onYouTubeSelect }: AddSongModalProps) {
  const [url, setUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<YouTubeVideo[]>([]);
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

  const handleYouTubeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    
    // If it's a direct URL, bypass search and download immediately
    if (url.includes('youtube.com/') || url.includes('youtu.be/')) {
      setIsLoading(true);
      try {
        await onYouTubeSelect(url);
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

    // Otherwise, search for the song
    setIsSearching(true);
    setSearchResults([]);
    try {
      const results = await searchYouTube(url);
      setSearchResults(results);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearching(false);
    }
  };

  const handleResultClick = async (videoUrl: string) => {
    setIsLoading(true);
    try {
      await onYouTubeSelect(videoUrl);
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
          
          {/* YouTube Input Form */}
          <form onSubmit={handleYouTubeSubmit} className="flex-grow flex relative">
            <div className="relative w-full flex">
              <div className="absolute left-6 top-1/2 -translate-y-1/2 text-red-500">
                <Youtube className="w-6 h-6" />
              </div>
              <input
                type="text"
                placeholder="Paste YouTube Link or Search..."
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

          {/* OR Divider (Tablet+) */}
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
        
        {/* Search Results List */}
        {searchResults.length > 0 && !isLoading && (
          <div className="mt-8 w-full max-h-72 overflow-y-auto pr-2 flex flex-col gap-3 custom-scrollbar animate-in slide-in-from-bottom-4 duration-300">
            {searchResults.map((video) => (
              <button
                key={video.id}
                onClick={() => handleResultClick(video.url)}
                className="w-full text-left flex items-center gap-5 p-3 rounded-[20px] bg-white/20 hover:bg-white/40 border border-white/30 hover:border-white/60 transition-all group"
              >
                <div className="relative overflow-hidden rounded-xl shadow-md min-w-[120px] h-20">
                  <img 
                    src={video.thumbnail} 
                    alt={video.title} 
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                  <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur-md text-white text-xs px-2 py-0.5 rounded-md font-medium">
                     {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
                  </div>
                </div>
                
                <div className="flex-col flex-1 overflow-hidden">
                   <h3 className="text-[#5e5145] font-bold truncate text-base mb-1">{video.title}</h3>
                   <div className="flex items-center gap-2 text-[#8b7968]">
                      <Youtube className="w-4 h-4 opacity-70" />
                      <p className="text-sm truncate font-medium">{video.channel}</p>
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
        )}        {isLoading && (
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

// Global CSS for the scrollbar inside this file (optional, but cleaner if kept in index.css)
// Assuming we already have standard custom-scrollbar or we just let it be webkit styled native
