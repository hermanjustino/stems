import { useState, useEffect } from 'react';
import { AudioPlayerProvider, useAudioPlayer } from './lib/AudioContext';
import { Header } from './components/Header';
import { FileUpload } from './components/FileUpload';
import { PlayerController } from './components/PlayerController';
import { StemMixer } from './components/StemMixer';
import { YouTubeSearch } from './components/YouTubeSearch';
import { YouTubeDownloader } from './components/YouTubeDownloader';
import { uploadAudio, checkServerStatus, cleanupSession, YouTubeVideo } from './lib/api';
import { Music4, Wand2, Sparkles, Upload, Youtube } from 'lucide-react';

function Player() {
  return (
    <div className="space-y-8 animate-in">
      <PlayerController />
      <StemMixer />
    </div>
  );
}

function UploadSection() {
  const { setStems, reset } = useAudioPlayer();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileUpload = async (file: File) => {
    setIsProcessing(true);
    try {
      if (currentSessionId) {
        await cleanupSession(currentSessionId);
      }

      const result = await uploadAudio(file);

      // Safety check: ensure we actually have URLs for the stems
      if (!result.vocals && !result.drums) {
        throw new Error('Processing failed: No stems were returned by the server.');
      }

      setCurrentSessionId(result.session_id);

      setStems([
        { name: 'Vocals', url: result.vocals, color: 'bg-pink-500', volume: 1, muted: false },
        { name: 'Drums', url: result.drums, color: 'bg-indigo-500', volume: 1, muted: false },
        { name: 'Bass', url: result.bass, color: 'bg-blue-500', volume: 1, muted: false },
        { name: 'Guitar', url: result.guitar, color: 'bg-amber-500', volume: 1, muted: false },
        { name: 'Piano', url: result.piano, color: 'bg-cyan-500', volume: 1, muted: false },
        { name: 'Other', url: result.other, color: 'bg-gray-400', volume: 1, muted: false }
      ]);
    } catch (err) {
      console.error('Upload failed:', err);
      reset();
      setCurrentSessionId(null);
      alert(err instanceof Error ? err.message : 'An error occurred during processing');
    } finally {
      setIsProcessing(false);
    }
  };

  return <FileUpload isProcessing={isProcessing} onFileUpload={handleFileUpload} />;
}

