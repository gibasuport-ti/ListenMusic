import { Home, Library, PlusSquare, Heart, LogOut, Music, Crown } from 'lucide-react';
import { useAuth } from '@/src/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { cn } from '@/src/lib/utils';
import { useState } from 'react';
import { PremiumModal } from './PremiumModal';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  className?: string;
}

export function Sidebar({ activeTab, setActiveTab, className }: SidebarProps) {
  const { logout, user, isPremium } = useAuth();
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);

  const navItems = [
    { id: 'home', icon: Home, label: 'Início' },
    { id: 'library', icon: Library, label: 'Biblioteca' },
    { id: 'upload', icon: PlusSquare, label: 'Upload' },
    { id: 'liked', icon: Heart, label: 'Curtidas' },
  ];

  return (
    <aside className={cn("w-64 bg-black/40 backdrop-blur-xl border-r border-white/5 flex flex-col h-full", className)}>
      <div className="p-6">
        <div className="flex items-center space-x-3 mb-10 px-2">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-600/20">
            <Music className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-xl tracking-tight text-white">ListenMusic</span>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={cn(
                "w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group",
                activeTab === item.id 
                  ? "bg-white/10 text-white shadow-sm" 
                  : "text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
              )}
            >
              <item.icon className={cn(
                "w-5 h-5 transition-colors",
                activeTab === item.id ? "text-blue-500" : "text-zinc-400 group-hover:text-zinc-100"
              )} />
              <span className="font-medium">{item.label}</span>
              {activeTab === item.id && (
                <div className="ml-auto w-1 h-4 bg-blue-500 rounded-full" />
              )}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-auto p-6 space-y-4">
        {!isPremium && (
          <div className="p-4 bg-gradient-to-br from-yellow-500/10 to-orange-500/10 border border-yellow-500/20 rounded-2xl mb-4">
            <div className="flex items-center space-x-2 mb-2">
              <Crown className="w-4 h-4 text-yellow-500" />
              <span className="text-[10px] font-black text-yellow-500 uppercase tracking-widest">Acesso Total</span>
            </div>
            <p className="text-[10px] text-zinc-400 mb-3 leading-tight">Libere upload ilimitado e muito mais por apenas R$ 10,00.</p>
            <Button 
              onClick={() => setIsPremiumModalOpen(true)}
              size="sm" 
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black text-[10px] font-bold h-8 rounded-lg"
            >
              Quero Acesso Total
            </Button>
          </div>
        )}

        <div className="px-2">
          <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-4 text-center">Sua Conta</h3>
          <div className="flex items-center space-x-3 p-2 rounded-xl bg-white/5 border border-white/5">
            <img 
              src={user?.photoURL || undefined} 
              alt="" 
              className="w-8 h-8 rounded-lg object-cover border border-white/10"
            />
            <div className="flex flex-col truncate">
              <span className="text-xs font-semibold text-white truncate">{user?.displayName}</span>
              <span className={cn(
                "text-[10px] truncate font-bold",
                isPremium ? "text-yellow-500" : "text-zinc-500"
              )}>
                {isPremium ? '💎 Premium User' : 'Standard Plan'}
              </span>
            </div>
          </div>
        </div>

        <button 
          onClick={logout}
          className="w-full flex items-center space-x-3 px-4 py-3 text-zinc-400 hover:text-red-400 hover:bg-red-400/5 rounded-lg transition-all group"
        >
          <LogOut className="w-5 h-5" />
          <span className="font-medium">Sair</span>
        </button>
      </div>

      <PremiumModal isOpen={isPremiumModalOpen} onClose={() => setIsPremiumModalOpen(false)} />
    </aside>
  );
}
