import { useState, useCallback, useRef } from 'react';

// Extend Window interface for SpeechRecognition since it's non-standard
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

export interface UseVoiceToDSLResult {
  isListening: boolean;
  transcript: string;
  error: string | null;
  startListening: () => void;
  stopListening: () => void;
  reset: () => void;
}

export function useVoiceToDSL(
  onFinalTranscript: (transcript: string) => void
): UseVoiceToDSLResult {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<any>(null);

  const initRecognition = useCallback(() => {
    if (recognitionRef.current) return recognitionRef.current;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      setError('Speech recognition is not supported in this browser.');
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false; // Stop when the user stops speaking
    recognition.interimResults = true; // Show words as they are spoken
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error', event.error);
      setIsListening(false);
      
      if (event.error === 'not-allowed') {
        setError('Microphone access denied. Please check your browser permissions.');
      } else if (event.error === 'no-speech') {
         // Harmless timeout, just stop listening.
      } else {
        setError(`Speech recognition encountered an error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      // We do NOT trigger onFinalTranscript here because `onend` triggers even if nothing was said.
      // We handle the final dispatch in `onresult`.
    };

    recognition.onresult = (event: any) => {
      let interimTranscript = '';
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      const currentText = finalTranscript || interimTranscript;
      setTranscript(currentText);

      // If we got a final result, dispatch it to the parent and stop.
      if (finalTranscript) {
        onFinalTranscript(finalTranscript.trim());
      }
    };

    recognitionRef.current = recognition;
    return recognitionRef.current;
  }, [onFinalTranscript]);

  const startListening = useCallback(() => {
    const recognition = initRecognition();
    if (recognition && !isListening) {
      setTranscript('');
      setError(null);
      try {
        recognition.start();
      } catch (e) {
        console.error("Could not start recognition", e);
      }
    }
  }, [initRecognition, isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  const reset = useCallback(() => {
    setTranscript('');
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    error,
    startListening,
    stopListening,
    reset
  };
}
