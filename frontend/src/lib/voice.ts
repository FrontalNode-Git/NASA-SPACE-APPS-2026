/** Optional voice input through the Web Speech API. Absent in some browsers: callers must check. */

interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type RecognitionCtor = new () => RecognitionLike;

function ctor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function voiceSupported(): boolean {
  return ctor() !== null;
}

/** Listen for one phrase. Returns a stop function. Never throws. */
export function listenOnce(handlers: {
  onPhrase: (phrase: string) => void;
  onError: () => void;
  onEnd: () => void;
}): () => void {
  const Recognition = ctor();
  if (!Recognition) {
    handlers.onError();
    handlers.onEnd();
    return () => undefined;
  }
  try {
    const rec = new Recognition();
    rec.lang = 'en-US';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event) => {
      const phrase = event.results[0]?.[0]?.transcript;
      if (phrase) handlers.onPhrase(phrase);
    };
    rec.onerror = () => handlers.onError();
    rec.onend = () => handlers.onEnd();
    rec.start();
    return () => rec.stop();
  } catch {
    handlers.onError();
    handlers.onEnd();
    return () => undefined;
  }
}
