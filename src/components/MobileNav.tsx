import { Home, Library, PlusSquare, Heart, User } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface MobileNavProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export function MobileNav({ activeTab, setActiveTab }: MobileNavProps) {
  const navItems = [
    { id: 'home', icon: Home, label: 'Início' },
    { id: 'library', icon: Library, label: 'Biblioteca' },
    { id: 'upload', icon: PlusSquare, label: 'Upload' },
    { id: 'liked', icon: Heart, label: 'Curtidas' },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur-2xl border-t border-white/5 px-4 pb-8 pt-3 z-50 flex items-center justify-around">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => setActiveTab(item.id)}
          className="flex flex-col items-center space-y-1"
        >
          <item.icon className={cn(
            "w-6 h-6 transition-colors",
            activeTab === item.id ? "text-blue-500" : "text-zinc-500"
          )} />
          <span className={cn(
            "text-[10px] font-medium transition-colors",
            activeTab === item.id ? "text-white" : "text-zinc-500"
          )}>
            {item.label}
          </span>
        </button>
      ))}
    </nav>
  );
}
