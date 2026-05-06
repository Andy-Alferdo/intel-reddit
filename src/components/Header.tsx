import { SidebarTrigger } from '@/components/ui/sidebar';
import UserAvatar from './UserAvatar';

const Header = () => {
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
      
      {/* Right: User Avatar */}
      <div className="flex items-center">
        <UserAvatar />
      </div>
    </header>
  );
};

export default Header;