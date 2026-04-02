import { Volume2, VolumeX, Download } from 'lucide-react';
import { useAudioPlayer } from '../lib/AudioContext';
import { StemAudio } from './StemAudio';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export function StemMixer() {
  const { stems, setStemVolume, toggleStemMute } = useAudioPlayer();

  if (stems.length === 0) return null;

  return (
    <div className="space-y-4">
      {stems.map((stem) => (
        <div
          key={stem.name}
          className="glass rounded-2xl p-6 flex flex-col space-y-4 transition-all hover:scale-[1.01]"
        >
          {/* Audio Engine for this stem */}
          <StemAudio 
            stemName={stem.name} 
            url={stem.url} 
            volume={stem.muted ? 0 : stem.volume} 
          />

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${stem.color} shadow-sm`} />
              <span className="text-lg font-bold tracking-tight">{stem.name}</span>
            </div>
            
            <button
              onClick={() => window.open(`${API_URL}${stem.url}`, '_blank')}
              className="p-2 text-[var(--apple-secondary)] hover:text-[var(--apple-blue)] transition-colors"
              title={`Download ${stem.name}`}
            >
              <Download className="w-5 h-5" />
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => toggleStemMute(stem.name)}
              className="p-2 text-[var(--apple-secondary)] hover:text-[var(--apple-text)] transition-colors"
            >
              {stem.muted || stem.volume === 0 ? (
                <VolumeX className="w-5 h-5" />
              ) : (
                <Volume2 className="w-5 h-5" />
              )}
            </button>

            <div className="relative flex-1 group py-2">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={stem.muted ? 0 : stem.volume}
                onChange={(e) => setStemVolume(stem.name, parseFloat(e.target.value))}
                className="w-full h-1 cursor-pointer"
              />
              <div 
                className="absolute top-1/2 -translate-y-1/2 left-0 h-1 bg-[var(--apple-text)] rounded-full pointer-events-none transition-all"
                style={{ 
                  width: `${(stem.muted ? 0 : stem.volume) * 100}%`,
                  backgroundColor: stem.muted ? 'var(--apple-secondary)' : ''
                }}
              />
            </div>

            <span className="text-sm font-bold w-12 text-right text-[var(--apple-secondary)] tabular-nums">
              {Math.round((stem.muted ? 0 : stem.volume) * 100)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
