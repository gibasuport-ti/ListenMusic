import { useState, useRef, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Repeat, Shuffle, Volume2, Maximize2, ListMusic, Heart, HardDrive, Monitor, Video, Music as MusicIcon, X, SlidersHorizontal, Settings2, Minimize2, Zap, Waves, Activity, CircleDot, BarChart3, Layers, ShieldCheck } from 'lucide-react';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';
import { cn } from '@/src/lib/utils';
import { getAudioLocal } from '@/src/lib/localDb';
import { LocalImage } from './LocalImage';
import { Visualizer, type VisualizerStyle } from './Visualizer';
import ReactPlayer from 'react-player';
import { getCleanNoAdYouTubeUrl } from '@/src/lib/youtubeUtils';

interface Song {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  audioUrl: string;
  source: 'local' | 'youtube';
  type?: 'audio' | 'video';
}

interface PlayerProps {
  currentSong: Song | null;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  onNext: () => void;
  onPrevious: () => void;
  id?: string;
}

export function Player({ currentSong, isPlaying, setIsPlaying, onNext, onPrevious, id }: PlayerProps) {
  const [volume, setVolume] = useState(0.5);
  const [played, setPlayed] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [eqGains, setEqGains] = useState<number[]>(new Array(10).fill(0));
  const [preampGain, setPreampGain] = useState(0); // in dB
  const [isEqEnabled, setIsEqEnabled] = useState(true);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [audioReady, setAudioReady] = useState(false);
  const [visStyle, setVisStyle] = useState<VisualizerStyle>('spectrum');
  const [isFullscreenVis, setIsFullscreenVis] = useState(false);
  const mediaRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<ReactPlayer>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const blobUrlRef = useRef<string | null>(null);

  // Audio Context Ref
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const gainNodeRef = useRef<GainNode | null>(null);
  const masterVolumeRef = useRef<GainNode | null>(null);
  const limiterRef = useRef<DynamicsCompressorNode | null>(null);

  const EQ_FREQUENCIES = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  // Robust type detection
  const isVideo = currentSong?.type === 'video';
  const isYouTube = currentSong?.source === 'youtube';

  // Initialize Audio Context on user interaction/play
  const initAudio = () => {
    if (isYouTube) {
      if (audioContextRef.current?.state === 'suspended') {
        audioContextRef.current.resume().catch(() => {});
      }
      return; 
    }
    const media = mediaRef.current;
    if (!media) return;

    if (audioContextRef.current) {
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().catch(console.error);
      }
      return;
    }

    try {
      // Create Context
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      // Source - CRITICAL: Can only be created once per element
      const source = ctx.createMediaElementSource(media);
      sourceNodeRef.current = source;

      // Analyser for visualizer
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // gainNodeRef (Preamp/Amplifier)
      const preamp = ctx.createGain();
      const initialMultiplier = Math.pow(10, preampGain / 15); // Slightly more aggressive curve
      preamp.gain.value = Number.isFinite(initialMultiplier) ? initialMultiplier : 1;
      gainNodeRef.current = preamp;

      // EQ Filters
      const filters = EQ_FREQUENCIES.map((freq, i) => {
        const filter = ctx.createBiquadFilter();
        if (i === 0) {
          filter.type = 'lowshelf';
        } else if (i === EQ_FREQUENCIES.length - 1) {
          filter.type = 'highshelf';
        } else {
          filter.type = 'peaking';
          filter.Q.value = 1.4; // Slightly narrower for 10-band precision
        }
        filter.frequency.value = freq;
        const gainVal = isEqEnabled ? eqGains[i] : 0;
        filter.gain.value = Number.isFinite(gainVal) ? gainVal : 0;
        return filter;
      });
      filtersRef.current = filters;

      // Master Volume
      const masterVolume = ctx.createGain();
      const initialVol = isMuted ? 0 : volume;
      masterVolume.gain.value = Number.isFinite(initialVol) ? initialVol : 0.5;
      masterVolumeRef.current = masterVolume;

      // Limiter for Quality and Safety (Maximum Power without clipping)
      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = -0.5;
      limiter.knee.value = 40;
      limiter.ratio.value = 12;
      limiter.attack.value = 0;
      limiter.release.value = 0.25;
      limiterRef.current = limiter;

      // Build chain: Source -> Analyser -> Preamp -> EQ Banks -> Master Volume -> Limiter -> Destination
      source.connect(analyser);
      analyser.connect(preamp);
      let lastNode: AudioNode = preamp;
      filters.forEach(filter => {
        lastNode.connect(filter);
        lastNode = filter;
      });

      lastNode.connect(masterVolume);
      masterVolume.connect(limiter);
      limiter.connect(ctx.destination);

      setAudioReady(true);
      if (ctx.state === 'suspended') {
        ctx.resume().catch(console.error);
      }
      console.log("Audio Engine Connected Root Level");
    } catch (err) {
      console.error("Web Audio API Failure:", err);
    }
  };

  useEffect(() => {
    if ((isVideo || isYouTube) && !showVideo && isPlaying) {
      setShowVideo(true);
    }
  }, [isVideo, isYouTube, isPlaying]);

  useEffect(() => {
    const media = mediaRef.current;
    
    const targetVol = isMuted ? 0 : volume;
    
    if (isYouTube) {
      // ReactPlayer handles its own volume
      return;
    }

    if (!media) return;

    if (!audioReady) {
      // Fallback to native volume if context not ready
      if (Number.isFinite(targetVol)) {
        media.volume = targetVol;
      }
    } else {
      // AudioContext is ready: Use Master Volume and keep media at full for highest fidelity
      media.volume = 1;
      
      if (masterVolumeRef.current && audioContextRef.current) {
        const gCtx = audioContextRef.current;
        if (gCtx.state === 'suspended') gCtx.resume().catch(() => {});
        
        masterVolumeRef.current.gain.cancelScheduledValues(gCtx.currentTime);
        masterVolumeRef.current.gain.setTargetAtTime(targetVol, gCtx.currentTime, 0.01);
      }
    }
  }, [volume, isMuted, audioReady]);

  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;

    const primeMedia = () => {
      initAudio();
      if (media.src && media.src !== window.location.href) {
        media.play().then(() => {
          media.pause();
        }).catch(() => {});
      }
      window.removeEventListener('click', primeMedia);
      window.removeEventListener('touchstart', primeMedia);
    };
    
    window.addEventListener('click', primeMedia);
    window.addEventListener('touchstart', primeMedia);
    return () => {
      window.removeEventListener('click', primeMedia);
      window.removeEventListener('touchstart', primeMedia);
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const resolveUrl = async () => {
      if (!currentSong) return;
      
      if (isYouTube) {
        // Automatically sanitize and convert to privacy-enhanced no-ad nocookie URL
        const cleanUrl = getCleanNoAdYouTubeUrl(currentSong.audioUrl);
        setActiveUrl(cleanUrl);
        setErrorStatus(null);
        return;
      }

      setActiveUrl(null);
      try {
        let finalUrl = currentSong.audioUrl;
        if (finalUrl.startsWith('local://')) {
          const localId = finalUrl.replace('local://', '');
          const blob = await getAudioLocal(localId);
          if (blob) {
            if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
            const blobUrl = URL.createObjectURL(blob);
            blobUrlRef.current = blobUrl;
            finalUrl = blobUrl;
          } else {
            setErrorStatus("Arquivo perdido");
            toast.error("Arquivo local não encontrado.");
            setIsPlaying(false);
            return;
          }
        }
        setActiveUrl(finalUrl);
        setErrorStatus(null);
      } catch (err) {
        console.error("Error resolving URL:", err);
        setErrorStatus("Erro ao carregar");
      }
    };

    resolveUrl();
  }, [currentSong?.id]);

  useEffect(() => {
    if (isYouTube) {
      if (mediaRef.current) {
        mediaRef.current.pause();
      }
      return; // Sync happens via ReactPlayer props
    }

    const media = mediaRef.current;
    if (!media || !activeUrl) return;

    const syncPlayback = async () => {
      if (!activeUrl) return;

      try {
        // Only set src if it actually changed to avoid unnecessary reloads
        // Chrome sometimes appends a slash or normalizes, so we check if the activeUrl is contained
        if (!media.src.includes(activeUrl) && media.src !== activeUrl) {
          console.log("Loading new source:", activeUrl);
          media.pause();
          media.src = activeUrl;
          media.load();
        }

        if (isPlaying) {
          if (media.paused) {
            // Ensure audio context is resumed before playing
            if (audioContextRef.current?.state === 'suspended') {
              await audioContextRef.current.resume();
            }
            await media.play();
          }
        } else {
          if (!media.paused) {
            media.pause();
          }
        }
      } catch (err: any) {
        if (err.name === 'NotAllowedError') {
          setErrorStatus("Clique para tocar");
        } else if (err.name === 'NotSupportedError') {
          console.error("Not Supported Source:", activeUrl);
          setErrorStatus("Formato inválido");
          toast.error("Este arquivo não pode ser reproduzido.");
        } else if (err.name !== 'AbortError') {
          console.error("Playback Sync Error:", err.name, err.message);
          setErrorStatus("Erro no Player");
        }
        setIsPlaying(false);
      }
    };

    syncPlayback();
  }, [activeUrl, isPlaying]);

  useEffect(() => {
    if (filtersRef.current.length > 0 && audioContextRef.current) {
      const gCtx = audioContextRef.current;
      if (gCtx.state === 'suspended') gCtx.resume().catch(() => {});
      
      filtersRef.current.forEach((filter, i) => {
        const val = isEqEnabled ? eqGains[i] : 0;
        if (Number.isFinite(val)) {
          // Absolute zero time for instant feedback
          filter.gain.cancelScheduledValues(gCtx.currentTime);
          filter.gain.setTargetAtTime(val, gCtx.currentTime, 0.01);
        }
      });
    }
  }, [eqGains, isEqEnabled, audioReady]);

  useEffect(() => {
    if (gainNodeRef.current && audioContextRef.current) {
      const gCtx = audioContextRef.current;
      if (gCtx.state === 'suspended') gCtx.resume().catch(() => {});
      
      const multiplier = Math.pow(10, preampGain / 15);
      if (Number.isFinite(multiplier)) {
        // Instant response for user
        gainNodeRef.current.gain.cancelScheduledValues(gCtx.currentTime);
        gainNodeRef.current.gain.setTargetAtTime(multiplier, gCtx.currentTime, 0.01);
      }
    }
  }, [preampGain, audioReady]);

  const updateEqGain = (index: number, value: number) => {
    if (!Number.isFinite(value)) return;
    const newGains = [...eqGains];
    newGains[index] = value;
    setEqGains(newGains);
  };

  const handleTimeUpdate = () => {
    if (mediaRef.current && !isSeeking) {
      setPlayed(mediaRef.current.currentTime / mediaRef.current.duration || 0);
    }
  };

  const handleLoadedMetadata = () => {
    if (mediaRef.current) {
      setDuration(mediaRef.current.duration);
    }
  };

  const handleSeekChange = (value: number[]) => {
    setIsSeeking(true);
    setPlayed(value[0]);
  };

  const handleSeekCommit = (value: number[]) => {
    const targetTime = value[0] * duration;
    if (isYouTube) {
      playerRef.current?.seekTo(value[0], 'fraction');
    } else if (mediaRef.current && Number.isFinite(duration) && duration > 0) {
      if (Number.isFinite(targetTime)) {
        mediaRef.current.currentTime = targetTime;
      }
    }
    setIsSeeking(false);
  };

  const handleToggleFullscreen = () => {
    const container = videoContainerRef.current;
    if (!container) return;

    const doc = document as any;
    if (doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement) {
      if (doc.exitFullscreen) doc.exitFullscreen();
      else if (doc.webkitExitFullscreen) doc.webkitExitFullscreen();
      else if (doc.mozCancelFullScreen) doc.mozCancelFullScreen();
      else if (doc.msExitFullscreen) doc.msExitFullscreen();
    } else {
      const v = container as any;
      if (v.requestFullscreen) v.requestFullscreen();
      else if (v.webkitRequestFullscreen) v.webkitRequestFullscreen();
      else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen(); // Specific for iOS
      else if (v.mozRequestFullScreen) v.mozRequestFullScreen();
      else if (v.msRequestFullscreen) v.msRequestFullscreen();
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return "0:00";
    const date = new Date(seconds * 1000);
    const mm = date.getUTCMinutes();
    const ss = date.getUTCSeconds().toString().padStart(2, '0');
    return `${mm}:${ss}`;
  };
  return (
    <>
      {/* Fullscreen Visualizer Overlay */}
      <div className={cn(
        "fixed inset-0 z-[100] bg-black/95 transition-all duration-500 flex flex-col items-center justify-center p-8",
        isFullscreenVis ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none scale-110"
      )}>
        <div className="absolute top-8 right-8 z-[110] flex items-center space-x-4">
          <div className="flex items-center space-x-2 bg-white/5 p-1 rounded-full border border-white/10 backdrop-blur-md">
            {[
              { id: 'spectrum', icon: Activity, label: 'Espectro' },
              { id: 'lightning', icon: Zap, label: 'Raio' },
              { id: 'wave', icon: Waves, label: 'Onda' },
              { id: 'circles', icon: CircleDot, label: 'Círculos' },
              { id: 'bars', icon: BarChart3, label: 'Barras' },
              { id: 'particles', icon: Layers, label: 'Partículas' }
            ].map((s) => (
              <Button
                key={s.id}
                variant="ghost"
                size="icon"
                onClick={() => setVisStyle(s.id as VisualizerStyle)}
                className={cn(
                  "w-10 h-10 rounded-full transition-all",
                  visStyle === s.id ? "bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]" : "text-zinc-400 hover:text-white"
                )}
                title={s.label}
              >
                <s.icon className="w-5 h-5" />
              </Button>
            ))}
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setIsFullscreenVis(false)}
            className="w-12 h-12 bg-white/10 hover:bg-white/20 text-white rounded-full border border-white/20"
          >
            <X className="w-6 h-6" />
          </Button>
        </div>

        <div className="w-full h-full max-w-6xl mx-auto flex flex-col items-center justify-center space-y-12">
          <div className="w-full h-96 relative">
             <Visualizer 
                analyser={analyserRef.current} 
                isPlaying={isPlaying} 
                style={visStyle}
                className="opacity-100 w-full h-full drop-shadow-[0_0_30px_rgba(59,130,246,0.4)]" 
              />
          </div>

          <div className="text-center space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <h2 className="text-4xl font-black text-white tracking-tighter uppercase">{currentSong?.title}</h2>
            <p className="text-xl text-zinc-400 font-medium">{currentSong?.artist}</p>
          </div>

          <div className="flex items-center space-x-12 pt-8">
            <Button variant="ghost" size="icon" onClick={onPrevious} className="text-white hover:bg-white/10 transition-all hover:scale-110 w-16 h-16 rounded-full border border-white/5">
              <SkipBack className="w-8 h-8 fill-current" />
            </Button>
            <Button 
              onClick={() => {
                initAudio();
                setIsPlaying(!isPlaying);
              }}
              className="w-24 h-24 rounded-full bg-white text-black flex items-center justify-center shadow-[0_0_30px_rgba(255,255,255,0.3)] transition-all hover:scale-110 active:scale-95"
            >
              {isPlaying ? <Pause className="w-10 h-10 fill-current" /> : <Play className="w-10 h-10 fill-current ml-2" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onNext} className="text-white hover:bg-white/10 transition-all hover:scale-110 w-16 h-16 rounded-full border border-white/5">
              <SkipForward className="w-8 h-8 fill-current" />
            </Button>
          </div>
        </div>
      </div>

      {/* Video Container */}
      <div 
        ref={videoContainerRef}
        className={cn(
        "fixed bottom-[164px] right-4 md:bottom-28 md:right-8 w-64 md:w-96 aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/10 z-50 transition-all duration-500 group/video",
        ((isVideo || isYouTube) && showVideo) ? "scale-100 opacity-100 translate-y-0" : "scale-75 opacity-0 translate-y-20 pointer-events-none"
      )}>
        {/* Always keep ReactPlayer mounted when it's YouTube to avoid reload issues */}
        {isYouTube && activeUrl && (
          <ReactPlayer
            ref={playerRef}
            url={activeUrl}
            playing={isPlaying}
            volume={volume}
            muted={isMuted}
            width="100%"
            height="100%"
            onProgress={({ played }: { played: number }) => !isSeeking && setPlayed(played)}
            onReady={(player) => setDuration(player.getDuration())}
            onEnded={onNext}
            config={{
              youtube: {
                playerVars: { 
                  autoplay: 1,
                  controls: 0,
                  modestbranding: 1,
                  rel: 0,
                  showinfo: 0,
                  iv_load_policy: 3,
                  playsinline: 1,
                  disablekb: 0
                },
                embedOptions: {
                  host: 'https://www.youtube-nocookie.com'
                }
              }
            }}
            onError={(err) => {
              console.error("YouTube Error:", err);
              setErrorStatus("Erro no YouTube");
              setIsPlaying(false);
            }}
          />
        )}

        {/* Anti-ad badge for YouTube videos */}
        {isYouTube && (
          <div className="absolute top-2 left-2 z-10 flex items-center space-x-1.5 px-2.5 py-1 bg-black/75 backdrop-blur-md rounded-full border border-emerald-500/30 text-emerald-400 pointer-events-none shadow-lg">
            <ShieldCheck className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-bold tracking-tight">Sem Anúncios</span>
          </div>
        )}
        
          {/* Only mount native video for non-YouTube sources */}
          <video
            ref={mediaRef}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onEnded={onNext}
            playsInline
            webkit-playsinline="true"
            crossOrigin="anonymous"
            className={cn(
              "w-full h-full object-contain cursor-pointer",
              isYouTube ? "hidden pointer-events-none" : "block"
            )}
            onDoubleClick={handleToggleFullscreen}
            onClick={() => {
              if (isPlaying) {
                mediaRef.current?.pause();
                setIsPlaying(false);
              } else {
                initAudio();
                mediaRef.current?.play().catch(() => {});
                setIsPlaying(true);
              }
            }}
            onError={(e) => {
              const target = e.target as HTMLVideoElement;
              const errorMsg = target.error?.message || "Erro de formato ou rede";
              const errorCode = target.error?.code;
              console.error("Player Error:", errorCode, errorMsg);
              setErrorStatus(`Erro ${errorCode}`);
              if (isPlaying) {
                toast.error(`Erro: ${errorMsg}`);
              }
              setIsPlaying(false);
            }}
          />
        
        {/* Overlay Fullscreen Button */}
        <div className="absolute top-2 right-2 md:opacity-0 md:group-hover/video:opacity-100 transition-opacity flex flex-col space-y-2">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={(e) => {
              e.stopPropagation();
              handleToggleFullscreen();
            }}
            className="w-10 h-10 md:w-8 md:h-8 bg-black/60 md:bg-black/50 hover:bg-black/80 text-white rounded-full border border-white/10"
          >
            <Maximize2 className="w-5 h-5 md:w-4 md:h-4" />
          </Button>
          
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={(e) => {
              e.stopPropagation();
              setShowVideo(false);
            }}
            className="w-10 h-10 md:w-8 md:h-8 bg-red-500/60 md:bg-red-500/50 hover:bg-red-500/80 text-white rounded-full border border-red-500/20"
            title="Fechar vídeo"
          >
            <X className="w-5 h-5 md:w-4 md:h-4" />
          </Button>
        </div>
      </div>

      {currentSong && (
        <div id={id} className="fixed bottom-[74px] md:relative md:bottom-0 left-0 right-0 flex flex-col z-40">
          {/* Sound Visualizer - Dedicated Space between list and player */}
          <div className="h-10 md:h-14 bg-black/60 backdrop-blur-xl border-t border-white/5 flex items-center justify-center overflow-hidden relative group/vis">
            <Visualizer 
              analyser={analyserRef.current} 
              isPlaying={isPlaying} 
              style={visStyle}
              className="opacity-90 max-w-4xl mx-auto drop-shadow-[0_0_15px_rgba(59,130,246,0.2)]" 
            />
            
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center space-x-2 opacity-0 group-hover/vis:opacity-100 transition-opacity">
              <div className="flex items-center bg-black/40 rounded-full border border-white/10 p-0.5">
                {[
                  { id: 'spectrum', icon: Activity },
                  { id: 'lightning', icon: Zap },
                  { id: 'wave', icon: Waves },
                  { id: 'circles', icon: CircleDot }
                ].map((s) => (
                  <Button
                    key={s.id}
                    variant="ghost"
                    size="icon"
                    onClick={() => setVisStyle(s.id as VisualizerStyle)}
                    className={cn(
                      "w-6 h-6 p-0 rounded-full",
                      visStyle === s.id ? "text-blue-400 bg-white/5" : "text-zinc-500"
                    )}
                  >
                    <s.icon className="w-3.5 h-3.5" />
                  </Button>
                ))}
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsFullscreenVis(true)}
                className="w-8 h-8 rounded-full text-zinc-500 hover:text-white"
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Player controls bar */}
          <div className="relative h-20 md:h-28 bg-black/90 md:bg-black/80 backdrop-blur-3xl border-t border-white/5 px-4 md:px-6 flex items-center justify-between shadow-[0_-20px_50px_rgba(0,0,0,0.5)]">
          {/* Progress Bar (Top) - Enhanced for touch/drag */}
          <div className="absolute top-0 left-0 right-0 h-1.5 z-50">
            <Slider 
              value={[played]} 
              max={1} 
              step={0.001} 
              onValueChange={handleSeekChange}
              onValueCommitted={handleSeekCommit}
              className="absolute top-0 left-0 right-0 h-full cursor-pointer opacity-0 hover:opacity-100 transition-opacity"
            />
            <div className="absolute top-0 left-0 right-0 h-1 pointer-events-none bg-white/5">
              <div 
                className="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6] transition-all duration-150" 
                style={{ width: `${played * 100}%` }}
              />
            </div>
          </div>

          {/* Song Info - Clickable to toggle play */}
          <div 
            onClick={() => {
              if (isPlaying) {
                setIsPlaying(false);
              } else {
                initAudio();
                setIsPlaying(true);
              }
            }}
            className="flex items-center space-x-3 md:space-x-4 w-auto md:w-1/4 min-w-0 md:min-w-[240px] cursor-pointer group hover:bg-white/5 active:scale-95 transition-all p-2 rounded-xl"
            title={isPlaying ? "Pausar" : "Reproduzir"}
          >
            <div className="relative flex-shrink-0">
              <LocalImage 
                src={currentSong.coverUrl || undefined} 
                className="w-12 h-12 md:w-16 md:h-16 rounded-lg md:rounded-xl shadow-2xl object-cover border border-white/10" 
                fallback={
                  <div className="w-12 h-12 md:w-16 md:h-16 rounded-lg md:rounded-xl bg-zinc-800 flex items-center justify-center">
                    <MusicIcon className="w-6 h-6 text-zinc-600" />
                  </div>
                }
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg md:rounded-xl">
                {isPlaying ? <Pause className="w-6 h-6 text-white fill-current" /> : <Play className="w-6 h-6 text-white fill-current ml-1" />}
              </div>
            </div>
            <div className="flex flex-col truncate pr-2">
              <div className="flex items-center space-x-2 truncate">
                {isVideo ? (
                  <Video className="w-3 h-3 text-blue-400 flex-shrink-0" />
                ) : (
                  <MusicIcon className="w-3 h-3 text-zinc-400 flex-shrink-0" />
                )}
                <span className="text-xs md:text-sm font-bold text-white truncate">
                  {currentSong.title}
                </span>
              </div>
              <span className="text-[10px] md:text-xs text-zinc-400 truncate">
                {currentSong.artist}
              </span>
              {errorStatus && (
                <span className="text-[8px] md:text-[10px] text-red-500 truncate font-bold animate-pulse">
                  {errorStatus}
                </span>
              )}
            </div>
          </div>

          {/* Main Controls */}
          <div className="flex items-center md:flex-col md:items-center space-x-4 md:space-x-0 md:flex-1 md:max-w-xl md:px-8">
            <div className="flex items-center space-x-4 md:space-x-8 md:mb-2">
              {isVideo && (
                <div className="flex items-center space-x-1">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => setShowVideo(!showVideo)}
                    className={cn(
                      "w-8 h-8 rounded-full transition-all",
                      showVideo ? "bg-blue-500/20 text-blue-400" : "text-zinc-500 hover:text-white"
                    )}
                    title={showVideo ? "Ocultar vídeo" : "Mostrar vídeo"}
                  >
                    <Monitor className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={handleToggleFullscreen}
                    className="w-8 h-8 rounded-full text-zinc-500 hover:text-white hidden md:flex"
                    title="Tela Cheia"
                  >
                    <Maximize2 className="w-4 h-4" />
                  </Button>
                </div>
              )}
              <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-white transition-colors hidden md:flex">
                <Shuffle className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={onPrevious} className="text-zinc-400 hover:text-white transition-all hover:scale-110">
                <SkipBack className="w-5 h-5 md:w-6 md:h-6 fill-current" />
              </Button>
              <Button 
                onClick={() => {
                  initAudio();
                  setIsPlaying(!isPlaying);
                }}
                className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-white hover:bg-white/90 text-black flex items-center justify-center shadow-2xl transition-all hover:scale-110 active:scale-90"
              >
                {isPlaying ? <Pause className="w-5 h-5 md:w-6 md:h-6 fill-current" /> : <Play className="w-5 h-5 md:w-6 md:h-6 fill-current ml-1" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={onNext} className="text-zinc-400 hover:text-white transition-all hover:scale-110">
                <SkipForward className="w-5 h-5 md:w-6 md:h-6 fill-current" />
              </Button>
              <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-white transition-colors hidden md:flex">
                <Repeat className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="hidden md:flex items-center space-x-3 w-full">
              <span className="text-[10px] font-medium text-zinc-500 w-10 text-right tabular-nums">
                {formatTime(played * duration)}
              </span>
              <Slider 
                value={[played]} 
                max={1} 
                step={0.001} 
                onValueChange={handleSeekChange}
                onValueCommitted={handleSeekCommit}
                className="flex-1"
              />
              <span className="text-[10px] font-medium text-zinc-500 w-10 tabular-nums">
                {formatTime(duration)}
              </span>
            </div>
          </div>

          {/* Volume & Extra */}
          <div className="flex items-center justify-end space-x-2 md:space-x-4 w-auto md:w-1/4 md:min-w-[240px] px-2 md:px-0">
            <Popover>
              <PopoverTrigger
                className={cn(
                  "group/button inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 h-10 w-10 md:mr-2",
                  isEqEnabled ? "text-blue-500 bg-blue-500/10" : "text-zinc-500 hover:bg-muted"
                )}
                title="Equalizador de Qualidade"
              >
                <SlidersHorizontal className="w-5 h-5" />
              </PopoverTrigger>
              <PopoverContent className="w-[calc(100vw-32px)] md:w-[480px] bg-zinc-900 border-white/10 p-4 md:p-6 rounded-2xl shadow-2xl" side="top" align="end" sideOffset={20}>
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-white font-bold flex items-center gap-2">
                        <Settings2 className="w-4 h-4 text-blue-500" />
                        Equalizador Profissional
                      </h4>
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">Resolução de 10 Bandas • Precisão Studio</p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className={cn(
                        "text-[10px] font-black uppercase tracking-tighter px-3 h-7 rounded-full transition-all",
                        isEqEnabled ? "bg-green-500/20 text-green-500 border border-green-500/20" : "bg-red-500/20 text-red-500 border border-red-500/20"
                      )}
                      onClick={() => setIsEqEnabled(!isEqEnabled)}
                    >
                      {isEqEnabled ? "Ativado" : "Desativado"}
                    </Button>
                  </div>
                  
                  <div className="flex justify-between items-end h-56 gap-1 pt-2 px-1">
                    <div className="flex flex-col items-center w-10 h-full border-r border-white/5 pr-2 shrink-0 group/amp">
                      <span className="text-[9px] font-black text-blue-500 mb-4 uppercase tracking-tighter text-center h-8 flex items-center group-hover/amp:text-blue-400 transition-colors pointer-events-none">Amp</span>
                      <div className="flex-1 w-full flex items-center justify-center relative py-2">
                        <Slider
                          orientation="vertical"
                          value={[preampGain]}
                          min={-12}
                          max={24}
                          step={0.5}
                          onValueChange={(val) => setPreampGain(val[0])}
                          disabled={!isEqEnabled}
                          className="h-full"
                        />
                      </div>
                      <div className="w-full text-center h-5 mt-1 flex items-center justify-center pointer-events-none">
                        <span className={cn(
                          "text-[9px] font-mono font-bold tabular-nums transition-colors",
                          preampGain > 0 ? "text-blue-500" : "text-zinc-500"
                        )}>
                          {preampGain > 0 ? `+${preampGain}` : preampGain}
                        </span>
                      </div>
                    </div>
 
                    <div className="flex flex-1 justify-between gap-1 h-full overflow-x-auto no-scrollbar pb-1">
                      {EQ_FREQUENCIES.map((freq, i) => (
                        <div key={freq} className="flex flex-col items-center w-8 h-full shrink-0 group/band"> 
                          <span className="text-[8px] font-black text-zinc-600 h-8 flex items-end justify-center pb-1 group-hover/band:text-zinc-400 transition-colors pointer-events-none">
                            {freq >= 1000 ? `${freq / 1000}k` : freq}
                          </span>
                          <div className="flex-1 w-full flex items-center justify-center relative py-2">
                            <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-white/5 -translate-x-1/2 pointer-events-none" />
                            <Slider
                              orientation="vertical"
                              value={[eqGains[i]]}
                              min={-12}
                              max={18}
                              step={0.5}
                              onValueChange={(val) => updateEqGain(i, val[0])}
                              disabled={!isEqEnabled}
                              className="h-full"
                            />
                          </div>
                          <div className="w-full text-center h-5 mt-1 flex items-center justify-center pointer-events-none">
                            <span className={cn(
                              "text-[8px] font-mono tabular-nums transition-colors",
                              eqGains[i] > 0 ? "text-blue-400" : "text-zinc-500"
                            )}>
                              {eqGains[i] > 0 ? `+${eqGains[i].toFixed(1)}` : eqGains[i].toFixed(1)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
 
                  <div className="pt-4 border-t border-white/5 flex gap-2">
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-1 text-[10px] font-bold text-zinc-400 hover:text-white uppercase tracking-tighter"
                      onClick={() => {
                        setEqGains(new Array(10).fill(0));
                        setPreampGain(0);
                      }}
                    >
                      Resetar
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-1 text-[10px] font-bold text-blue-400 hover:text-blue-300 uppercase tracking-tighter"
                      onClick={() => setEqGains([8, 6, 4, 0, -2, -1, 2, 5, 7, 9])}
                    >
                      Reforço V
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="flex-1 text-[10px] font-bold text-purple-400 hover:text-purple-300 uppercase tracking-tighter"
                      onClick={() => setEqGains([12, 10, 5, 0, 0, 0, 0, 0, 0, 0])}
                    >
                      Super Bass
                    </Button>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex items-center space-x-3 group">
              <Button 
                variant="ghost" 
                size="icon" 
                className="text-zinc-500 hover:text-white p-0 h-auto w-auto"
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted || volume === 0 ? <Volume2 className="w-5 h-5 text-red-500" /> : <Volume2 className="w-5 h-5" />}
              </Button>
              <div className="w-24">
                <Slider 
                  value={[isMuted ? 0 : volume]} 
                  max={1} 
                  step={0.01} 
                  onValueChange={(val) => setVolume(val[0])}
                  className="cursor-pointer"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
