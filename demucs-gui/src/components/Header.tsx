import { Music } from 'lucide-react';

export function Header() {
  return (
    <header className="flex items-center justify-between py-6 border-b border-[var(--glass-border)]">
      <div className="flex items-center gap-2 text-[var(--apple-text)]">
        <div className="w-8 h-8 bg-[var(--apple-text)] text-[var(--apple-bg)] rounded-lg flex items-center justify-center">
          <Music className="w-5 h-5 fill-current" />
        </div>
        <span className="text-xl font-bold tracking-tight">Stemify</span>
      </div>
      
      <nav className="hidden md:flex items-center gap-8 text-[var(--apple-secondary)]">
        <a href="#" className="text-sm font-semibold hover:text-[var(--apple-text)] transition-colors">Documentation</a>
        <a href="#" className="text-sm font-semibold hover:text-[var(--apple-text)] transition-colors transition-colors">Github</a>
      </nav>
    </header>
  );
}