import { useCallback } from 'react';
import { Upload, Music, Loader2 } from 'lucide-react';

interface FileUploadProps {
  onFileUpload: (file: File) => void;
  isProcessing: boolean;
}

export function FileUpload({ onFileUpload, isProcessing }: FileUploadProps) {
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('audio/')) {
        onFileUpload(file);
      }
    },
    [onFileUpload]
  );

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
    }
  };

  if (isProcessing) {
    return (
      <div className="glass rounded-[32px] p-12 flex flex-col items-center justify-center space-y-6 min-h-[400px]">
        <div className="relative">
          <Loader2 className="w-16 h-16 text-[var(--apple-blue)] animate-spin" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold tracking-tight mb-2">Processing Audio</h2>
          <p className="text-[var(--apple-secondary)] font-medium">
            AI is splitting your track into stems. This may take a minute...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      className="glass rounded-[32px] p-12 flex flex-col items-center justify-center space-y-8 min-h-[400px] cursor-pointer hover:scale-[1.01] transition-all border-dashed border-2 border-transparent hover:border-[var(--apple-blue)]"
      onClick={() => document.getElementById('file-input')?.click()}
    >
      <input
        id="file-input"
        type="file"
        accept="audio/*"
        onChange={handleFileInput}
        className="hidden"
      />
      
      <div className="w-24 h-24 bg-[var(--apple-gray)] rounded-3xl flex items-center justify-center text-[var(--apple-blue)]">
        <Music className="w-10 h-10" />
      </div>

      <div className="text-center">
        <h2 className="text-2xl font-bold tracking-tight mb-2">Drop your audio here</h2>
        <p className="text-[var(--apple-secondary)] font-medium mb-6">
          Support for MP3, WAV, FLAC, and more
        </p>
        
        <button className="px-6 py-3 bg-[var(--apple-blue)] text-white rounded-full font-bold text-sm tracking-tight hover:opacity-90 transition-opacity">
          Choose File
        </button>
      </div>

      <div className="flex items-center gap-2 text-[var(--apple-secondary)] text-xs font-bold uppercase tracking-widest">
        <Upload className="w-3 h-3" />
        DRAG & DROP
      </div>
    </div>
  );
}