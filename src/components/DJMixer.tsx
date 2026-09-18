import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Play, Pause, SkipBack, Music, Layers, Save, Download, 
  Trash2, Plus, Volume2, Maximize2, Mic, Settings, X, 
  Disc, Sliders, Activity, AlertCircle, CheckCircle2, Loader2,
  FastForward, Rewind
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { getAllMetadataLocal, getAudioLocal, saveMetadataLocal, saveMediaLocal } from '@/src/lib/localDb';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

interface Song {
  id: string;
  title: string;
  artist: string;
  coverUrl: string;
  audioUrl: string;
  source: 'local' | 'youtube';
  type?: 'audio' | 'video';
}

interface DeckState {
  song: Song | null;
  isPlaying: boolean;
  volume: number;
  pitch: number;
  currentTime: number;
  duration: number;
  eqLow: number;
  eqMid: number;
  eqHigh: number;
}

export function DJMixer() {
  const [library, setLibrary] = useState<Song[]>([]);
  const [isLoadingLibrary, setIsLoadingLibrary] = useState(true);
  const [showLibraryModal, setShowLibraryModal] = useState<{ open: boolean; side: 'A' | 'B' }>({ open: false, side: 'A' });
  
  // Audio Engine Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  
  // Decks Refs
  const deckARef = useRef<{
    source: AudioBufferSourceNode | null;
    gain: GainNode | null;
    eqLow: BiquadFilterNode | null;
    eqMid: BiquadFilterNode | null;
    eqHigh: BiquadFilterNode | null;
    buffer: AudioBuffer | null;
    startTime: number;
    pausedAt: number;
  }>({ source: null, gain: null, eqLow: null, eqMid: null, eqHigh: null, buffer: null, startTime: 0, pausedAt: 0 });

  const deckBRef = useRef<{
    source: AudioBufferSourceNode | null;
    gain: GainNode | null;
    eqLow: BiquadFilterNode | null;
    eqMid: BiquadFilterNode | null;
    eqHigh: BiquadFilterNode | null;
    buffer: AudioBuffer | null;
    startTime: number;
    pausedAt: number;
  }>({ source: null, gain: null, eqLow: null, eqMid: null, eqHigh: null, buffer: null, startTime: 0, pausedAt: 0 });

  // UI State
  const [deckA, setDeckA] = useState<DeckState>({
    song: null, isPlaying: false, volume: 1, pitch: 1, currentTime: 0, duration: 0, 
    eqLow: 0, eqMid: 0, eqHigh: 0
  });
  const [deckB, setDeckB] = useState<DeckState>({
    song: null, isPlaying: false, volume: 1, pitch: 1, currentTime: 0, duration: 0,
    eqLow: 0, eqMid: 0, eqHigh: 0
  });
  const [crossfader, setCrossfader] = useState(0.5); // 0 = A, 1 = B
  const [isRecording, setIsRecording] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Initialize Library
  useEffect(() => {
    loadLibrary();
  }, []);

  const loadLibrary = async () => {
    setIsLoadingLibrary(true);
    try {
      const metadata = await getAllMetadataLocal();
      // Filter out YouTube for now as it doesn't work with Web Audio Buffer
      const localsOnly = metadata.filter(m => m.source === 'local');
      setLibrary(localsOnly);
    } catch (err) {
      console.error("Error loading library for mixer:", err);
    } finally {
      setIsLoadingLibrary(false);
    }
  };

  const initAudio = () => {
    if (audioCtxRef.current) return;
    
    // Create Context
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioCtxRef.current = ctx;

    // Master Chain
    const masterGain = ctx.createGain();
    const destination = ctx.createMediaStreamDestination();
    
    masterGain.connect(ctx.destination);
    masterGain.connect(destination);
    
    masterGainRef.current = masterGain;
    destinationRef.current = destination;
  };

  const loadSongToDeck = async (song: Song, side: 'A' | 'B') => {
    initAudio();
    const ctx = audioCtxRef.current!;
    const deck = side === 'A' ? deckARef : deckBRef;
    const setState = side === 'A' ? setDeckA : setDeckB;

    try {
      toast.info(`Carregando ${song.title}...`);
      const mediaId = song.audioUrl.replace('local://', '');
      const blob = await getAudioLocal(mediaId);
      if (!blob) throw new Error("Arquivo não encontrado");

      const arrayBuffer = await blob.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

      // Reset existing source if any
      if (deck.current.source) {
        deck.current.source.stop();
        deck.current.source = null;
      }

      deck.current.buffer = audioBuffer;
      deck.current.pausedAt = 0;
      deck.current.startTime = 0;

      // Create Nodes
      const gain = ctx.createGain();
      
      // EQ Chain
      const eqLow = ctx.createBiquadFilter();
      eqLow.type = 'lowshelf';
      eqLow.frequency.value = 320;
      eqLow.gain.value = setState === setDeckA ? deckA.eqLow : deckB.eqLow;

      const eqMid = ctx.createBiquadFilter();
      eqMid.type = 'peaking';
      eqMid.frequency.value = 1000;
      eqMid.Q.value = 1;
      eqMid.gain.value = setState === setDeckA ? deckA.eqMid : deckB.eqMid;

      const eqHigh = ctx.createBiquadFilter();
      eqHigh.type = 'highshelf';
      eqHigh.frequency.value = 3200;
      eqHigh.gain.value = setState === setDeckA ? deckA.eqHigh : deckB.eqHigh;

      // Connect EQ Chain
      eqLow.connect(eqMid);
      eqMid.connect(eqHigh);
      eqHigh.connect(gain);
      gain.connect(masterGainRef.current!);

      deck.current.gain = gain;
      deck.current.eqLow = eqLow;
      deck.current.eqMid = eqMid;
      deck.current.eqHigh = eqHigh;

      setState(prev => ({
        ...prev,
        song,
        isPlaying: false,
        duration: audioBuffer.duration,
        currentTime: 0,
        eqLow: 0,
        eqMid: 0,
        eqHigh: 0
      }));

      setShowLibraryModal({ open: false, side: 'A' });
      toast.success(`${song.title} carregada no Deck ${side}`);
    } catch (err) {
      console.error("Error loading song to deck:", err);
      toast.error("Erro ao carregar música.");
    }
  };
  
  const handleSeekTo = (side: 'A' | 'B', time: number) => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    const deck = side === 'A' ? deckARef : deckBRef;
    const state = side === 'A' ? deckA : deckB;
    const setState = side === 'A' ? setDeckA : setDeckB;

    if (!deck.current.buffer) return;

    const newOffset = Math.max(0, Math.min(time, deck.current.buffer.duration));

    if (state.isPlaying) {
      if (deck.current.source) {
        deck.current.source.stop();
        deck.current.source = null;
      }
      
      const source = ctx.createBufferSource();
      source.buffer = deck.current.buffer;
      source.playbackRate.value = state.pitch;
      source.connect(deck.current.eqLow!);
      
      source.start(0, newOffset);
      deck.current.source = source;
      deck.current.startTime = ctx.currentTime - newOffset;
    } else {
      deck.current.pausedAt = newOffset;
    }

    setState(prev => ({ ...prev, currentTime: newOffset }));
  };

  const toggleDeck = (side: 'A' | 'B') => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    const deck = side === 'A' ? deckARef : deckBRef;
    const state = side === 'A' ? deckA : deckB;
    const setState = side === 'A' ? setDeckA : setDeckB;

    if (!deck.current.buffer) return;

    if (state.isPlaying) {
      // Pause
      if (deck.current.source) {
        deck.current.source.stop();
        deck.current.source = null;
      }
      deck.current.pausedAt = ctx.currentTime - deck.current.startTime;
      setState(prev => ({ ...prev, isPlaying: false }));
    } else {
      // Resume/Play
      const source = ctx.createBufferSource();
      source.buffer = deck.current.buffer;
      source.playbackRate.value = state.pitch;
      source.connect(deck.current.eqLow!);
      
      const offset = deck.current.pausedAt % deck.current.buffer.duration;
      source.start(0, offset);
      deck.current.source = source;
      deck.current.startTime = ctx.currentTime - offset;
      
      setState(prev => ({ ...prev, isPlaying: true }));

      source.onended = () => {
        // Handle end
      };
    }
  };

  // Sync Audio Params with State
  useEffect(() => {
    if (!masterGainRef.current) return;
    
    // Crossfader logic (Equal Power)
    const volA = Math.cos(crossfader * 0.5 * Math.PI) * deckA.volume;
    const volB = Math.sin(crossfader * 0.5 * Math.PI) * deckB.volume;

    if (deckARef.current.gain) deckARef.current.gain.gain.value = volA;
    if (deckBRef.current.gain) deckBRef.current.gain.gain.value = volB;

    if (deckARef.current.eqLow) deckARef.current.eqLow.gain.value = deckA.eqLow;
    if (deckARef.current.eqMid) deckARef.current.eqMid.gain.value = deckA.eqMid;
    if (deckARef.current.eqHigh) deckARef.current.eqHigh.gain.value = deckA.eqHigh;

    if (deckBRef.current.eqLow) deckBRef.current.eqLow.gain.value = deckB.eqLow;
    if (deckBRef.current.eqMid) deckBRef.current.eqMid.gain.value = deckB.eqMid;
    if (deckBRef.current.eqHigh) deckBRef.current.eqHigh.gain.value = deckB.eqHigh;
    
    if (deckARef.current.source) deckARef.current.source.playbackRate.value = deckA.pitch;
    if (deckBRef.current.source) deckBRef.current.source.playbackRate.value = deckB.pitch;

  }, [crossfader, deckA.volume, deckB.volume, deckA.pitch, deckB.pitch, deckA.eqLow, deckA.eqMid, deckA.eqHigh, deckB.eqLow, deckB.eqMid, deckB.eqHigh]);

  // Update Progress
  useEffect(() => {
    const interval = setInterval(() => {
      if (deckA.isPlaying && audioCtxRef.current) {
        setDeckA(prev => ({ ...prev, currentTime: audioCtxRef.current!.currentTime - deckARef.current.startTime }));
      }
      if (deckB.isPlaying && audioCtxRef.current) {
        setDeckB(prev => ({ ...prev, currentTime: audioCtxRef.current!.currentTime - deckBRef.current.startTime }));
      }
    }, 100);
    return () => clearInterval(interval);
  }, [deckA.isPlaying, deckB.isPlaying]);

  const startRecording = () => {
    if (!destinationRef.current) {
      toast.error("Inicie uma música primeiro!");
      return;
    }

    const recorder = new MediaRecorder(destinationRef.current.stream);
    recordingChunksRef.current = [];
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordingChunksRef.current.push(e.data);
    };

    recorder.onstop = async () => {
      setIsSaving(true);
      const blob = new Blob(recordingChunksRef.current, { type: 'audio/webm' });
      const id = `mix_${Date.now()}`;
      
      try {
        await saveMediaLocal(id, blob);
        await saveMetadataLocal({
          id,
          title: `Mixagem ${new Date().toLocaleString()}`,
          artist: "ListenMusic Mixer",
          coverUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400&h=400&fit=crop",
          audioUrl: `local://${id}`,
          source: 'local',
          type: 'audio',
          uploadedBy: 'mixer',
          createdAt: Date.now()
        });
        toast.success("Mixagem gravada e salva na biblioteca!");
      } catch (err) {
        console.error("Save mix error:", err);
        toast.error("Erro ao salvar mixagem.");
      } finally {
        setIsSaving(false);
      }
    };

    recorder.start();
    recorderRef.current = recorder;
    setIsRecording(true);
    toast.info("Gravação iniciada...");
  };

  const stopRecording = () => {
    if (recorderRef.current && isRecording) {
      recorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="p-4 md:p-8 max-w-[1400px] mx-auto min-h-[calc(100vh-120px)] flex flex-col space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
            <Sliders className="w-8 h-8 text-blue-500" />
            Studio de Mixagem
          </h1>
          <p className="text-zinc-500 font-medium">Misture suas músicas favoritas e crie novos sets.</p>
        </div>
        
        <div className="flex gap-2">
          {isRecording ? (
            <Button 
              onClick={stopRecording}
              className="bg-red-600 hover:bg-red-700 text-white font-bold h-12 px-6 rounded-xl shadow-lg shadow-red-600/20 animate-pulse"
            >
              <div className="w-3 h-3 bg-white rounded-full mr-2" />
              Parar Gravação
            </Button>
          ) : (
            <Button 
              onClick={startRecording}
              disabled={isSaving}
              className="bg-zinc-800 hover:bg-zinc-700 text-white font-bold h-12 px-6 rounded-xl border border-white/5"
            >
              <Mic className="w-4 h-4 mr-2" />
              {isSaving ? "Salvando..." : "Gravar Mixagem"}
            </Button>
          )}
        </div>
      </header>

      {/* Mixer Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 flex-1">
        
        {/* Deck A */}
        <div className={cn(
          "lg:col-span-5 bg-zinc-900/50 border rounded-[2rem] p-6 flex flex-col justify-between transition-all duration-500",
          deckA.isPlaying ? "border-blue-500/30 shadow-[0_0_50px_-12px_rgba(59,130,246,0.2)]" : "border-white/5"
        )}>
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div className="bg-blue-500/10 text-blue-500 font-black text-[10px] px-3 py-1 rounded-full border border-blue-500/20 tracking-widest uppercase">
                Deck A
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowLibraryModal({ open: true, side: 'A' })}
                className="rounded-full bg-white/5 hover:bg-white/10"
              >
                <Plus className="w-5 h-5 text-white" />
              </Button>
            </div>

            {deckA.song ? (
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-24 h-24 rounded-2xl overflow-hidden border border-white/10 shadow-2xl shrink-0 transition-transform duration-1000",
                  deckA.isPlaying && "animate-[spin_10s_linear_infinite]"
                )}>
                  <img src={deckA.song.coverUrl} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-white truncate">{deckA.song.title}</h3>
                  <p className="text-zinc-500 truncate">{deckA.song.artist}</p>
                  <div className="mt-2 font-mono text-xs text-blue-500 bg-blue-500/5 px-2 py-1 rounded inline-block">
                    {formatTime(deckA.currentTime)} / {formatTime(deckA.duration)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                <Disc className="w-12 h-12 text-zinc-700" />
                <p className="text-sm text-zinc-500">Selecione uma música</p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Navegação</label>
                <span className="text-[10px] font-mono text-blue-500/50">{formatTime(deckA.currentTime)} / {formatTime(deckA.duration)}</span>
              </div>
              <Slider 
                value={[deckA.currentTime]} 
                min={0} max={deckA.duration || 100} step={0.1} 
                onValueChange={([v]) => handleSeekTo('A', v)}
                className="cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Velocidade (Pitch)</label>
                <Slider 
                  value={[deckA.pitch]} 
                  min={0.5} max={1.5} step={0.01} 
                  onValueChange={([v]) => setDeckA(prev => ({ ...prev, pitch: v }))} 
                />
              </div>
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Master Gain</label>
                <Slider 
                  value={[deckA.volume]} 
                  min={0} max={1.5} step={0.01} 
                  onValueChange={([v]) => setDeckA(prev => ({ ...prev, volume: v }))} 
                />
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-3 h-3 text-blue-500" />
                Equalizador de Precisão (Deck A)
              </label>
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[8px] font-bold text-zinc-500">
                    <span>{deckA.eqLow.toFixed(1)}dB</span>
                    <span className="text-blue-500">LOW</span>
                  </div>
                  <Slider 
                    value={[deckA.eqLow]} 
                    min={-40} max={12} step={0.5} 
                    onValueChange={([v]) => setDeckA(prev => ({ ...prev, eqLow: v }))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[8px] font-bold text-zinc-500">
                    <span>{deckA.eqMid.toFixed(1)}dB</span>
                    <span className="text-blue-500">MID</span>
                  </div>
                  <Slider 
                    value={[deckA.eqMid]} 
                    min={-40} max={12} step={0.5} 
                    onValueChange={([v]) => setDeckA(prev => ({ ...prev, eqMid: v }))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[8px] font-bold text-zinc-500">
                    <span>{deckA.eqHigh.toFixed(1)}dB</span>
                    <span className="text-blue-500">HIGH</span>
                  </div>
                  <Slider 
                    value={[deckA.eqHigh]} 
                    min={-40} max={12} step={0.5} 
                    onValueChange={([v]) => setDeckA(prev => ({ ...prev, eqHigh: v }))}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-8">
            <Button 
              size="lg"
              className={cn(
                "flex-1 h-16 rounded-2xl font-black transition-all",
                deckA.isPlaying ? "bg-zinc-800 text-white" : "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20"
              )}
              onClick={() => toggleDeck('A')}
              disabled={!deckA.song}
            >
              {deckA.isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              <span className="ml-3 uppercase tracking-widest">{deckA.isPlaying ? "Pause" : "Play"}</span>
            </Button>
            
            <div className="w-16 h-16 shrink-0 flex flex-col items-center justify-center bg-zinc-900 rounded-2xl border border-white/5">
               <span className="text-[10px] font-bold text-zinc-500 mb-1">VOL</span>
               <span className="text-xs font-bold text-blue-500">{Math.round(deckA.volume * 100)}%</span>
            </div>
          </div>
        </div>

        {/* Center Faders */}
        <div className="lg:col-span-2 flex flex-col items-center justify-center space-y-8 bg-zinc-900/30 rounded-[2rem] p-6 border border-white/5">
          <div className="flex-1 flex flex-row items-center justify-center gap-8 h-full">
            <div className="flex flex-col items-center gap-4 h-64">
              <span className="text-[8px] font-bold text-blue-500 rotate-90 w-4 tracking-[0.2em]">DECK A</span>
              <div className="h-full flex items-center">
                <Slider 
                  orientation="vertical" 
                  value={[deckA.volume]} 
                  min={0} max={1} step={0.01} 
                  onValueChange={([v]) => setDeckA(prev => ({ ...prev, volume: v }))}
                  className="h-full"
                />
              </div>
            </div>
            <div className="flex flex-col items-center gap-4 h-64">
              <span className="text-[8px] font-bold text-purple-500 rotate-90 w-4 tracking-[0.2em]">DECK B</span>
              <div className="h-full flex items-center">
                <Slider 
                  orientation="vertical" 
                  value={[deckB.volume]} 
                  min={0} max={1} step={0.01} 
                  onValueChange={([v]) => setDeckB(prev => ({ ...prev, volume: v }))}
                  className="h-full"
                />
              </div>
            </div>
          </div>

          <div className="w-full space-y-3">
             <div className="flex justify-between text-[10px] font-black text-zinc-600 tracking-tighter">
                <span>LEFT</span>
                <span>CROSSFADER</span>
                <span>RIGHT</span>
             </div>
             <Slider 
              value={[crossfader]} 
              min={0} max={1} step={0.01} 
              onValueChange={([v]) => setCrossfader(v)} 
             />
          </div>
        </div>

        {/* Deck B */}
        <div className={cn(
          "lg:col-span-5 bg-zinc-900/50 border rounded-[2rem] p-6 flex flex-col justify-between transition-all duration-500",
          deckB.isPlaying ? "border-purple-500/30 shadow-[0_0_50px_-12px_rgba(168,85,247,0.2)]" : "border-white/5"
        )}>
          <div className="space-y-6">
            <div className="flex justify-between items-start">
              <div className="bg-purple-500/10 text-purple-500 font-black text-[10px] px-3 py-1 rounded-full border border-purple-500/20 tracking-widest uppercase">
                Deck B
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setShowLibraryModal({ open: true, side: 'B' })}
                className="rounded-full bg-white/5 hover:bg-white/10"
              >
                <Plus className="w-5 h-5 text-white" />
              </Button>
            </div>

            {deckB.song ? (
              <div className="flex items-center gap-4 flex-row-reverse text-right">
                <div className={cn(
                  "w-24 h-24 rounded-2xl overflow-hidden border border-white/10 shadow-2xl shrink-0 transition-transform duration-1000",
                  deckB.isPlaying && "animate-[spin_10s_linear_infinite]"
                )}>
                  <img src={deckB.song.coverUrl} alt="" className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-xl font-bold text-white truncate">{deckB.song.title}</h3>
                  <p className="text-zinc-500 truncate">{deckB.song.artist}</p>
                  <div className="mt-2 font-mono text-xs text-purple-500 bg-purple-500/5 px-2 py-1 rounded inline-block">
                    {formatTime(deckB.currentTime)} / {formatTime(deckB.duration)}
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-12 border-2 border-dashed border-white/5 rounded-2xl flex flex-col items-center justify-center text-center space-y-4 opacity-50">
                <Disc className="w-12 h-12 text-zinc-700" />
                <p className="text-sm text-zinc-500">Selecione uma música</p>
              </div>
            )}

            <div className="space-y-3">
              <div className="flex justify-between items-center text-right">
                <span className="text-[10px] font-mono text-purple-500/50">{formatTime(deckB.currentTime)} / {formatTime(deckB.duration)}</span>
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Navegação</label>
              </div>
              <Slider 
                value={[deckB.currentTime]} 
                min={0} max={deckB.duration || 100} step={0.1} 
                onValueChange={([v]) => handleSeekTo('B', v)}
                className="cursor-pointer"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-3">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Velocidade (Pitch)</label>
                <Slider 
                  value={[deckB.pitch]} 
                  min={0.5} max={1.5} step={0.01} 
                  onValueChange={([v]) => setDeckB(prev => ({ ...prev, pitch: v }))} 
                />
              </div>
              <div className="space-y-3 text-right">
                <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Master Gain</label>
                <Slider 
                  value={[deckB.volume]} 
                  min={0} max={1.5} step={0.01} 
                  onValueChange={([v]) => setDeckB(prev => ({ ...prev, volume: v }))} 
                />
              </div>
            </div>

            <div className="space-y-4 pt-2">
              <label className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest flex flex-row-reverse items-center gap-2">
                <Activity className="w-3 h-3 text-purple-500" />
                Equalizador de Precisão (Deck B)
              </label>
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[8px] font-bold text-zinc-500">
                    <span className="text-purple-500">LOW</span>
                    <span>{deckB.eqLow.toFixed(1)}dB</span>
                  </div>
                  <Slider 
                    value={[deckB.eqLow]} 
                    min={-40} max={12} step={0.5} 
                    onValueChange={([v]) => setDeckB(prev => ({ ...prev, eqLow: v }))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[8px] font-bold text-zinc-500">
                    <span className="text-purple-500">MID</span>
                    <span>{deckB.eqMid.toFixed(1)}dB</span>
                  </div>
                  <Slider 
                    value={[deckB.eqMid]} 
                    min={-40} max={12} step={0.5} 
                    onValueChange={([v]) => setDeckB(prev => ({ ...prev, eqMid: v }))}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-[8px] font-bold text-zinc-500">
                    <span className="text-purple-500">HIGH</span>
                    <span>{deckB.eqHigh.toFixed(1)}dB</span>
                  </div>
                  <Slider 
                    value={[deckB.eqHigh]} 
                    min={-40} max={12} step={0.5} 
                    onValueChange={([v]) => setDeckB(prev => ({ ...prev, eqHigh: v }))}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-8">
            <div className="w-16 h-16 shrink-0 flex flex-col items-center justify-center bg-zinc-900 rounded-2xl border border-white/5">
               <span className="text-[10px] font-bold text-zinc-500 mb-1">VOL</span>
               <span className="text-xs font-bold text-purple-500">{Math.round(deckB.volume * 100)}%</span>
            </div>

            <Button 
              size="lg"
              className={cn(
                "flex-1 h-16 rounded-2xl font-black transition-all",
                deckB.isPlaying ? "bg-zinc-800 text-white" : "bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-600/20"
              )}
              onClick={() => toggleDeck('B')}
              disabled={!deckB.song}
            >
              {deckB.isPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6" />}
              <span className="ml-3 uppercase tracking-widest">{deckB.isPlaying ? "Pause" : "Play"}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Library Modal */}
      <AnimatePresence>
        {showLibraryModal.open && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-zinc-900 border border-white/10 rounded-[2rem] w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden shadow-2xl"
            >
              <div className="p-6 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-white">Selecionar para Deck {showLibraryModal.side}</h2>
                  <p className="text-xs text-zinc-500">Apenas arquivos locais suportados para mixagem</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowLibraryModal({ open: false, side: 'A' })}>
                  <X className="w-5 h-5" />
                </Button>
              </div>

              <div className="overflow-y-auto p-4 flex-1 space-y-2">
                {isLoadingLibrary ? (
                  <div className="flex flex-col items-center justify-center py-20 text-zinc-500">
                    <Loader2 className="w-8 h-8 animate-spin mb-4" />
                    <p>Buscando sua biblioteca...</p>
                  </div>
                ) : library.length === 0 ? (
                  <div className="text-center py-20 text-zinc-500">
                    <Music className="w-12 h-12 mx-auto mb-4 opacity-20" />
                    <p>Nenhuma música local encontrada.</p>
                    <p className="text-xs mt-2">Faça upload de arquivos MP3 primeiro.</p>
                  </div>
                ) : (
                  library.map((song) => (
                    <button
                      key={song.id}
                      onClick={() => loadSongToDeck(song, showLibraryModal.side)}
                      className="w-full flex items-center gap-4 p-3 rounded-xl hover:bg-white/5 transition-colors text-left group"
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-white/10">
                        <img src={song.coverUrl} className="w-full h-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-white font-bold truncate group-hover:text-blue-400 transition-colors">{song.title}</h4>
                        <p className="text-xs text-zinc-500 truncate">{song.artist}</p>
                      </div>
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="bg-blue-500/20 text-blue-400 text-[10px] font-black px-2 py-1 rounded">CARREGAR</div>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
