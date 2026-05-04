import { useState, useEffect } from 'react';
import { getMediaLocal } from '@/src/lib/localDb';

interface LocalImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src?: string;
  fallback?: React.ReactNode;
}

export function LocalImage({ src, fallback, ...props }: LocalImageProps) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!src) return;

    if (src.startsWith('local://')) {
      const loadLocal = async () => {
        try {
          const id = src.replace('local://', '');
          const blob = await getMediaLocal(id);
          if (blob) {
            const url = URL.createObjectURL(blob);
            setObjectUrl(url);
            setError(false);
          } else {
            setError(true);
          }
        } catch (err) {
          console.error("LocalImage resolution failed:", err);
          setError(true);
        }
      };
      loadLocal();
    } else {
      setObjectUrl(src);
      setError(false);
    }

    return () => {
      if (src?.startsWith('local://') && objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  if ((!src || error) && fallback) {
    return <>{fallback}</>;
  }

  return (
    <img 
      src={objectUrl || undefined} 
      {...props} 
      onError={() => setError(true)}
    />
  );
}
