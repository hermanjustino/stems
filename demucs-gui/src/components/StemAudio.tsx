import { useEffect, useRef } from 'react';
import { useAudioPlayer } from '../lib/AudioContext';

interface StemAudioProps {
  stemName: string;
  url: string;
  volume: number;
}

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001';

export function StemAudio({ stemName, url, volume }: StemAudioProps) {
  const { registerAudio } = useAudioPlayer();
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio(`${API_URL}${url}`);
    audio.preload = 'auto';
    audio.volume = volume;
    audioRef.current = audio;

    registerAudio(stemName, audio);

    return () => {
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [stemName, url, registerAudio]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume, stemName]);

  return null;
}
