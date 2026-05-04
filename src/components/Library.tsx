import { useState, useEffect, useRef } from 'react';
import { Play, MoreHorizontal, Clock, Music2, ListMusic, Trash2, AlertCircle, CheckCircle2, Video, Music as MusicIcon, Search, Image as ImageIcon, Filter, X, Upload as UploadIcon } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, deleteDoc, doc } from 'firebase/firestore';
import { deleteAudioLocal, deleteMediaLocal, existsAudioLocal, getAllMetadataLocal, saveMetadataLocal, getAllStorageKeys, saveMediaLocal } from '@/src/lib/localDb';
import { useAuth } from '@/src/hooks/useAuth';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { LocalImage } from './LocalImage';

interface Song {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  audioUrl: string;
  album?: string;
  uploadedBy: string;
  type?: 'audio' | 'video';
  createdAt?: number;
}

export function Library({ onPlay, currentSong }: { onPlay: (song: any) => void, currentSong?: any }) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [missingFiles, setMissingFiles] = useState<Record<string, boolean>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingSongId, setEditingSongId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { user } = useAuth();

  const loadSongs = async () => {
    try {
      const [localSongs, storageKeys] = await Promise.all([
        getAllMetadataLocal(),
        getAllStorageKeys()
      ]);
      
      const keySet = new Set(storageKeys);
      const sorted = localSongs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      
      // Check which local songs are actually in the browser storage
      const missingMap: Record<string, boolean> = {};
      for (const song of sorted) {
        if (song.audioUrl?.startsWith('local://')) {
          const localId = song.audioUrl.replace('local://', '');
          if (!keySet.has(localId)) missingMap[song.id] = true;
        }
      }
      
      setSongs(sorted);
      setMissingFiles(missingMap);
    } catch (err) {
      console.error("Error loading library:", err);
    }
  };

  const filteredSongs = songs.filter(song => 
    song.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    song.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
    song.album?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Group songs by folder/album
  const groupedSongs = filteredSongs.reduce((acc, song) => {
    const key = song.id.startsWith('local_') ? (song.album || 'Arquivos Soltos') : 'Geral';
    if (!acc[key]) acc[key] = [];
    acc[key].push(song);
    return acc;
  }, {} as Record<string, Song[]>);

  const handleSearchCover = async (song: Song) => {
    try {
      toast.info(`Buscando capa para "${song.title}"...`);
      
      // Better cleaning logic for filenames (stripping [HQ], (Official), etc.)
      const cleanTitle = song.title
        .replace(/\[.*?\]/g, '')
        .replace(/\(.*?\)/g, '')
        .replace(/official (video|audio|music|lyric)/gi, '')
        .replace(/hd|hq|4k|high quality/gi, '')
        .replace(/\d{4}/g, '')
        .trim();

      // If title contains " - ", it's likely "Artist - Song"
      let searchTerms = cleanTitle;
      if (song.artist === 'Arquivo Local' && cleanTitle.includes(' - ')) {
        searchTerms = cleanTitle;
      } else if (song.artist !== 'Arquivo Local') {
        searchTerms = `${song.artist} ${cleanTitle}`;
      }

      const response = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(searchTerms)}&limit=1&media=music`);
      const data = await response.json();
      
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const newCoverUrl = result.artworkUrl100.replace('100x100bb', '800x800bb');
        
        const updatedSong = {
          ...song,
          coverUrl: newCoverUrl,
          artist: song.artist === 'Arquivo Local' ? result.artistName : song.artist,
          album: (!song.album || song.album === 'Local') ? result.collectionName : song.album
        };
        
        await saveMetadataLocal(updatedSong);
        toast.success("Capa e informações atualizadas!");
        loadSongs();
      } else {
        // Fallback: try one more time stripping everything except the last part of " - " if it exists
        if (cleanTitle.includes(' - ')) {
          const parts = cleanTitle.split(' - ');
          const songOnly = parts[parts.length - 1].trim();
          const fallbackRes = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(songOnly)}&limit=1&media=music`);
          const fallbackData = await fallbackRes.json();
          
          if (fallbackData.results && fallbackData.results.length > 0) {
            const result = fallbackData.results[0];
            const newCoverUrl = result.artworkUrl100.replace('100x100bb', '800x800bb');
            const updatedSong = { ...song, coverUrl: newCoverUrl };
            await saveMetadataLocal(updatedSong);
            toast.success("Capa encontrada via busca simplificada!");
            loadSongs();
            return;
          }
        }
        toast.error("Nenhuma capa encontrada. Tente usar a opção de carregar imagem personalizada.");
      }
    } catch (err) {
      console.error("Search cover error:", err);
      toast.error("Erro ao buscar capa.");
    }
  };

  const handleUploadCover = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !editingSongId) return;

    if (!file.type.startsWith('image/')) {
      toast.error("Por favor, selecione um arquivo de imagem.");
      return;
    }

    try {
      const song = songs.find(s => s.id === editingSongId);
      if (!song) return;

      const imageId = `cover_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      await saveMediaLocal(imageId, file);

      const updatedSong = {
        ...song,
        coverUrl: `local://${imageId}`
      };

      await saveMetadataLocal(updatedSong);
      toast.success("Capa personalizada salva!");
      setEditingSongId(null);
      loadSongs();
    } catch (err) {
      console.error("Upload cover error:", err);
      toast.error("Erro ao salvar capa.");
    } finally {
      if (event.target) event.target.value = '';
    }
  };

  const handleDelete = async (song: Song) => {
    try {
      if (song.audioUrl && song.audioUrl.startsWith('local://')) {
        const localId = song.audioUrl.replace('local://', '');
        await deleteMediaLocal(localId);
      }
      
      toast.success("Música removida com sucesso.");
      setDeletingId(null);
      // Trigger update event
      window.dispatchEvent(new CustomEvent('songs-updated'));
    } catch (error: any) {
      console.error("Erro ao deletar:", error);
      toast.error(`Erro ao excluir: ${error.message || 'Erro desconhecido'}`);
      setDeletingId(null);
    }
  };

  useEffect(() => {
    if (!user) return;
    loadSongs();
    
    window.addEventListener('songs-updated', loadSongs);
    return () => window.removeEventListener('songs-updated', loadSongs);
  }, [user]);

  return (
    <div className="relative p-0 md:p-0 min-h-full">
      {/* Dynamic Background */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute inset-x-0 top-0 h-[600px] opacity-40">
          <LocalImage 
            src={currentSong?.coverUrl || songs[0]?.coverUrl} 
            className="w-full h-full object-cover blur-[100px] scale-150"
            fallback={<div className="w-full h-full bg-blue-900/10" />}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0a0a0a]/80 to-[#0a0a0a]" />
        </div>
      </div>

      <div className="relative z-10 p-4 md:p-10">
        <header className="flex flex-col md:flex-row items-center md:items-end space-y-6 md:space-y-0 md:space-x-8 mb-12">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-48 h-48 md:w-64 md:h-64 rounded-2xl md:rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center justify-center relative group overflow-hidden border border-white/10 ring-1 ring-white/10"
          >
            <LocalImage 
              src={currentSong?.coverUrl || songs[0]?.coverUrl} 
              className="w-full h-full object-cover shadow-2xl transition-transform duration-700 group-hover:scale-105"
              fallback={
                <div className="w-full h-full bg-gradient-to-br from-zinc-800 to-zinc-950 flex items-center justify-center">
                  <Music2 className="w-24 h-24 text-white/10" />
                </div>
              }
            />
            <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
          </motion.div>
          
          <div className="flex-1 pb-2 text-center md:text-left">
            <div className="flex items-center justify-center md:justify-start space-x-2 mb-4">
              <div className="px-2 py-1 bg-blue-500/10 border border-blue-500/20 rounded text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                Sua Biblioteca
              </div>
            </div>
            <h1 className="text-5xl md:text-8xl font-black text-white tracking-tighter mb-6 leading-[0.9]">Músicas</h1>
            <div className="flex items-center justify-center md:justify-start space-x-3 text-sm font-medium">
              <img src={user?.photoURL || undefined} alt="" className="w-6 h-6 rounded-full border border-white/10 shadow-lg" />
              <span className="text-white hover:underline cursor-pointer">{user?.displayName}</span>
              <span className="text-zinc-500">•</span>
              <span className="text-zinc-400">{songs.length} músicas salvas</span>
            </div>
          </div>
        </header>

        <div className="mb-8 relative group max-w-md">
        <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
          <Search className="w-5 h-5 text-zinc-500 group-focus-within:text-blue-400 transition-colors" />
        </div>
        <input 
          type="text"
          placeholder="Buscar na sua biblioteca..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full bg-white/5 border border-white/5 rounded-2xl py-3 pl-12 pr-4 text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-white/10 transition-all"
        />
        {searchQuery && (
          <button 
            onClick={() => setSearchQuery('')}
            className="absolute inset-y-0 right-4 flex items-center text-zinc-500 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Hidden File Input for Custom Covers */}
      <input 
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleUploadCover}
      />

      <div className="bg-white/5 backdrop-blur-md rounded-2xl md:rounded-3xl border border-white/5 overflow-hidden">
        <div className="hidden md:grid grid-cols-[48px_1fr_1fr_120px] gap-4 px-8 py-4 text-zinc-500 text-[10px] font-bold uppercase tracking-widest border-b border-white/5">
          <span className="text-center">#</span>
          <span>Título</span>
          <span>Álbum</span>
          <div className="flex items-center justify-end pr-4">
            <Clock className="w-3 h-3" />
          </div>
        </div>

        <div className="py-2">
          {filteredSongs.length > 0 ? (
            Object.entries(groupedSongs).map(([groupName, groupSongs], groupIndex) => (
              <div key={groupName} className={groupIndex > 0 ? "mt-8" : ""}>
                <div className="px-8 py-3 bg-white/5 border-y border-white/5 flex items-center space-x-3">
                  <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    {groupName === 'Arquivos Soltos' ? <Music2 className="w-4 h-4 text-zinc-500" /> : <ListMusic className="w-4 h-4 text-blue-500" />}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">{groupName === 'Arquivos Soltos' ? 'Individual' : 'Album / Pasta'}</span>
                    <h3 className="text-sm font-bold text-white">{groupName}</h3>
                  </div>
                  <span className="text-zinc-500 text-[10px] ml-auto">{groupSongs.length} itens</span>
                </div>

                {groupSongs.map((song, index) => (
                  <motion.div 
                    key={song.id} 
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.5) }} // Cap delay for large lists
                    className="grid grid-cols-[40px_1fr_auto] md:grid-cols-[48px_1fr_1fr_160px] gap-2 md:gap-4 px-3 md:px-8 py-3 hover:bg-white/5 group transition-all items-center cursor-pointer"
                    onClick={() => onPlay(song)}
                  >
                    <div className="flex items-center justify-center">
                      <span className="text-zinc-500 text-xs font-medium group-hover:hidden tabular-nums">{index + 1}</span>
                      <Play className="w-3 h-3 text-blue-500 fill-current hidden group-hover:block" />
                    </div>
                    
                    <div className="flex items-center space-x-3 md:space-x-4 min-w-0">
                      <div className="relative group/cover flex-shrink-0">
                        <LocalImage 
                          src={song.coverUrl || undefined} 
                          className="w-10 h-10 rounded-lg shadow-lg object-cover border border-white/5 flex-shrink-0"
                          fallback={
                            <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center">
                              <MusicIcon className="w-4 h-4 text-zinc-600" />
                            </div>
                          }
                        />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover/cover:opacity-100 transition-opacity rounded-lg">
                          {song.type === 'video' ? <Video className="w-4 h-4 text-white" /> : <MusicIcon className="w-4 h-4 text-white" />}
                        </div>
                      </div>
                      <div className="flex flex-col truncate">
                        <div className="flex items-center space-x-2">
                          {song.type === 'video' ? (
                            <Video className="w-3 h-3 text-blue-400 flex-shrink-0" />
                          ) : (
                            <MusicIcon className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                          )}
                          <span className="text-white text-sm font-bold truncate group-hover:text-blue-400 transition-colors">
                            {song.title}
                          </span>
                          {missingFiles[song.id] && (
                            <AlertCircle className="w-3 h-3 text-red-500" />
                          )}
                        </div>
                        <span className="text-zinc-500 text-[11px] md:text-xs truncate">{song.artist}</span>
                      </div>
                    </div>

                    <span className="hidden md:block text-zinc-500 text-xs font-medium truncate">{song.album || 'Single'}</span>
                    
                    <div className="flex items-center justify-end pr-1 md:pr-4 min-w-[48px]" onClick={(e) => e.stopPropagation()}>
                      <div className="hidden md:flex items-center space-x-1 mr-4">
                        {missingFiles[song.id] ? (
                          <>
                            <span className="text-red-500 text-[10px] font-bold uppercase tracking-tighter">Não Encontrado</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3 text-green-500" />
                            <span className="text-zinc-500 text-xs font-medium tabular-nums">Offline</span>
                          </>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-center space-x-2">
                        {!missingFiles[song.id] && song.type !== 'video' && (
                          <div className="flex items-center space-x-1">
                            <button 
                              onClick={() => handleSearchCover(song)}
                              className="text-zinc-500 hover:text-blue-400 p-3 hover:bg-blue-500/10 rounded-full transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 active:scale-95"
                              title="Buscar capa original na internet"
                            >
                              <Search className="w-5 h-5 md:w-3.5 md:h-3.5" />
                            </button>
                            <button 
                              onClick={() => {
                                setEditingSongId(song.id);
                                fileInputRef.current?.click();
                              }}
                              className="text-zinc-500 hover:text-green-400 p-3 hover:bg-green-500/10 rounded-full transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 active:scale-95"
                              title="Inserir imagem do seu computador"
                            >
                              <UploadIcon className="w-5 h-5 md:w-3.5 md:h-3.5" />
                            </button>
                          </div>
                        )}

                        {deletingId === song.id ? (
                          <div className="flex items-center bg-red-500/20 border border-red-500/20 rounded-full px-3 py-1.5 space-x-3 animate-in fade-in slide-in-from-right-2 duration-200">
                            <button 
                              onClick={() => handleDelete(song)}
                              className="text-[11px] font-bold text-red-500 hover:text-red-400 uppercase tracking-tighter"
                            >
                              Excluir
                            </button>
                            <button 
                              onClick={() => setDeletingId(null)}
                              className="text-[11px] font-bold text-zinc-400 hover:text-zinc-200 uppercase px-1 border-l border-white/10"
                            >
                              Sair
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => setDeletingId(song.id)}
                            className="text-zinc-500 hover:text-red-500 p-3 hover:bg-red-500/10 rounded-full transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100 active:scale-95"
                            aria-label="Excluir música"
                          >
                            <Trash2 className="w-5 h-5 md:w-4 md:h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            ))
        ) : songs.length > 0 ? (
          <div className="py-20 text-center space-y-4">
            <Search className="w-10 h-10 text-zinc-700 mx-auto" />
            <div className="space-y-1">
              <p className="text-zinc-400 font-medium">Nenhum resultado para "{searchQuery}"</p>
              <p className="text-xs text-zinc-600">Tente buscar por outro título ou artista.</p>
            </div>
          </div>
        ) : null}
        </div>

        {songs.length === 0 && (
          <div className="py-32 text-center space-y-6">
            <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto border border-white/5">
              <ListMusic className="w-10 h-10 text-zinc-700" />
            </div>
            <div className="space-y-2">
              <p className="text-xl font-bold text-white">Sua biblioteca está vazia</p>
              <p className="text-sm text-zinc-500 max-w-xs mx-auto">
                Faça upload das suas músicas ou vídeos favoritos para começar a criar sua coleção pessoal.
              </p>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
