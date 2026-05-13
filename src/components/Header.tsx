import { SidebarTrigger } from '@/components/ui/sidebar';
import UserAvatar from './UserAvatar';
import { Sun, Moon } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';

const Header = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6 shadow-sm">
      {/* Left: Sidebar trigger for mobile */}
      <div className="flex items-center">
        <SidebarTrigger className="lg:hidden" />
      </div>

      {/* Center: Title */}
      <div className="text-center flex-1">
        <h1 className="text-xl font-bold text-foreground">Intel Reddit</h1>
        <p className="text-xs text-muted-foreground">Open-Source Intelligence Platform</p>
      </div>

      {/* Right: User Avatar + Theme Toggle */}
      <div className="flex items-center gap-2 -mr-2">
        <UserAvatar />

        <button
          onClick={toggleTheme}
          aria-label="Toggle light/dark mode"
          className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </header>
  );
};

export default Header;
