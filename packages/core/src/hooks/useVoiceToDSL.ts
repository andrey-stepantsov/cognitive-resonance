import { useState, useCallback, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

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
  mediaStream: MediaStream | null;
  acquireMediaStream: () => Promise<MediaStream | null>;
  releaseMediaStream: () => void;
}

export function useVoiceToDSL(
  onFinalTranscript: (transcript: string) => void
): UseVoiceToDSLResult {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const recognitionRef = useRef<any>(null);

  const acquireMediaStream = useCallback(async () => {
    if (mediaStream) return mediaStream;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMediaStream(stream);
      return stream;
    } catch (err: any) {
      setError(`Could not access microphone for media stream: ${err.message || err}`);
      return null;
    }
  }, [mediaStream]);

  const releaseMediaStream = useCallback(() => {
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      setMediaStream(null);
    }
  }, [mediaStream]);

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

  const startListening = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      if (isListening) return;
      try {
        const { speechRecognition } = await SpeechRecognition.checkPermissions();
        if (speechRecognition !== 'granted') {
          const req = await SpeechRecognition.requestPermissions();
          if (req.speechRecognition !== 'granted') {
             setError('Microphone access denied for speech recognition.');
             return;
          }
        }
        
        setError(null);
        setTranscript('');
        setIsListening(true);
        
        const listener = await SpeechRecognition.addListener('partialResults', (data: { matches: string[] }) => {
           if (data.matches && data.matches.length > 0) {
              setTranscript(data.matches[0]);
           }
        });

        const res = await SpeechRecognition.start({ language: "en-US", maxResults: 1, partialResults: true, popup: false });
        
        if (res && res.matches && res.matches.length > 0) {
           const final = res.matches[0];
           setTranscript(final);
           onFinalTranscript(final.trim());
        }
        
        setIsListening(false);
        listener.remove();
        
      } catch (e: any) {
        console.error(e);
        setError(e.message || 'Error starting native speech recognition');
        setIsListening(false);
      }
      return;
    }

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
  }, [initRecognition, isListening, onFinalTranscript]);

  const stopListening = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      if (isListening) {
        try {
          await SpeechRecognition.stop();
        } catch(e) {}
        setIsListening(false);
      }
      return;
    }

    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  useEffect(() => {
     return () => {
       if (Capacitor.isNativePlatform() && isListening) {
          SpeechRecognition.stop().catch(() => {});
       }
     };
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
    reset,
    mediaStream,
    acquireMediaStream,
    releaseMediaStream
  };
}
