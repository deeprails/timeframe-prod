import { useRef, useState } from "react";

// TUNE THESE TO YOUR LIKING:
const BASE_WPM = 165;           // baseline speaking pace
const AVG_CHARS_PER_WORD = 5;   // heuristic for timing
const MAX_VISIBLE_CHARS = 150;  // rolling window size (e.g., 120–200 works well)
const SENTENCE_PAUSE_MS = 450;  // pause after . ! ? …
const CLAUSE_PAUSE_MS = 220;    // pause after , ; :

export default function useTextDisplay(speakingText: React.RefObject<string>, onTextAnimationEnd: (type: 'textAnimation' | 'videoStream') => void) {
  const revealAbortRef = useRef<{ aborted: boolean }>({ aborted: false });
  const [transcription, setTranscription] = useState<string | null>(null)

  // helpers
  const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));
  const isSentenceEnd = (t: string) => /[.!?…]\s*$/.test(t);
  const isClauseEnd = (t: string) => /[,;:]\s*$/.test(t);

  // per-word delay based on length (closer to speech rate than fixed 300ms)
  function wordDelayMs(word: string, wpm = BASE_WPM) {
    // words per minute -> chars per second -> per-word time
    const cps = (wpm * AVG_CHARS_PER_WORD) / 60;  // chars/sec
    const secs = Math.max(0.06, word.length / cps); // min cap
    return Math.round(secs * 1000);
  }

  // rolling buffer (keeps last N chars)
  function pushRolling(prev: string, nextChunk: string, maxChars = MAX_VISIBLE_CHARS) {
    const combined = (prev ? prev + ' ' : '') + nextChunk;
    if (combined.length <= maxChars) return combined;
    // CLEAR and start filling again with nextChunk (your requirement)
    return nextChunk;
  }

  // 🔄 NEW: pacing-aware reveal that respects punctuation + rolling window
  async function revealSpokenText(fullText: string) {
    revealAbortRef.current.aborted = false;
    setTranscription(''); // reset
    if (!fullText || !fullText.trim()) return;

    // split on whitespace but keep punctuation attached to words
    const words = fullText.trim().split(/\s+/);
    let visible = '';

    for (let i = 0; i < words.length; i++) {
      if (revealAbortRef.current.aborted) return;

      const w = words[i];

      // show this word with rolling window
      visible = pushRolling(visible, w, MAX_VISIBLE_CHARS);
      setTranscription(visible);

      // base delay scaled by word length
      let delay = wordDelayMs(w);

      // add natural pauses when word ends a clause/sentence
      if (isSentenceEnd(w)) delay += SENTENCE_PAUSE_MS;
      else if (isClauseEnd(w)) delay += CLAUSE_PAUSE_MS;

      await sleep(delay);
    }
  }

  function onStartSpeaking() {
    // cancel any previous reveal
    revealAbortRef.current.aborted = true;

    // start a new reveal pass
    const text = speakingText.current || '';
    revealSpokenText(text)
      .then(() => onTextAnimationEnd("textAnimation"))
      .catch(console.error);
  }


  return {
    transcription,
    setTranscription,
    onStartSpeaking
  }
}
