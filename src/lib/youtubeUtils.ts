/**
 * Utility functions to sanitize YouTube URLs and remove ads/tracking parameters.
 * Uses YouTube's privacy-enhanced domain (youtube-nocookie.com) in embed mode,
 * which disables advertising cookies, targeting tokens, and profile tracking.
 */

// Regular expression to match all YouTube video ID variations
const YOUTUBE_REGEX = /(?:youtu\.be\/|youtube(?:-nocookie|education)?\.com\/(?:embed\/|v\/|watch\/|watch\?v=|watch\?.+&v=|shorts\/|live\/))([\w-]{11})/;

/**
 * Extracts an 11-character YouTube video ID from any YouTube URL format.
 */
export function extractYouTubeVideoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  const match = trimmed.match(YOUTUBE_REGEX);
  if (match && match[1] && match[1].length === 11) {
    return match[1];
  }
  // If user pasted only the 11-character video ID directly
  if (/^[\w-]{11}$/.test(trimmed)) {
    return trimmed;
  }
  return null;
}

/**
 * Checks if a URL or string corresponds to a YouTube video.
 */
export function isYouTubeUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return /youtu\.be|youtube\.com|youtube-nocookie\.com/.test(url) || extractYouTubeVideoId(url) !== null;
}

/**
 * Checks if a URL contains known advertising or tracking query parameters.
 */
export function hasAdOrTrackingParams(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  return /[?&](si|pp|feature|ab_channel|attribution_tag|fbclid|gclid)=/i.test(url);
}

/**
 * Transforms any YouTube URL into an ad-stripped, privacy-enhanced nocookie embed URL.
 * Example: https://www.youtube.com/watch?v=dQw4w9WgXcQ&si=123 -> https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ
 */
export function getCleanNoAdYouTubeUrl(input: string): string {
  const videoId = extractYouTubeVideoId(input);
  if (videoId) {
    return `https://www.youtube-nocookie.com/embed/${videoId}`;
  }
  return input;
}

/**
 * Sanitizes a YouTube input URL and returns status information.
 */
export function sanitizeYouTubeInput(url: string): {
  cleanUrl: string;
  videoId: string | null;
  hadTracking: boolean;
  isValid: boolean;
} {
  const videoId = extractYouTubeVideoId(url);
  const hadTracking = hasAdOrTrackingParams(url);
  
  if (!videoId) {
    return {
      cleanUrl: url,
      videoId: null,
      hadTracking: false,
      isValid: false
    };
  }

  return {
    cleanUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    videoId,
    hadTracking,
    isValid: true
  };
}
