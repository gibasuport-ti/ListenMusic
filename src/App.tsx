import { useState, useEffect } from 'react';
import { useAuth } from '@/src/hooks/useAuth';
import { Auth } from '@/src/components/Auth';
import { Sidebar } from '@/src/components/Sidebar';
import { Player } from '@/src/components/Player';
import { Home } from '@/src/components/Home';
import { Library } from '@/src/components/Library';
import { DJMixer } from '@/src/components/DJMixer';
import { Upload } from '@/src/components/Upload';
import { YouTubeImport } from '@/src/components/YouTubeImport';
import { MobileNav } from '@/src/components/MobileNav';
import { ErrorBoundary } from '@/src/components/ErrorBoundary';
import { Toaster } from '@/components/ui/sonner';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { getAllMetadataLocal } from '@/src/lib/localDb';

export default function App() {
  const { user, loading } = useAuth();
  const [activeTab, setActiveTab] = useState('home');
  const [currentSong, setCurrentSong] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [songs, setSongs] = useState<any[]>([]);

  // Function to refresh local songs
  const refreshSongs = async () => {
    try {
      const localSongs = await getAllMetadataLocal();
      // Sort by creation date descending
      const sorted = localSongs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setSongs(sorted);
    } catch (err) {
      console.error("Error loading local songs:", err);
    }
  };

  useEffect(() => {
    if (!user) return;
    refreshSongs();
    
    // Listen for custom events when new songs are added
    window.addEventListener('songs-updated', refreshSongs);
    return () => window.removeEventListener('songs-updated', refreshSongs);
  }, [user]);

  const handlePlay = (song: any) => {
    setCurrentSong(song);
    setIsPlaying(true);
  };

  const handleNext = () => {
    if (!currentSong || songs.length === 0) return;
    const currentIndex = songs.findIndex(s => s.id === currentSong.id);
    const nextIndex = (currentIndex + 1) % songs.length;
    setCurrentSong(songs[nextIndex]);
    setIsPlaying(true);
  };

  const handlePrevious = () => {
    if (!currentSong || songs.length === 0) return;
    const currentIndex = songs.findIndex(s => s.id === currentSong.id);
    const prevIndex = (currentIndex - 1 + songs.length) % songs.length;
    setCurrentSong(songs[prevIndex]);
    setIsPlaying(true);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    if (tab === 'mixer' && isPlaying) {
      setIsPlaying(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0a0a0a] text-white">
        <Loader2 className="w-10 h-10 animate-spin text-blue-500" />
      </div>
    );
  }

  if (!user) {
    return (
      <ErrorBoundary>
        <Auth />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen bg-[#0a0a0a] text-zinc-100 overflow-hidden font-sans selection:bg-blue-500/30">
        {/* Background Atmosphere */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full" />
        </div>

        <div id="main-content-layout" className="flex flex-1 overflow-hidden z-10 relative flex-col md:flex-row">
          <Sidebar id="main-sidebar" activeTab={activeTab} setActiveTab={handleTabChange} className="hidden md:flex" />
          
          <main id="main-content-area" className="flex-1 overflow-hidden relative">
            <ScrollArea id="main-scroll-area" className="h-full">
              <div id="content-container" className="max-w-[1600px] mx-auto pb-48 md:pb-32">
                {activeTab === 'home' && <Home songs={songs} onPlay={handlePlay} />}
                {activeTab === 'library' && <Library onPlay={handlePlay} currentSong={currentSong} />}
                {activeTab === 'mixer' && <DJMixer />}
                {activeTab === 'youtube' && <YouTubeImport />}
                {activeTab === 'upload' && <Upload />}
                {activeTab === 'liked' && (
                  <div className="p-12 text-center">
                    <div className="w-20 h-20 bg-zinc-900/50 rounded-full flex items-center justify-center mx-auto mb-6 border border-zinc-800">
                      <Loader2 className="w-8 h-8 text-zinc-600" />
                    </div>
                    <h2 className="text-2xl font-semibold text-white mb-2">Músicas Curtidas</h2>
                    <p className="text-zinc-500">Esta funcionalidade estará disponível em breve.</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </main>
        </div>

        <div id="player-controls-container" className="z-20">
          <Player 
            id="audio-player"
            currentSong={currentSong} 
            isPlaying={isPlaying} 
            setIsPlaying={setIsPlaying}
            onNext={handleNext}
            onPrevious={handlePrevious}
          />
          <MobileNav id="mobile-navigation" activeTab={activeTab} setActiveTab={handleTabChange} />
        </div>
        
        <Toaster theme="dark" position="top-center" />
      </div>
    </ErrorBoundary>
  );
}
