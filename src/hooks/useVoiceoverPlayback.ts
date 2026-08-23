import { useEffect, useState } from 'react';
import { AudioCatalogHelper } from '../helpers';

/** Plays one or more clip URLs back to back; `isPlaying` stays true for the whole sequence. */
export function useVoiceoverPlayback() {
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => () => { AudioCatalogHelper.stop(); }, []);

  const playSequence = (urls: string[]) => {
    const queue = urls.filter(Boolean);
    if (queue.length === 0) { setIsPlaying(false); return; }

    setIsPlaying(true);
    const playNext = (idx: number) => {
      if (idx >= queue.length) { setIsPlaying(false); return; }
      AudioCatalogHelper.play(queue[idx], () => playNext(idx + 1));
    };
    playNext(0);
  };

  return { isPlaying, playSequence };
}
