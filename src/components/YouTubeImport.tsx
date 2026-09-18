import { useState } from 'react';
import { Youtube, Search, ArrowRight, Loader2, Video, Music as MusicIcon, CheckCircle2, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { saveMetadataLocal } from '@/src/lib/localDb';
import { useAuth } from '@/src/hooks/useAuth';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { sanitizeYouTubeInput, getCleanNoAdYouTubeUrl } from '@/src/lib/youtubeUtils';

export function YouTubeImport() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [metadata, setMetadata] = useState<any>(null);
  const [hadTracking, setHadTracking] = useState(false);
  const { user } = useAuth();

  const handleFetchMetadata = async () => {
    const sanitization = sanitizeYouTubeInput(url);
    if (!sanitization.isValid || !sanitization.videoId) {
      toast.error("URL do YouTube inválida ou não reconhecida.");
      return;
    }

    const { videoId, cleanUrl, hadTracking: trackingRemoved } = sanitization;
    setHadTracking(trackingRemoved);

    if (trackingRemoved) {
      toast.success("Rastreadores e parâmetros de anúncios removidos da URL!");
    }

    setLoading(true);
    try {
      // Use oEmbed to get title and author
      const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
      if (!response.ok) throw new Error("Não foi possível obter informações do vídeo.");
      
      const data = await response.json();
      setMetadata({
        id: `yt_${videoId}`,
        title: data.title,
        artist: data.author_name,
        coverUrl: data.thumbnail_url,
        audioUrl: cleanUrl, // Clean https://www.youtube-nocookie.com/embed/${videoId} URL
        source: 'youtube',
        type: 'video',
        videoId: videoId,
        noAds: true
      });
    } catch (err) {
      console.error("Metadata fetch error:", err);
      // Fallback with clean ad-free nocookie URL
      setMetadata({
        id: `yt_${videoId}`,
        title: "Vídeo do YouTube",
        artist: "YouTube",
        coverUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        audioUrl: cleanUrl,
        source: 'youtube',
        type: 'video',
        videoId: videoId,
        noAds: true
      });
      toast.info("Não foi possível obter todos os dados, mas a URL limpa sem anúncios foi gerada.");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!metadata) return;

    try {
      // Ensure audioUrl is clean nocookie URL without ad tokens
      const cleanAudioUrl = getCleanNoAdYouTubeUrl(metadata.audioUrl || metadata.videoId);

      await saveMetadataLocal({
        ...metadata,
        audioUrl: cleanAudioUrl,
        noAds: true,
        uploadedBy: user?.uid || 'local-user',
        createdAt: Date.now()
      });
      
      toast.success("Vídeo sem anúncios adicionado à sua biblioteca!");
      setMetadata(null);
      setUrl('');
      setHadTracking(false);
      window.dispatchEvent(new CustomEvent('songs-updated'));
    } catch (err) {
      console.error("Save error:", err);
      toast.error("Erro ao salvar na biblioteca.");
    }
  };

  return (
    <div className="p-4 md:p-10 max-w-4xl mx-auto space-y-12">
      <header className="text-center md:text-left">
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">Importar do YouTube</h1>
        <p className="text-zinc-500 font-medium">Adicione vídeos do YouTube diretamente na sua coleção.</p>
      </header>

      <div className="bg-white/5 border border-white/5 rounded-3xl p-6 md:p-10 backdrop-blur-xl">
        <div className="flex flex-col md:flex-row gap-4 mb-8">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
              <Youtube className="w-5 h-5 text-red-500" />
            </div>
            <Input 
              placeholder="Cole aqui o link do vídeo (ex: https://youtube.com/watch?v=...)" 
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="bg-black/50 border-white/10 pl-12 h-14 rounded-2xl text-white placeholder:text-zinc-600 focus:ring-red-500/50"
            />
          </div>
          <Button 
            onClick={handleFetchMetadata}
            disabled={loading || !url}
            className="h-14 px-8 rounded-2xl bg-red-600 hover:bg-red-700 text-white font-bold transition-all shadow-lg shadow-red-600/20"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5 mr-2" />}
            Buscar
          </Button>
        </div>

        <AnimatePresence>
          {metadata && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white/5 border border-white/10 rounded-2xl p-6 flex flex-col md:flex-row gap-6 items-center md:items-start"
            >
              <div className="w-48 aspect-video rounded-xl overflow-hidden border border-white/10 shadow-2xl shrink-0">
                <img src={metadata.coverUrl} alt="" className="w-full h-full object-cover" />
              </div>
              <div className="flex-1 space-y-4 text-center md:text-left">
                <div>
                  <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mb-2">
                    <div className="flex items-center space-x-1 px-2.5 py-1 bg-red-500/10 border border-red-500/20 rounded-full">
                      <Video className="w-3 h-3 text-red-500" />
                      <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">YouTube</span>
                    </div>
                    <div className="flex items-center space-x-1 px-2.5 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full">
                      <ShieldCheck className="w-3 h-3 text-emerald-400" />
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Sem Anúncios / No-Cookie</span>
                    </div>
                  </div>
                  <h3 className="text-xl font-bold text-white leading-tight">{metadata.title}</h3>
                  <p className="text-zinc-500">{metadata.artist}</p>
                  {hadTracking && (
                    <p className="text-xs text-emerald-400/90 font-medium flex items-center justify-center md:justify-start gap-1 pt-1">
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Rastreadores de anúncios e tokens de perfil foram removidos.
                    </p>
                  )}
                </div>
                <div className="flex items-center justify-center md:justify-start space-x-3 pt-2">
                  <Button 
                    onClick={handleSave}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold h-11 px-8 rounded-xl"
                  >
                    Salvar na Biblioteca
                  </Button>
                  <Button 
                    variant="ghost"
                    onClick={() => setMetadata(null)}
                    className="text-zinc-500 hover:text-white"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Empty state instruction */}
        {!metadata && !loading && (
          <div className="py-12 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 opacity-50">
            <Youtube className="w-12 h-12 text-zinc-700" />
            <p className="text-sm text-zinc-500 max-w-xs">Insira um link válido do YouTube acima para ver os detalhes e adicionar à sua conta.</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="p-8 bg-zinc-900/50 rounded-3xl border border-white/5 space-y-4">
          <div className="w-10 h-10 bg-red-600/10 rounded-xl flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-500" />
          </div>
          <h4 className="text-lg font-bold text-white">URLs sem Anúncios</h4>
          <p className="text-sm text-zinc-500 leading-relaxed">
            As URLs importadas são automaticamente convertidas para o modo sem anúncios (<code className="text-zinc-400 bg-white/5 px-1 py-0.5 rounded text-xs">youtube-nocookie.com/embed</code>), eliminando cookies de rastreamento, banners e tokens promocionais.
          </p>
        </div>
        <div className="p-8 bg-zinc-900/50 rounded-3xl border border-white/5 space-y-4">
          <div className="w-10 h-10 bg-blue-600/10 rounded-xl flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-blue-500" />
          </div>
          <h4 className="text-lg font-bold text-white">Mix Perfeito</h4>
          <p className="text-sm text-zinc-500 leading-relaxed">
            Seus vídeos do YouTube aparecerão junto com seus arquivos locais na biblioteca, criando uma experiência unificada.
          </p>
        </div>
      </div>
    </div>
  );
}