function AppContent() {
  const [hasStems, setHasStems] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadMode, setUploadMode] = useState<'file' | 'youtube'>('file');
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
  const { stems, reset, setStems } = useAudioPlayer();
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

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
    setHasStems(stems.length > 0);
  }, [stems]);

  const handleYouTubeDownload = async (video: YouTubeVideo) => {
    setSelectedVideo(video);
  };

  const handleDownloadComplete = async (filename: string, session_id: string, title: string) => {
    setIsDownloading(true);
    setCurrentSessionId(session_id);

    // Now process the downloaded file with Demucs
    try {
      const downloadUrl = `/download/${session_id}/${filename}`;

      // We need to fetch the file and then process it
      // For simplicity, we'll create a blob URL and process it
      const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}${downloadUrl}`);
      const blob = await response.blob();
      const file = new File([blob], filename, { type: 'audio/mpeg' });

      // Process with Demucs (reuse the upload logic)
      const formData = new FormData();
      formData.append('file', file);

      const processResponse = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:5001'}/process`, {
        method: 'POST',
        body: formData
      });

      if (!processResponse.ok) {
        throw new Error('Failed to process audio');
      }

      const result = await processResponse.json();

      setStems([
        { name: 'Vocals', url: result.stems.vocals, color: 'bg-pink-500', volume: 1, muted: false },
        { name: 'Drums', url: result.stems.drums, color: 'bg-indigo-500', volume: 1, muted: false },
        { name: 'Bass', url: result.stems.bass, color: 'bg-blue-500', volume: 1, muted: false },
        { name: 'Guitar', url: result.stems.guitar, color: 'bg-amber-500', volume: 1, muted: false },
        { name: 'Piano', url: result.stems.piano, color: 'bg-cyan-500', volume: 1, muted: false },
        { name: 'Other', url: result.stems.other, color: 'bg-gray-400', volume: 1, muted: false }
      ]);
      setHasStems(true);
      setSelectedVideo(null);
    } catch (err) {
      console.error('Processing failed:', err);
      setError('Failed to process audio');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCancelYouTube = () => {
    setSelectedVideo(null);
  };

  return (
    <div className="min-h-screen pb-20">
      <div className="max-w-[1000px] mx-auto px-6 pt-12">
        <Header />

        <main className="mt-12">
          {!hasStems && (
            <div className="animate-in">
              <div className="text-center mb-16">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4 text-[var(--apple-text)]">
                  Stemify
                </h1>
                <p className="text-xl text-[var(--apple-secondary)] max-w-2xl mx-auto font-medium">
                  Professional audio separation powered by AI.
                  Split any track into clear, individual stems instantly.
                </p>
              </div>

              <div className="max-w-2xl mx-auto">
                {error && (
                  <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-center text-sm font-medium">
                    {error}
                  </div>
                )}

                {/* Mode Tabs */}
                {!selectedVideo && (
                  <div className="flex gap-2 mb-6">
                    <button
                      onClick={() => setUploadMode('file')}
                      className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${uploadMode === 'file'
                        ? 'bg-[var(--apple-blue)] text-white'
                        : 'bg-[var(--apple-card)] text-[var(--apple-secondary)] hover:bg-[var(--apple-card-hover)]'
                        }`}
                    >
                      <Upload className="w-4 h-4" />
                      Upload File
                    </button>
                    <button
                      onClick={() => setUploadMode('youtube')}
                      className={`flex-1 py-3 px-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${uploadMode === 'youtube'
                        ? 'bg-red-500 text-white'
                        : 'bg-[var(--apple-card)] text-[var(--apple-secondary)] hover:bg-[var(--apple-card-hover)]'
                        }`}
                    >
                      <Youtube className="w-4 h-4" />
                      YouTube
                    </button>
                  </div>
                )}

                {/* Content based on mode */}
                {selectedVideo ? (
                  <YouTubeDownloader
                    video={selectedVideo}
                    onDownloadComplete={handleDownloadComplete}
                    onCancel={handleCancelYouTube}
                  />
                ) : uploadMode === 'file' ? (
                  <UploadSection />
                ) : (
                  <YouTubeSearch onVideoSelect={handleYouTubeDownload} />
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mt-24">
                <FeatureCard
                  title="Studio Quality"
                  description="Powered by the latest Demucs models for crystal clear results."
                />
                <FeatureCard
                  title="Total Control"
                  description="Adjust volumes and isolate instruments with our built-in mixer."
                />
                <FeatureCard
                  title="Privacy First"
                  description="Your audio stays on your machine. No cloud tracking."
                />
              </div>
            </div>
          )}

          {hasStems && (
            <div className="max-w-2xl mx-auto">
              <div className="flex justify-between items-end mb-8">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Project Stems</h2>
                  <p className="text-[var(--apple-secondary)] font-medium">
                    {selectedVideo ? `From YouTube: ${selectedVideo.title}` : 'AI Processing Complete'}
                  </p>
                  {isDownloading && (
                    <p className="text-[var(--apple-blue)] text-sm font-medium mt-1">
                      Downloading and processing...
                    </p>
                  )}
                </div>
                <button
                  onClick={() => {
                    reset();
                    setHasStems(false);
                    setSelectedVideo(null);
                    setCurrentSessionId(null);
                  }}
                  className="text-sm font-semibold text-[var(--apple-blue)] hover:opacity-70 transition-opacity"
                >
                  Start Over
                </button>
              </div>
              <Player />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function FeatureCard({ title, description }: { title: string, description: string }) {
  return (
    <div className="text-center">
      <h3 className="text-lg font-bold mb-2">{title}</h3>
      <p className="text-[var(--apple-secondary)] text-sm leading-relaxed font-medium">
        {description}
      </p>
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