import { Music } from 'lucide-react';

export function Header() {
  return (
    <header className="flex items-center justify-center py-6 border-b border-[var(--glass-border)]">
      <div className="flex items-center text-[var(--apple-text)]">
        <div className="w-8 h-8 bg-[var(--apple-text)] text-[var(--apple-bg)] rounded-lg flex items-center justify-center">
          <Music className="w-5 h-5 fill-current" />
        </div>
      </div>
    </header>
  );
}
