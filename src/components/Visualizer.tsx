import { useRef, useEffect } from 'react';
import { cn } from '@/src/lib/utils';

export type VisualizerStyle = 'spectrum' | 'lightning' | 'circles' | 'bars' | 'wave' | 'particles';

interface VisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
  className?: string;
  style?: VisualizerStyle;
}

export function Visualizer({ analyser, isPlaying, className, style = 'spectrum' }: VisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !analyser) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
    };

    window.addEventListener('resize', resizeCanvas);
    resizeCanvas();

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const timeDataArray = new Uint8Array(bufferLength);

    const draw = () => {
      animationRef.current = requestAnimationFrame(draw);
      
      analyser.getByteFrequencyData(dataArray);
      analyser.getByteTimeDomainData(timeDataArray);

      const width = canvas.width / (window.devicePixelRatio || 1);
      const height = canvas.height / (window.devicePixelRatio || 1);
      const centerY = height / 2;

      // Clear with different persistence for different styles
      if (style === 'lightning') {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.clearRect(0, 0, width, height);
      }
      
      if (!isPlaying) {
        // Simple idle line
        ctx.beginPath();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.moveTo(0, centerY);
        ctx.lineTo(width, centerY);
        ctx.stroke();
        return;
      }

      switch (style) {
        case 'spectrum': {
          const barCount = 100; 
          const barPadding = 1;
          const barWidth = (width / barCount) - barPadding;
          for (let i = 0; i < barCount; i++) {
            const freqIndex = Math.floor((i / barCount) * (bufferLength / 1.5));
            const v = dataArray[freqIndex] / 255.0;
            const barHeight = v * height * 1.2;
            if (barHeight > 2) {
              const percent = i / barCount;
              let color;
              if (percent < 0.2) color = `hsla(20, 100%, 55%, 0.9)`;
              else if (percent < 0.4) color = `hsla(45, 100%, 50%, 0.9)`;
              else if (percent < 0.6) color = `hsla(320, 100%, 65%, 0.9)`;
              else if (percent < 0.8) color = `hsla(190, 100%, 55%, 0.9)`;
              else color = `hsla(210, 100%, 70%, 0.9)`;
              ctx.fillStyle = color;
              ctx.shadowBlur = 15;
              ctx.shadowColor = color;
              const x = i * (barWidth + barPadding);
              const y = centerY - barHeight / 2;
              ctx.fillRect(x, y, barWidth, barHeight);
              if (v > 0.5) {
                ctx.fillStyle = '#fff';
                ctx.globalAlpha = 0.5;
                ctx.fillRect(x + barWidth / 4, y, barWidth / 2, barHeight);
                ctx.globalAlpha = 1.0;
              }
            }
          }
          break;
        }

        case 'lightning': {
          const sliceWidth = width / (bufferLength / 2);
          ctx.beginPath();
          ctx.lineWidth = 1.5;
          ctx.lineJoin = 'round';
          const flicker = Math.random() > 0.8 ? 1 : 0.6 + Math.random() * 0.4;
          ctx.strokeStyle = `rgba(0, 242, 255, ${flicker})`;
          ctx.shadowBlur = 20 * flicker;
          ctx.shadowColor = '#00f2ff';
          let lx = 0;
          ctx.moveTo(0, centerY);
          for (let i = 0; i < bufferLength / 2; i++) {
            const v = dataArray[i] / 255.0;
            const jitter = (Math.random() - 0.5) * 15;
            const y = centerY + (v * height * (i % 2 === 0 ? 1 : -1)) + jitter;
            ctx.lineTo(lx, y);
            lx += sliceWidth;
          }
          ctx.stroke();
          break;
        }

        case 'wave': {
          ctx.beginPath();
          ctx.lineWidth = 2;
          ctx.strokeStyle = '#00ffcc';
          ctx.shadowBlur = 10;
          ctx.shadowColor = '#00ffcc';
          const sliceWidth = width / bufferLength;
          let wx = 0;
          for (let i = 0; i < bufferLength; i++) {
            const v = timeDataArray[i] / 128.0;
            const y = v * centerY;
            if (i === 0) ctx.moveTo(wx, y);
            else ctx.lineTo(wx, y);
            wx += sliceWidth;
          }
          ctx.lineTo(width, centerY);
          ctx.stroke();
          break;
        }

        case 'circles': {
          const centerX = width / 2;
          const maxRadius = Math.min(width, height) / 3;
          for (let i = 0; i < 3; i++) {
            const freqIndex = Math.floor(i * 10);
            const v = dataArray[freqIndex] / 255.0;
            ctx.beginPath();
            ctx.arc(centerX, centerY, maxRadius * v + (i * 10), 0, Math.PI * 2);
            ctx.strokeStyle = `hsla(${200 + i * 40}, 100%, 60%, 0.8)`;
            ctx.lineWidth = 2 + v * 10;
            ctx.shadowBlur = 15;
            ctx.shadowColor = ctx.strokeStyle;
            ctx.stroke();
          }
          break;
        }

        case 'bars': {
          const barsCount = 32;
          const fullBarWidth = width / barsCount;
          for (let i = 0; i < barsCount; i++) {
            const v = dataArray[i * 4] / 255.0;
            const bHeight = v * height * 0.8;
            const bx = i * fullBarWidth;
            const gradient = ctx.createLinearGradient(bx, centerY - bHeight, bx, centerY + bHeight);
            gradient.addColorStop(0, '#ff00cc');
            gradient.addColorStop(1, '#3333ff');
            ctx.fillStyle = gradient;
            ctx.fillRect(bx + 2, centerY - bHeight, fullBarWidth - 4, bHeight * 2);
          }
          break;
        }

        case 'particles': {
          // Abstract digital rain style
          for (let i = 0; i < 40; i++) {
            const freq = dataArray[i * 5] / 255.0;
            const px = (i / 40) * width;
            const pHeight = freq * height;
            ctx.fillStyle = `rgba(255, 255, 255, ${freq * 0.5})`;
            ctx.fillRect(px, centerY - pHeight / 2, 2, pHeight);
          }
          break;
        }
      }
    };

    draw();

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isPlaying, style]);

  return (
    <canvas 
      ref={canvasRef} 
      className={cn("w-full h-full", className)}
    />
  );
}
