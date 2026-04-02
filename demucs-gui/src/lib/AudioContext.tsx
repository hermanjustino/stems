import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';

interface Stem {
  name: string;
  url: string;
  color: string;
  volume: number;
  muted: boolean;
}

interface AudioPlayerContextType {
  stems: Stem[];
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  masterVolume: number;
  setStems: (stems: Stem[]) => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  registerAudio: (stemName: string, audio: HTMLAudioElement) => void;
  setStemVolume: (stemName: string, volume: number) => void;
  toggleStemMute: (stemName: string) => void;
  setMasterVolume: (volume: number) => void;
  reset: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [stems, setStems] = useState<Stem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [masterVolume, setMasterVolumeState] = useState(1);
  
  const audioElementsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const isSeekingRef = useRef(false);
  const isPlayingRef = useRef(false);
  
  // Update ref when isPlaying changes
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Register audio element for a stem
  const registerAudio = useCallback((stemName: string, audio: HTMLAudioElement) => {
    audioElementsRef.current.set(stemName, audio);
    
    audio.addEventListener('loadedmetadata', () => {
      let maxDuration = 0;
      audioElementsRef.current.forEach((el: HTMLAudioElement) => {
        if (el.duration > maxDuration) maxDuration = el.duration;
      });
      setDuration(maxDuration);
    });
    
    audio.addEventListener('timeupdate', () => {
      if (!isSeekingRef.current && isPlayingRef.current) {
        setCurrentTime(audio.currentTime);
      }
    });
    
    audio.addEventListener('ended', () => {
      const audios = Array.from(audioElementsRef.current.values());
      const allEnded = audios.length > 0 && audios.every((el) => el.ended);
      if (allEnded) setIsPlaying(false);
    });
  }, []);

  // Sync all audio elements
  const syncAudios = useCallback((targetTime: number) => {
    audioElementsRef.current.forEach((audio: HTMLAudioElement) => {
      if (Math.abs(audio.currentTime - targetTime) > 0.05) {
        audio.currentTime = targetTime;
      }
    });
  }, []);

  // Handle play/pause
  const togglePlay = useCallback(() => {
    if (isPlaying) {
      audioElementsRef.current.forEach((audio: HTMLAudioElement) => {
        audio.pause();
      });
      setIsPlaying(false);
    } else {
      audioElementsRef.current.forEach((audio: HTMLAudioElement) => {
        audio.play().catch((err: Error) => {
          if (err.name === 'AbortError') {
            console.warn('Audio playback aborted (likely due to user interaction or new playback request).');
          } else {
            console.error(`Error playing ${audio.src}:`, err);
          }
        });
      });
      setIsPlaying(true);
    }
  }, [isPlaying]);

  // Seek functionality
  const seek = useCallback((time: number) => {
    isSeekingRef.current = true;
    setCurrentTime(time);
    syncAudios(time);
    
    setTimeout(() => {
      isSeekingRef.current = false;
    }, 100);
  }, [syncAudios]);

  // Set individual stem volume
  const setStemVolume = useCallback((stemName: string, volume: number) => {
    setStems((prev: Stem[]) => prev.map((stem: Stem) => {
      if (stem.name === stemName) {
        const audio = audioElementsRef.current.get(stemName);
        if (audio) {
          audio.volume = volume * masterVolume;
        }
        return { ...stem, volume, muted: volume === 0 };
      }
      return stem;
    }));
  }, [masterVolume]);

  // Toggle stem mute
  const toggleStemMute = useCallback((stemName: string) => {
    setStems((prev: Stem[]) => prev.map((stem: Stem) => {
      if (stem.name === stemName) {
        const audio = audioElementsRef.current.get(stemName);
        if (audio) {
          const newMuted = !stem.muted;
          audio.muted = newMuted;
          return { ...stem, muted: newMuted };
        }
      }
      return stem;
    }));
  }, []);

  // Set master volume
  const setMasterVolume = useCallback((volume: number) => {
    setMasterVolumeState(volume);
    audioElementsRef.current.forEach((audio: HTMLAudioElement, name: string) => {
      const stem = stems.find((s: Stem) => s.name === name);
      if (stem) {
        audio.volume = (stem.volume !== undefined ? stem.volume : 1) * volume;
      } else {
        audio.volume = volume;
      }
    });
  }, [stems]);

  // Reset player state
  const reset = useCallback(() => {
    audioElementsRef.current.forEach((audio: HTMLAudioElement) => {
      audio.pause();
      audio.currentTime = 0;
    });
    audioElementsRef.current.clear(); // Important to clear on reset
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setStems([]);
  }, []);

  const value = {
    stems,
    isPlaying,
    currentTime,
    duration,
    masterVolume,
    setStems,
    registerAudio,
    togglePlay,
    seek,
    setStemVolume,
    toggleStemMute,
    setMasterVolume,
    reset
  };

  return (
    <AudioPlayerContext.Provider value={value}>
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (context === undefined) {
    throw new Error('useAudioPlayer must be used within an AudioPlayerProvider');
  }
  return context;
}
