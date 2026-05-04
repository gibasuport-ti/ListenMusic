import { Play, Clock, Sparkles, Music, Video, Music as MusicIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/src/lib/utils';
import { LocalImage } from './LocalImage';

export function Home({ songs, onPlay }: { songs: any[], onPlay: (song: any) => void }) {
  return (
    <div className="p-4 md:p-10 space-y-12">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 md:gap-0">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2 text-center md:text-left">Bem-vindo de volta</h1>
          <p className="text-zinc-500 font-medium text-center md:text-left">Sua biblioteca pessoal em destaque.</p>
        </div>
        <div className="flex items-center justify-center md:justify-start space-x-2 text-zinc-400 bg-white/5 px-4 py-2 rounded-full border border-white/5 mx-auto md:mx-0 w-fit">
          <Clock className="w-4 h-4" />
          <span className="text-xs font-semibold">Sua Coleção</span>
        </div>
      </header>
      
      <section>
        <div className="flex items-center space-x-3 mb-8">
          <div className="w-8 h-8 bg-blue-600/20 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-blue-500" />
          </div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Sua Biblioteca</h2>
        </div>

        {songs.length === 0 ? (
          <div className="py-20 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-white/5 rounded-full flex items-center justify-center mb-4 mx-auto border border-white/5">
              <MusicIcon className="w-8 h-8 md:w-10 md:h-10 text-zinc-700" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Nenhum item encontrado</h3>
            <p className="text-zinc-500 max-w-xs mx-auto text-sm">
              Sua biblioteca está vazia. Vá para a aba de Upload para adicionar suas músicas e vídeos.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 md:gap-8">
            {songs.map((item, i) => (
              <motion.div 
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                className="group cursor-pointer"
              >
                <div className="relative aspect-square mb-4 overflow-hidden rounded-2xl shadow-2xl border border-white/5 bg-zinc-900">
                  <LocalImage 
                    src={item.coverUrl} 
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    fallback={
                      <div className="w-full h-full flex items-center justify-center bg-zinc-800">
                        <MusicIcon className="w-8 h-8 text-zinc-600" />
                      </div>
                    }
                  />
                  
                  {/* Media Type Badge */}
                  <div className="absolute top-2 left-2 px-2 py-1 bg-black/60 backdrop-blur-md rounded-md border border-white/10 flex items-center space-x-1">
                    {item.type === 'video' ? (
                      <Video className="w-3 h-3 text-blue-400" />
                    ) : (
                      <MusicIcon className="w-3 h-3 text-zinc-400" />
                    )}
                  </div>

                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        onPlay(item);
                      }}
                      className="w-12 h-12 md:w-14 md:h-14 bg-blue-600 rounded-full flex items-center justify-center shadow-2xl scale-90 group-hover:scale-100 transition-all duration-300 transform active:scale-95"
                    >
                      <Play className="w-6 h-6 md:w-7 md:h-7 text-white fill-current ml-1" />
                    </button>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <h3 
                    onClick={() => onPlay(item)}
                    className="font-bold text-white text-sm md:text-base truncate group-hover:text-blue-400 transition-colors"
                  >
                    {item.title}
                  </h3>
                  <p className="text-[10px] md:text-xs font-medium text-zinc-500 truncate uppercase tracking-wider">
                    {item.artist || 'Local'}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
