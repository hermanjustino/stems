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
  isBuffering: boolean;
  isProcessing: boolean;
  setStems: (stems: Stem[]) => void;
  setIsProcessing: (isProcessing: boolean) => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  setStemVolume: (stemName: string, volume: number) => void;
  toggleStemMute: (stemName: string) => void;
  setMasterVolume: (volume: number) => void;
  reset: () => void;
}

const AudioPlayerContext = createContext<AudioPlayerContextType | undefined>(undefined);

const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '' : 'http://127.0.0.1:5001');

export function AudioPlayerProvider({ children }: { children: React.ReactNode }) {
  const [stems, setStems] = useState<Stem[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [masterVolume, setMasterVolumeState] = useState(1);
  const [isBuffering, setIsBuffering] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Web Audio Context refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const buffersRef = useRef<Map<string, AudioBuffer>>(new Map());
  const sourcesRef = useRef<Map<string, AudioBufferSourceNode>>(new Map());
  const gainNodesRef = useRef<Map<string, GainNode>>(new Map());
  
  // Timing state
  const offsetTimeRef = useRef(0);
  const startedAtRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  // Initialize audio context lazily
  const getAudioContext = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtxRef.current;
  };

  // Decode audio data when stems change
  useEffect(() => {
    if (stems.length === 0) {
      buffersRef.current.clear();
      setDuration(0);
      setCurrentTime(0);
      offsetTimeRef.current = 0;
      return;
    }

    const loadStems = async () => {
      setIsBuffering(true);
      const ctx = getAudioContext();
      const newBuffers = new Map<string, AudioBuffer>();
      const newGainNodes = new Map<string, GainNode>();
      let maxDuration = 0;

      try {
        await Promise.all(stems.map(async (stem) => {
          const response = await fetch(`${API_URL}${stem.url}`);
          const arrayBuffer = await response.arrayBuffer();
          const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
          newBuffers.set(stem.name, audioBuffer);
          
          if (audioBuffer.duration > maxDuration) {
            maxDuration = audioBuffer.duration;
          }

          // Create and persist gain node
          if (!gainNodesRef.current.has(stem.name)) {
            const gainNode = ctx.createGain();
            gainNode.gain.value = stem.muted ? 0 : stem.volume;
            gainNode.connect(ctx.destination);
            newGainNodes.set(stem.name, gainNode);
          } else {
            const gainNode = gainNodesRef.current.get(stem.name)!;
            gainNode.gain.value = stem.muted ? 0 : stem.volume;
            newGainNodes.set(stem.name, gainNode);
          }
        }));

        buffersRef.current = newBuffers;
        gainNodesRef.current = newGainNodes;
        setDuration(maxDuration);
      } catch (err) {
        console.error('Failed to decode audio buffers', err);
      } finally {
        setIsBuffering(false);
      }
    };

    // Only load if we haven't loaded these exact stems
    const allLoaded = stems.every(s => buffersRef.current.has(s.name));
    if (!allLoaded) {
      loadStems();
    }
  }, [stems]);

  // Sync loop for current time
  const updateTime = useCallback(() => {
    if (!isPlaying) return;
    const ctx = audioCtxRef.current;
    if (ctx) {
      const now = offsetTimeRef.current + (ctx.currentTime - startedAtRef.current);
      setCurrentTime(now);
      if (now >= duration && duration > 0) {
        setIsPlaying(false); // End of track
        offsetTimeRef.current = 0;
        setCurrentTime(0);
      } else {
        rafRef.current = requestAnimationFrame(updateTime);
      }
    }
  }, [isPlaying, duration]);

  useEffect(() => {
    if (isPlaying) {
      rafRef.current = requestAnimationFrame(updateTime);
    } else {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    }
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, updateTime]);

  const togglePlay = useCallback(() => {
    if (stems.length === 0 || isBuffering) return;
    const ctx = getAudioContext();

    if (isPlaying) {
      // Pause
      sourcesRef.current.forEach(source => {
        try { source.stop(); } catch (e) {}
        source.disconnect();
      });
      sourcesRef.current.clear();
      
      // Save offset
      offsetTimeRef.current += (ctx.currentTime - startedAtRef.current);
      if (ctx.state === 'running') ctx.suspend();
      setIsPlaying(false);
    } else {
      // Play
      if (ctx.state === 'suspended') ctx.resume();
      let offset = offsetTimeRef.current;
      if (offset >= duration) {
          offset = 0;
          offsetTimeRef.current = 0;
      }
      
      startedAtRef.current = ctx.currentTime;
      
      stems.forEach(stem => {
        const buffer = buffersRef.current.get(stem.name);
        const gainNode = gainNodesRef.current.get(stem.name);
        if (buffer && gainNode) {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(gainNode);
          source.start(0, offset);
          sourcesRef.current.set(stem.name, source);
        }
      });
      
      setIsPlaying(true);
    }
  }, [isPlaying, stems, isBuffering, duration]);

  const seek = useCallback((time: number) => {
    if (stems.length === 0 || isBuffering) return;
    const ctx = getAudioContext();
    
    offsetTimeRef.current = Math.max(0, Math.min(time, duration));
    setCurrentTime(offsetTimeRef.current);

    if (isPlaying) {
      // Stop current sources
      sourcesRef.current.forEach(source => {
        try { source.stop(); } catch(e) {}
        source.disconnect();
      });
      sourcesRef.current.clear();

      // Restart sources at new offset
      startedAtRef.current = ctx.currentTime;
      stems.forEach(stem => {
        const buffer = buffersRef.current.get(stem.name);
        const gainNode = gainNodesRef.current.get(stem.name);
        if (buffer && gainNode) {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(gainNode);
          source.start(0, offsetTimeRef.current);
          sourcesRef.current.set(stem.name, source);
        }
      });
    }
  }, [isPlaying, stems, isBuffering, duration]);

  const setStemVolume = useCallback((stemName: string, volume: number) => {
    setStems(prev => prev.map(s => s.name === stemName ? { ...s, volume } : s));
    const gainNode = gainNodesRef.current.get(stemName);
    if (gainNode) {
        // Use setTargetAtTime to prevent clicking noise
        // Minimum time constant is used to smooth the volume change
        gainNode.gain.setTargetAtTime(volume, getAudioContext().currentTime, 0.05);
    }
  }, []);

  const toggleStemMute = useCallback((stemName: string) => {
    setStems(prev => prev.map(s => {
      if (s.name === stemName) {
        const newMuted = !s.muted;
        const gainNode = gainNodesRef.current.get(stemName);
        if (gainNode) {
           gainNode.gain.setTargetAtTime(newMuted ? 0 : s.volume, getAudioContext().currentTime, 0.05);
        }
        return { ...s, muted: newMuted };
      }
      return s;
    }));
  }, []);

  const setMasterVolume = useCallback((volume: number) => {
    setMasterVolumeState(volume);
  }, []);

  const reset = useCallback(() => {
    sourcesRef.current.forEach(source => {
        try { source.stop(); } catch(e) {}
        source.disconnect();
    });
    sourcesRef.current.clear();
    setStems([]);
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    offsetTimeRef.current = 0;
    buffersRef.current.clear();
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sourcesRef.current.forEach(s => { try { s.stop(); } catch(e){} s.disconnect(); });
      audioCtxRef.current?.close();
    };
  }, []);

  return (
    <AudioPlayerContext.Provider
      value={{
        stems,
        isPlaying,
        currentTime,
        duration,
        masterVolume,
        isBuffering,
        isProcessing,
        setStems,
        setIsProcessing,
        togglePlay,
        seek,
        setStemVolume,
        toggleStemMute,
        setMasterVolume,
        reset,
      }}
    >
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
