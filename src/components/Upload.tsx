import { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload as UploadIcon, Music, X, Loader2, FileAudio, CheckCircle2, HardDrive, Crown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { saveAudioLocal, saveMetadataLocal } from '@/src/lib/localDb';
import { useAuth } from '@/src/hooks/useAuth';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { PremiumModal } from './PremiumModal';

export function Upload() {
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [currentFileIndex, setCurrentFileIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<string>("");
  const { user, isPremium } = useAuth();
  const [isPremiumModalOpen, setIsPremiumModalOpen] = useState(false);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    let filesToSelect = acceptedFiles.filter(f => f.size <= 500 * 1024 * 1024);
    
    if (!isPremium && filesToSelect.length > 1) {
      toast.info("Apenas o primeiro arquivo foi selecionado. Adquira o Acesso Total para importar vários arquivos de uma vez.");
      filesToSelect = [filesToSelect[0]];
    }
    
    setFiles(prev => isPremium ? [...prev, ...filesToSelect] : filesToSelect);
  }, [isPremium]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    noClick: false, 
    accept: { 
      'audio/*': ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.wma'],
      'video/*': ['.mp4', '.mkv', '.avi', '.webm', '.mov', '.wmv']
    },
    multiple: isPremium
  });

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error("Selecione os arquivos do seu notebook primeiro.");
      return;
    }

    setUploading(true);
    let successCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relativePath = (file as any).webkitRelativePath || (file as any).path || "";
      const pathParts = relativePath.split('/');
      const folderName = pathParts.length > 1 ? pathParts[0] : null;

      setCurrentFileIndex(i);
      setProgress(5); // Initial jump
      
      try {
        const localId = `local_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        const isVideo = file.type.startsWith('video/') || 
                         ['mp4', 'mkv', 'avi', 'webm', 'mov'].some(ext => file.name.toLowerCase().endsWith(ext));
        
        // Step 1: IndexedDB - Save File
        setUploadStatus(`Salvando ${file.name}...`);
        try {
          // Explicitly convert to Blob for maximum IndexedDB compatibility
          const blob = new Blob([file], { type: file.type || 'application/octet-stream' });
          await saveAudioLocal(localId, blob);
        } catch (dbError: any) {
          console.error("IndexedDB Error:", dbError);
          const isQuota = dbError?.message?.includes('Quota') || dbError?.name === 'QuotaExceededError';
          toast.error(isQuota ? `Espaço insuficiente no navegador!` : `Erro ao salvar ${file.name}.`);
          continue; 
        }
        
        setProgress(60);

        // Step 2: Metadata processing
        setUploadStatus("Processando metadados...");
        const fileNameNoExt = file.name.replace(/\.[^/.]+$/, "");
        
        let coverUrl = `https://picsum.photos/seed/${localId}/400/400`;
        let artist = 'Arquivo Local';
        let cleanTitle = fileNameNoExt;
        let album = folderName || 'Single';

        if (!isVideo) {
          try {
            const searchQuery = fileNameNoExt
              .replace(/\[.*?\]/g, '')
              .replace(/\(.*?\)/g, '')
              .replace(/official (video|audio|music|lyric)/gi, '')
              .replace(/hd|hq|4k|high quality/gi, '')
              .replace(/\d{4}/g, '')
              .trim();
            
            // Add a timeout to fetch to prevent hanging the whole upload
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3000);
            
            let response = await fetch(
              `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&limit=1&media=music`,
              { signal: controller.signal }
            );
            
            let data = await response.json();
            
            // Fallback for "Artist - Song" formats
            if ((!data.results || data.results.length === 0) && searchQuery.includes(' - ')) {
              const parts = searchQuery.split(' - ');
              const songOnly = parts[parts.length - 1].trim();
              const fallbackRes = await fetch(
                `https://itunes.apple.com/search?term=${encodeURIComponent(songOnly)}&limit=1&media=music`,
                { signal: controller.signal }
              );
              const fallbackData = await fallbackRes.json();
              if (fallbackData.results && fallbackData.results.length > 0) {
                data = fallbackData;
              }
            }

            clearTimeout(timeoutId);
            
            if (data.results && data.results.length > 0) {
              const result = data.results[0];
              coverUrl = result.artworkUrl100.replace('100x100bb', '800x800bb');
              artist = result.artistName;
              cleanTitle = result.trackName;
              if (!folderName) {
                album = result.collectionName;
              }
              setUploadStatus("Capa encontrada!");
            }
          } catch (err) {
            console.warn("iTunes Metadata failure (skipping):", err);
          }
        }

        setProgress(90);

        try {
          await saveMetadataLocal({
            id: localId,
            title: cleanTitle,
            artist: artist,
            album: album,
            audioUrl: `local://${localId}`,
            source: 'local',
            uploadedBy: user?.uid || 'local-user',
            createdAt: Date.now(),
            coverUrl: coverUrl,
            type: isVideo ? 'video' : 'audio',
            mimeType: file.type || 'application/octet-stream',
            folderPath: relativePath
          });
        } catch (dbError) {
          console.error("Metadata Save Error:", dbError);
          toast.error(`Erro ao registrar informações de ${file.name}`);
          continue;
        }

        setProgress(100);
        successCount++;
        // Small delay for visual feedback
        await new Promise(r => setTimeout(r, 100));
      } catch (error: any) {
        console.error(`Geral Upload Error for ${file.name}:`, error);
        toast.error(`Falha crítica em ${file.name}`);
      }
    }

    if (successCount > 0) {
      toast.success(`${successCount} arquivo(s) prontos na biblioteca!`);
      window.dispatchEvent(new CustomEvent('songs-updated'));
    }
    
    setFiles([]);
    setUploading(false);
    setProgress(0);
    setCurrentFileIndex(0);
    setUploadStatus("");
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  return (
    <div className="p-4 md:p-10 max-w-4xl mx-auto">
      <header className="mb-8 md:mb-12 text-center md:text-left relative">
        <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight mb-2">Biblioteca Local</h1>
        <p className="text-sm md:text-base text-zinc-500 font-medium leading-relaxed">
          Os arquivos são salvos diretamente no seu navegador, sem necessidade de internet para tocar.
        </p>

        {!isPremium && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 p-4 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/20 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-4"
          >
            <div className="flex items-center space-x-3">
              <Crown className="w-6 h-6 text-yellow-500" />
              <div className="text-left">
                <div className="text-sm font-black text-white uppercase tracking-tight">Obtenha Acesso Total</div>
                <div className="text-xs text-zinc-400">Importe pastas inteiras e vários arquivos de uma só vez (R$ 10,00)</div>
              </div>
            </div>
            <Button 
              size="sm"
              onClick={() => setIsPremiumModalOpen(true)}
              className="bg-yellow-500 hover:bg-yellow-600 text-black font-bold h-9 px-6 rounded-xl"
            >
              Liberar Agora
            </Button>
          </motion.div>
        )}
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-10">
        <div className="space-y-6">
          <AnimatePresence mode="wait">
            {files.length === 0 ? (
              <motion.div 
                key="dropzone"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-full"
              >
                <div 
                  {...getRootProps()} 
                  className={`border-2 border-dashed rounded-3xl p-8 md:p-12 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 min-h-[300px] md:min-h-[400px] h-full ${
                    isDragActive 
                      ? 'border-blue-500 bg-blue-500/10 scale-[1.02]' 
                      : 'border-white/10 hover:border-white/20 bg-white/5'
                  }`}
                >
                  <input {...getInputProps()} />
                  <div className="w-16 h-16 md:w-20 md:h-20 bg-blue-600/20 rounded-2xl flex items-center justify-center mb-6 border border-blue-500/20">
                    <UploadIcon className="w-8 h-8 md:w-10 md:h-10 text-blue-500" />
                  </div>
                  <h3 className="text-lg md:text-xl font-bold text-white mb-2">Arraste e solte</h3>
                  <p className="text-xs md:text-sm text-zinc-500 text-center max-w-[200px]">
                    Qualquer arquivo de Áudio ou Vídeo (MP3, MP4, WAV, MKV, etc)
                  </p>
                  
                  <div className="flex flex-col sm:flex-row gap-3 md:gap-4 mt-8 w-full sm:w-auto">
                    <Button 
                      onClick={(e) => {
                        e.stopPropagation();
                        open();
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold px-6 py-4 h-auto w-full sm:w-auto"
                    >
                      Selecionar Arquivos
                    </Button>
                    <div className="w-full sm:w-auto">
                      <label 
                        onClick={(e) => e.stopPropagation()}
                        className="bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold px-6 py-4 h-auto cursor-pointer border border-white/10 flex items-center justify-center gap-2 w-full sm:w-auto"
                      >
                        <HardDrive className="w-4 h-4" />
                        Pasta
                        <input
                          type="file"
                          className="hidden"
                          // @ts-ignore
                          webkitdirectory=""
                          directory=""
                          onChange={(e) => {
                            if (e.target.files) {
                              const filesArray = Array.from(e.target.files);
                              const validFiles = filesArray.filter(f => f.size <= 500 * 1024 * 1024);
                              if (validFiles.length > 0) {
                                if (!isPremium && validFiles.length > 1) {
                                  toast.info("Apenas o primeiro arquivo foi selecionado. Adquira o Acesso Total para importar pastas inteiras.");
                                  setFiles([validFiles[0]]);
                                } else {
                                  setFiles(prev => isPremium ? [...prev, ...validFiles] : validFiles);
                                }
                              }
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              </motion.div>
            ) : (
              <motion.div 
                key="file-list"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white/5 backdrop-blur-md rounded-2xl md:rounded-3xl p-6 md:p-8 border border-white/10 min-h-[300px] md:min-h-[400px] flex flex-col"
              >
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-base md:text-lg font-bold text-white flex items-center gap-2">
                    <Music className="w-4 h-4 md:w-5 md:h-5 text-blue-500" />
                    Arquivos Selecionados ({files.length})
                  </h3>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setFiles([])} 
                    disabled={uploading}
                    className="text-zinc-500 hover:text-white h-auto p-1"
                  >
                    Limpar
                  </Button>
                </div>

                <div className="space-y-2 md:space-y-3 flex-1 overflow-y-auto max-h-[300px] md:max-h-[400px] pr-2 custom-scrollbar">
                  {files.map((f, i) => (
                    <motion.div 
                      key={i}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex items-center justify-between p-2 md:p-3 rounded-xl border ${
                        uploading && currentFileIndex === i 
                          ? 'bg-blue-500/10 border-blue-500/30' 
                          : 'bg-white/5 border-white/5'
                      }`}
                    >
                      <div className="flex items-center space-x-3 truncate">
                        <FileAudio className={`w-3 h-3 md:w-4 md:h-4 ${uploading && currentFileIndex === i ? 'text-blue-500' : 'text-zinc-500'}`} />
                        <span className="text-xs md:text-sm text-white truncate max-w-[150px] md:max-w-none">{f.name}</span>
                      </div>
                      {!uploading && (
                        <button onClick={() => removeFile(i)} className="text-zinc-500 hover:text-red-500 p-1">
                          <X className="w-3 h-3 md:w-4 md:h-4" />
                        </button>
                      )}
                      {uploading && currentFileIndex === i && (
                        <Loader2 className="w-3 h-3 md:w-4 md:h-4 text-blue-500 animate-spin" />
                      )}
                      {uploading && i < currentFileIndex && (
                        <CheckCircle2 className="w-3 h-3 md:w-4 md:h-4 text-green-500" />
                      )}
                    </motion.div>
                  ))}
                </div>

                <div className="mt-6 md:mt-8 space-y-4">
                  {uploading && (
                    <div className="space-y-3">
                      <div className="flex justify-between text-[10px] font-bold text-zinc-500 uppercase tracking-widest px-1">
                        <span>{uploadStatus || `Música ${currentFileIndex + 1} de ${files.length}`}</span>
                        <span>{progress.toFixed(0)}%</span>
                      </div>
                      <div className="h-1 bg-white/5 rounded-full overflow-hidden">
                        <motion.div 
                          className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6]" 
                          initial={{ width: 0 }}
                          animate={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  <Button 
                    onClick={handleUpload}
                    disabled={uploading}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-6 rounded-xl text-lg shadow-xl shadow-blue-600/20 h-auto"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-3 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-5 h-5 mr-3" />
                        Confirmar
                      </>
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="block">
          <div className="bg-gradient-to-br from-blue-600/10 to-purple-600/10 rounded-2xl md:rounded-3xl p-6 md:p-10 border border-white/5 h-full flex flex-col justify-center space-y-6 md:space-y-8">
            <div className="space-y-4">
              <h3 className="text-xl md:text-2xl font-bold text-white tracking-tight">Privacidade e Velocidade</h3>
              <ul className="space-y-3 md:space-y-4">
                {[
                  "Arquivos salvos no seu navegador.",
                  "Não consome dados após o upload.",
                  "Músicas ficam disponíveis offline.",
                  "Remoção ao limpar dados do navegador."
                ].map((tip, i) => (
                  <li key={i} className="flex items-start space-x-3 text-sm text-zinc-400">
                    <div className="w-5 h-5 bg-blue-500/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                      <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" />
                    </div>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="p-6 bg-white/5 rounded-2xl border border-white/5">
              <p className="text-xs text-zinc-500 leading-relaxed italic">
                "A música é a linguagem universal da humanidade."
              </p>
            </div>
          </div>
        </div>
      </div>
      <PremiumModal isOpen={isPremiumModalOpen} onClose={() => setIsPremiumModalOpen(false)} />
    </div>
  );
}
