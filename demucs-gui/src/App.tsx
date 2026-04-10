import { useState, useEffect, useRef } from 'react';
import { AudioPlayerProvider, useAudioPlayer } from './lib/AudioContext';
import { StemPlayer } from './components/StemPlayer';
import { AddSongModal } from './components/AddSongModal';
import { uploadAudio, checkServerStatus, cleanupSession, searchSoundCloud, downloadSoundCloud, pollJobStatus } from './lib/api';
import { Download, HelpCircle, Plus, Loader2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://127.0.0.1:5001');

interface TrackInfo {
  title: string;
  artist: string;
  fullSongUrl: string | null;
  fullSongFilename: string | null;
}

function AppContent() {
  const [error, setError] = useState<string | null>(null);
  const { stems, reset, setStems, isProcessing, setIsProcessing } = useAudioPlayer();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [trackInfo, setTrackInfo] = useState<TrackInfo>({
    title: 'No Song Loaded',
    artist: 'Add a track to begin',
    fullSongUrl: null,
    fullSongFilename: null,
  });
  const objectUrlRef = useRef<string | null>(null);

  const cleanupLocalObjectUrl = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  };

  const triggerDownload = (url: string, filename: string) => {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  const sanitizeFilenamePart = (value: string) =>
    value.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim() || 'track';

  const downloadAll = () => {
    if (!trackInfo.fullSongUrl && stems.length === 0) return;

    if (trackInfo.fullSongUrl) {
      const fullSongUrl = trackInfo.fullSongUrl.startsWith('blob:')
        ? trackInfo.fullSongUrl
        : `${API_URL}${trackInfo.fullSongUrl}`;

      triggerDownload(
        fullSongUrl,
        trackInfo.fullSongFilename || `${sanitizeFilenamePart(trackInfo.title)}.audio`
      );
    }

    stems.forEach((stem, index) => {
      const extension = stem.url.split('.').pop() || 'wav';
      const filename = `${sanitizeFilenamePart(trackInfo.title)}-${stem.name.toLowerCase()}.${extension}`;
      window.setTimeout(() => {
        triggerDownload(`${API_URL}${stem.url}`, filename);
      }, 250 * (index + 1));
    });
  };

  useEffect(() => {
    const checkServer = async () => {
      const isServerUp = await checkServerStatus();
      if (!isServerUp) {
        setError('Server is currently unavailable. Please ensure the backend is running.');
      }
    };
    checkServer();
  }, []);

  useEffect(() => {
    return () => {
      cleanupLocalObjectUrl();
    };
  }, []);

  const handleFileUpload = async (file: File) => {
    try {
      if (currentSessionId) {
        await cleanupSession(currentSessionId).catch(() => null);
      }
      cleanupLocalObjectUrl();
      setIsProcessing(true);
      setError(null);

      const sessionId = await uploadAudio(file);
      setCurrentSessionId(sessionId);

      const result = await pollJobStatus(sessionId);

      setStems([
        { name: 'Vocals', url: result.vocals, color: 'bg-[var(--stem-vocals)]', volume: 1, muted: false },
        { name: 'Drums', url: result.drums, color: 'bg-[var(--stem-drums)]', volume: 1, muted: false },
        { name: 'Bass', url: result.bass, color: 'bg-[var(--stem-bass)]', volume: 1, muted: false },
        { name: 'Other', url: result.other, color: 'bg-[var(--stem-other)]', volume: 1, muted: false }
      ]);

      const objectUrl = URL.createObjectURL(file);
      objectUrlRef.current = objectUrl;
      const rawTitle = file.name.replace(/\.[^/.]+$/, '');
      setTrackInfo({
        title: rawTitle || 'Uploaded Song',
        artist: 'Local File',
        fullSongUrl: objectUrl,
        fullSongFilename: file.name || `${rawTitle || 'uploaded-song'}.wav`,
      });
    } catch (err) {
      console.error('Upload failed:', err);
      reset();
      setCurrentSessionId(null);
      setError(err instanceof Error ? err.message : 'An error occurred during processing');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handles both direct SoundCloud URLs and search queries
  const handleTrackSelect = async (query: string) => {
    try {
      if (currentSessionId) {
        await cleanupSession(currentSessionId).catch(() => null);
      }
      setIsProcessing(true);
      setError(null);

      let trackUrl = query;
      let trackTitle = 'SoundCloud Track';
      let trackArtist = 'SoundCloud';

      // Search if it's not a direct SoundCloud URL
      if (!query.includes('soundcloud.com/')) {
        const results = await searchSoundCloud(query);
        if (!results || results.length === 0) {
          throw new Error('No tracks found on SoundCloud for this search.');
        }
        trackUrl = results[0].url;
        trackTitle = results[0].title;
        trackArtist = results[0].channel;
      }

      const result = await downloadSoundCloud(trackUrl);
      setCurrentSessionId(result.session_id);
      cleanupLocalObjectUrl();

      const processData = await pollJobStatus(result.session_id);

      setStems([
        { name: 'Vocals', url: processData.vocals, color: 'bg-[var(--stem-vocals)]', volume: 1, muted: false },
        { name: 'Drums', url: processData.drums, color: 'bg-[var(--stem-drums)]', volume: 1, muted: false },
        { name: 'Bass', url: processData.bass, color: 'bg-[var(--stem-bass)]', volume: 1, muted: false },
        { name: 'Other', url: processData.other, color: 'bg-[var(--stem-other)]', volume: 1, muted: false }
      ]);

      setTrackInfo({
        title: trackTitle,
        artist: trackArtist,
        fullSongUrl: null,
        fullSongFilename: null,
      });
    } catch (err) {
      console.error('Track processing failed:', err);
      setError(err instanceof Error ? err.message : 'Failed to process audio');
      reset();
      setCurrentSessionId(null);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="h-screen overflow-hidden select-none">
      <div className="max-w-[1000px] h-full mx-auto px-4 py-4 animate-in fade-in zoom-in-95 duration-500">
        <main className="h-full flex flex-col items-center justify-center">
          {error && (
            <div className="w-full max-w-lg mb-5 p-3 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-center text-sm font-medium animate-in fade-in slide-in-from-top-4">
              {error}
              <button
                className="ml-4 underline hover:text-red-400"
                onClick={() => setError(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="mb-10 relative flex items-center justify-center gap-3 z-10">
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={isProcessing}
              className="stem-button rounded-full px-8 py-3 flex items-center gap-2 text-[#5e5145] shadow-[0_4px_14px_rgba(0,0,0,0.1)] font-bold tracking-wide hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  AI Process Running...
                </>
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  Add Song
                </>
              )}
            </button>

            <div className="relative">
              <button
                onClick={() => setIsHelpOpen((prev) => !prev)}
                aria-label="Show usage help"
                title="How this works"
                className="stem-button rounded-full p-3 text-[#6f6052] hover:scale-105 active:scale-95 transition-transform"
              >
                <HelpCircle className="w-5 h-5" />
              </button>

              {isHelpOpen && (
                <div className="absolute left-1/2 top-[calc(100%+12px)] -translate-x-1/2 w-[320px] stem-help-popup p-4 text-left">
                  <p className="text-sm text-[#6b5c4d] leading-relaxed">
                    This is a digital stem player. Add a song, mix each stem in the player, and download the full song plus individual stems.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className={`${stems.length === 0 ? 'opacity-30 grayscale pointer-events-none' : 'opacity-100'} transition-all duration-1000 ease-out`}>
            <StemPlayer />
          </div>

          <div className="mt-10 w-full max-w-[560px] flex items-start justify-between gap-4">
            <div className="text-left">
              <h2 className="text-2xl font-semibold tracking-tight text-[#7a6958]">{trackInfo.title}</h2>
              <p className="mt-1 text-base text-[#8b7968] font-medium">{trackInfo.artist}</p>
            </div>
            <button
              onClick={downloadAll}
              disabled={!trackInfo.fullSongUrl && stems.length === 0}
              aria-label="Download full song and stems"
              title="Download full song and stems"
              className="stem-button rounded-full p-3 inline-flex items-center justify-center text-[#5e5145] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Download className="w-5 h-5" />
            </button>
          </div>

          {stems.length === 0 && !error && (
            <p className="mt-4 text-[#8b7968] font-medium tracking-wide animate-in fade-in">
              Player is idle. Click "Add Song" to begin.
            </p>
          )}

        </main>
      </div>

      <AddSongModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onFileUpload={handleFileUpload}
        onTrackSelect={handleTrackSelect}
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
