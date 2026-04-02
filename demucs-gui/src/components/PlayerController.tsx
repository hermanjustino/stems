import { Play, Pause, SkipBack, SkipForward, Volume2, RotateCcw } from 'lucide-react';
import { useAudioPlayer } from '../lib/AudioContext';

export function PlayerController() {
  const {
    isPlaying,
    currentTime,
    duration,
    masterVolume,
    togglePlay,
    seek,
    setMasterVolume,
    reset
  } = useAudioPlayer();

  const formatTime = (time: number) => {
    if (isNaN(time)) return '0:00';
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(parseFloat(e.target.value));
  };

  const handleMasterVolume = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMasterVolume(parseFloat(e.target.value));
  };

  return (
    <div className="glass rounded-[32px] p-8 space-y-8">
      {/* Playback Controls */}
      <div className="flex flex-col items-center space-y-6">
        <div className="flex items-center justify-center gap-10">
          <button
            onClick={() => seek(0)}
            className="p-3 text-[var(--apple-secondary)] hover:text-[var(--apple-text)] transition-colors"
            title="Reset to start"
          >
            <RotateCcw className="w-6 h-6" />
          </button>

          <button
            onClick={() => seek(Math.max(0, currentTime - 10))}
            className="p-3 text-[var(--apple-secondary)] hover:text-[var(--apple-text)] transition-colors"
          >
            <SkipBack className="w-8 h-8 fill-current" />
          </button>

          <button
            onClick={togglePlay}
            className="w-20 h-20 flex items-center justify-center bg-[var(--apple-text)] text-[var(--apple-bg)] rounded-full hover:scale-105 transition-transform shadow-xl"
          >
            {isPlaying ? (
              <Pause className="w-10 h-10 fill-current" />
            ) : (
              <Play className="w-10 h-10 fill-current ml-1" />
            )}
          </button>

          <button
            onClick={() => seek(Math.min(duration, currentTime + 10))}
            className="p-3 text-[var(--apple-secondary)] hover:text-[var(--apple-text)] transition-colors"
          >
            <SkipForward className="w-8 h-8 fill-current" />
          </button>

          <div className="w-12 h-6" /> {/* Spacer */}
        </div>

        {/* Progress Bar */}
        <div className="w-full space-y-3">
          <div className="relative group">
            <input
              type="range"
              min="0"
              max={duration || 100}
              step="0.1"
              value={currentTime}
              onChange={handleSeek}
              className="w-full h-1.5 cursor-pointer"
            />
            {/* Custom progress visual */}
            <div 
              className="absolute top-1/2 -translate-y-1/2 left-0 h-1.5 bg-[var(--apple-text)] rounded-full pointer-events-none"
              style={{ width: `${(currentTime / (duration || 100)) * 100}%` }}
            />
          </div>
          <div className="flex justify-between text-[13px] font-semibold text-[var(--apple-secondary)] px-1">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {/* Volume Control */}
      <div className="flex items-center justify-center gap-4 pt-4 border-t border-[var(--glass-border)]">
        <Volume2 className="w-5 h-5 text-[var(--apple-secondary)]" />
        <div className="relative w-48 group">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={masterVolume}
            onChange={handleMasterVolume}
            className="w-full h-1.5 cursor-pointer"
          />
          <div 
            className="absolute top-1/2 -translate-y-1/2 left-0 h-1.5 bg-[var(--apple-secondary)] rounded-full pointer-events-none"
            style={{ width: `${masterVolume * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
