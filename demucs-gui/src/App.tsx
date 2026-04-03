import { useState, useEffect } from 'react';
import { AudioPlayerProvider, useAudioPlayer } from './lib/AudioContext';
import { StemPlayer } from './components/StemPlayer';
import { AddSongModal } from './components/AddSongModal';
import { uploadAudio, checkServerStatus, cleanupSession, searchYouTube, downloadYouTube } from './lib/api';
import { Plus } from 'lucide-react';

function AppContent() {
  const [error, setError] = useState<string | null>(null);
  const { stems, reset, setStems } = useAudioPlayer();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const checkServer = async () => {
      const isServerUp = await checkServerStatus();
      if (!isServerUp) {
        setError('Server is currently unavailable. Please ensure the backend is running.');
      }
    };
    checkServer();
  }, []);

  const handleFileUpload = async (file: File) => {
    try {
      if (currentSessionId) {
        await cleanupSession(currentSessionId);
      }
      const result = await uploadAudio(file);
      if (!result.vocals && !result.drums) {
        throw new Error('Processing failed: No stems were returned by the server.');
      }
      setCurrentSessionId(result.session_id);
      
      setStems([
        { name: 'Vocals', url: result.vocals, color: 'bg-[var(--stem-vocals)]', volume: 1, muted: false },
        { name: 'Drums', url: result.drums, color: 'bg-[var(--stem-drums)]', volume: 1, muted: false },
        { name: 'Bass', url: result.bass, color: 'bg-[var(--stem-bass)]', volume: 1, muted: false },
        { name: 'Other', url: result.other, color: 'bg-[var(--stem-other)]', volume: 1, muted: false }
      ]);
      setError(null);
    } catch (err) {
      console.error('Upload failed:', err);
      reset();
      setCurrentSessionId(null);
      setError(err instanceof Error ? err.message : 'An error occurred during processing');
      throw err;
    }
  };

  const handleYouTubeSelect = async (query: string) => {
    try {
      if (currentSessionId) {
        await cleanupSession(currentSessionId);
      }
      
      let videoUrl = query;
      // Search if it's not a direct URL
      if (!query.includes('youtube.com') && !query.includes('youtu.be')) {
        const results = await searchYouTube(query);
        if (!results || results.length === 0) {
          throw new Error('No videos found for this search.');
        }
        videoUrl = results[0].url;
      }
      
      // Download the audio
      const result = await downloadYouTube(videoUrl);
      setCurrentSessionId(result.session_id);
      
      // Now process the downloaded file with Demucs
      const downloadUrl = `/download/${result.session_id}/${result.filename}`;
      const API_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5001';
      const response = await fetch(`${API_URL}${downloadUrl}`);
      const blob = await response.blob();
      const file = new File([blob], result.filename, { type: 'audio/mpeg' });

      // Process with Demucs
      const formData = new FormData();
      formData.append('file', file);
      const processResponse = await fetch(`${API_URL}/process`, {
        method: 'POST',
        body: formData
      });

      if (!processResponse.ok) {
        const errData = await processResponse.json().catch(() => null);
        throw new Error(errData?.error || 'Failed to process audio');
      }

      const processData = await processResponse.json();
      const missingStems = ['vocals', 'drums', 'bass', 'other'].filter(
        (stemName) => !processData?.stems?.[stemName]
      );
      if (missingStems.length > 0) {
        throw new Error(`Processing returned incomplete stems. Missing: ${missingStems.join(', ')}`);
      }

      setStems([
        { name: 'Vocals', url: processData.stems.vocals, color: 'bg-[var(--stem-vocals)]', volume: 1, muted: false },
        { name: 'Drums', url: processData.stems.drums, color: 'bg-[var(--stem-drums)]', volume: 1, muted: false },
        { name: 'Bass', url: processData.stems.bass, color: 'bg-[var(--stem-bass)]', volume: 1, muted: false },
        { name: 'Other', url: processData.stems.other, color: 'bg-[var(--stem-other)]', volume: 1, muted: false }
      ]);
      setError(null);
      
    } catch (err) {
      console.error('YouTube Processing failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to process audio');
      reset();
      setCurrentSessionId(null);
      throw err;
    }
  };

  return (
    <div className="min-h-screen pb-20 select-none">
      <div className="max-w-[1000px] mx-auto px-6 pt-12 animate-in fade-in zoom-in-95 duration-500">
        <main className="mt-12 flex flex-col items-center justify-center min-h-[500px]">
          {error && (
            <div className="w-full max-w-lg mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-center text-sm font-medium animate-in fade-in slide-in-from-top-4">
              {error}
              <button 
                className="ml-4 underline hover:text-red-400"
                onClick={() => setError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="mb-12 relative flex justify-center z-10">
            <button 
              onClick={() => setIsModalOpen(true)}
              className="stem-button rounded-full px-8 py-3 flex items-center gap-2 text-[#5e5145] shadow-[0_4px_14px_rgba(0,0,0,0.1)] font-bold tracking-wide hover:scale-105 active:scale-95 transition-transform"
            >
              <Plus className="w-5 h-5" />
              Add Song
            </button>
          </div>

          {/* Stem Player stays permanently mounted below the add button */}
          <div className={`${stems.length === 0 ? 'opacity-30 grayscale pointer-events-none' : 'opacity-100'} transition-all duration-1000 ease-out`}>
             <StemPlayer />
          </div>
          
          {stems.length === 0 && !error && (
            <p className="mt-8 text-[#8b7968] font-medium tracking-wide animate-in fade-in">
              Player is idle. Click "Add Song" to begin.
            </p>
          )}

        </main>
      </div>

      <AddSongModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onFileUpload={handleFileUpload}
        onYouTubeSelect={handleYouTubeSelect}
      />
    </div>
  );
}

export default function App() {
  return (
    <AudioPlayerProvider>
      <AppContent />
    </AudioPlayerProvider>
  );
}
