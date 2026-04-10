import React, { useRef, useState, useEffect } from 'react';
import { useAudioPlayer } from '../lib/AudioContext';
import { Play, Pause, Loader2 } from 'lucide-react';

// 4 step colors matching the physical device (inner to outer)
const NODE_COLORS = ['#fb923c', '#f43f5e', '#a855f7', '#3b82f6']; // Orange, Rose, Purple, Blue

interface StemLightSliderProps {
  stemName: string;
  volume: number;
  position: 'top' | 'bottom' | 'left' | 'right';
  onChange: (volume: number) => void;
}

function StemLightSlider({ stemName, volume, position, onChange }: StemLightSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  // 4 light nodes per strip: 25%, 50%, 75%, 100%
  const nodes = [0.25, 0.5, 0.75, 1.0];

  const handleInteract = (e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else if ('clientX' in e) {
      clientX = e.clientX;
      clientY = e.clientY;
    } else {
      return;
    }
    
    let percentage = 0;
    // Calculate distance from the center of the device over the length of the strip
    switch (position) {
      case 'top':
        percentage = (rect.bottom - clientY) / rect.height;
        break;
      case 'bottom':
        percentage = (clientY - rect.top) / rect.height;
        break;
      case 'left':
        percentage = (rect.right - clientX) / rect.width;
        break;
      case 'right':
        percentage = (clientX - rect.left) / rect.width;
        break;
    }
    
    // Clamp between 0 and 1
    percentage = Math.max(0, Math.min(1, percentage));
    
    // Snap to nearest 25% (4 nodes + 0 state makes 5 possible states: 0, 0.25, 0.5, 0.75, 1.0)
    const snapped = Math.round(percentage * 4) / 4;
    onChange(snapped);
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => handleInteract(e);
    const handleMouseUp = () => setIsDragging(false);
    
    const handleTouchMove = (e: TouchEvent) => handleInteract(e);
    const handleTouchEnd = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [isDragging]);

  const positionClass = 
    position === 'top' ? 'top-6 left-1/2 -translate-x-1/2 w-10 h-[100px]' :
    position === 'bottom' ? 'bottom-6 left-1/2 -translate-x-1/2 w-10 h-[100px]' :
    position === 'left' ? 'left-6 top-1/2 -translate-y-1/2 w-[100px] h-10' :
    'right-6 top-1/2 -translate-y-1/2 w-[100px] h-10';

  const flexDirection = 
    position === 'top' ? 'column-reverse' :
    position === 'bottom' ? 'column' :
    position === 'left' ? 'row-reverse' :
    'row';

  return (
    <div 
      className={`absolute ${positionClass} stem-strip cursor-pointer group`}
      ref={trackRef}
      onMouseDown={(e) => {
        setIsDragging(true);
        handleInteract(e);
      }}
      onTouchStart={(e) => {
        setIsDragging(true);
        handleInteract(e);
      }}
      title={`${stemName} Volume`}
    >
      <div className="flex w-full h-full justify-between items-center px-3 py-3" style={{ flexDirection }}>
        {nodes.map((nodeVal, i) => {
          const isActive = volume >= nodeVal;
          const glowColor = NODE_COLORS[i];
          
          return (
            <div 
              key={i} 
              className={`stem-node transition-all duration-200 ease-out`}
              style={{
                backgroundColor: isActive ? glowColor : '#a8988a',
                boxShadow: isActive ? `0 0 12px ${glowColor}, inset 1px 1px 3px rgba(255,255,255,0.6)` : 'inset 1px 1px 2px rgba(0,0,0,0.2)',
                transform: (isDragging && isActive) ? 'scale(1.2) brightness(1.2)' : 'scale(1)'
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export function StemPlayer() {
  const { stems, setStemVolume, isPlaying, togglePlay, isBuffering } = useAudioPlayer();

  const getVolume = (name: string) => stems.find((s) => s.name === name)?.volume ?? 0;

  return (
    <div className="flex flex-col items-center justify-center py-2 select-none">
      <div className="stem-device-container">
        
        {/* Vocals - Top */}
        <StemLightSlider
          stemName="Vocals"
          volume={getVolume('Vocals')}
          position="top"
          onChange={(v) => setStemVolume('Vocals', v)}
        />

        {/* Drums - Bottom */}
        <StemLightSlider
          stemName="Drums"
          volume={getVolume('Drums')}
          position="bottom"
          onChange={(v) => setStemVolume('Drums', v)}
        />

        {/* Bass - Left */}
        <StemLightSlider
          stemName="Bass"
          volume={getVolume('Bass')}
          position="left"
          onChange={(v) => setStemVolume('Bass', v)}
        />

        {/* Other - Right */}
        <StemLightSlider
          stemName="Other"
          volume={getVolume('Other')}
          position="right"
          onChange={(v) => setStemVolume('Other', v)}
        />

        {/* Center Play Button */}
        <button 
          className="stem-center-button active:scale-95 transition-transform"
          onClick={togglePlay}
          disabled={isBuffering}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isBuffering ? (
            <Loader2 className="w-8 h-8 text-[#bbaea0] animate-spin" />
          ) : isPlaying ? (
            <Pause className="w-8 h-8 fill-current text-[#bbaea0]" />
          ) : (
            <Play className="w-8 h-8 fill-current text-[#bbaea0] ml-1" />
          )}
        </button>

      </div>
    </div>
  );
}
