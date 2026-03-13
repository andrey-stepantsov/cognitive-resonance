import { renderHook, act, waitFor } from '@testing-library/react';
import { useVoiceToDSL } from '../hooks/useVoiceToDSL';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Capacitor } from '@capacitor/core';
import { SpeechRecognition } from '@capacitor-community/speech-recognition';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(),
  }
}));

vi.mock('@capacitor-community/speech-recognition', () => ({
  SpeechRecognition: {
    checkPermissions: vi.fn(),
    requestPermissions: vi.fn(),
    start: vi.fn(),
    stop: vi.fn().mockResolvedValue(undefined),
    addListener: vi.fn(),
  }
}));

describe('useVoiceToDSL', () => {
  let mockSpeechRecognition: any;
  let mockRecognitionInstance: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Default to web
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);

    // Reset window objects
    delete (window as any).SpeechRecognition;
    delete (window as any).webkitSpeechRecognition;

    mockRecognitionInstance = {
      start: vi.fn(),
      stop: vi.fn(),
      continuous: false,
      interimResults: false,
      lang: 'en-US'
    };

    mockSpeechRecognition = vi.fn().mockImplementation(function() { return mockRecognitionInstance; });
  });

  it('fails gracefully if SpeechRecognition is not supported', () => {
    const onFinalTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceToDSL(onFinalTranscript));

    act(() => {
      result.current.startListening();
    });

    expect(result.current.error).toBe('Speech recognition is not supported in this browser.');
    expect(result.current.isListening).toBe(false);
  });

  it('starts listening when supported', () => {
    (window as any).SpeechRecognition = mockSpeechRecognition;
    const onFinalTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceToDSL(onFinalTranscript));

    act(() => {
      result.current.startListening();
    });

    expect(mockRecognitionInstance.start).toHaveBeenCalled();
    
    // Simulate the onstart event that the browser fires
    act(() => {
      mockRecognitionInstance.onstart();
    });

    expect(result.current.isListening).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('handles results and calls onFinalTranscript', () => {
    (window as any).webkitSpeechRecognition = mockSpeechRecognition;
    const onFinalTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceToDSL(onFinalTranscript));

    act(() => {
      result.current.startListening();
      mockRecognitionInstance.onstart();
    });

    // Simulate speech result
    act(() => {
      const mockEvent = {
        resultIndex: 0,
        results: [
          [{ transcript: 'Start a new session' }]
        ]
      };
      (mockEvent.results[0] as any).isFinal = true;
      mockRecognitionInstance.onresult(mockEvent);
    });

    expect(result.current.transcript).toBe('Start a new session');
    expect(onFinalTranscript).toHaveBeenCalledWith('Start a new session');
  });

  it('handles errors correctly', () => {
    (window as any).SpeechRecognition = mockSpeechRecognition;
    const onFinalTranscript = vi.fn();
    const { result } = renderHook(() => useVoiceToDSL(onFinalTranscript));

    act(() => {
      result.current.startListening();
      mockRecognitionInstance.onstart();
    });

    // Simulate error
    act(() => {
      mockRecognitionInstance.onerror({ error: 'not-allowed' });
    });

    expect(result.current.isListening).toBe(false);
  });

  describe('Capacitor Native Flow', () => {
    beforeEach(() => {
      vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    });

    it('handles native permission denial', async () => {
      vi.mocked(SpeechRecognition.checkPermissions).mockResolvedValue({ speechRecognition: 'prompt' });
      vi.mocked(SpeechRecognition.requestPermissions).mockResolvedValue({ speechRecognition: 'denied' });
      
      const onFinalTranscript = vi.fn();
      const { result } = renderHook(() => useVoiceToDSL(onFinalTranscript));

      await act(async () => {
        await result.current.startListening();
      });

      expect(result.current.error).toBe('Microphone access denied for speech recognition.');
    });

    it('handles native speech recognition flow', async () => {
      vi.mocked(SpeechRecognition.checkPermissions).mockResolvedValue({ speechRecognition: 'granted' });
      
      let emitPartial: any = null;
      vi.mocked(SpeechRecognition.addListener).mockImplementation(async (event, callback) => {
         if (event === 'partialResults') emitPartial = callback;
         return { remove: vi.fn() };
      });

      vi.mocked(SpeechRecognition.start).mockResolvedValue({ matches: ['Final transcript'] });

      const onFinalTranscript = vi.fn();
      const { result } = renderHook(() => useVoiceToDSL(onFinalTranscript));

      await act(async () => {
        await result.current.startListening();
      });

      // It should have called start and set transcript
      expect(SpeechRecognition.start).toHaveBeenCalled();
      expect(onFinalTranscript).toHaveBeenCalledWith('Final transcript');
    });

    it('handles native stop Listening', async () => {
      vi.mocked(SpeechRecognition.checkPermissions).mockResolvedValue({ speechRecognition: 'granted' });
      vi.mocked(SpeechRecognition.start).mockImplementation(() => new Promise(() => {})); // Block forever
      vi.mocked(SpeechRecognition.addListener).mockResolvedValue({ remove: vi.fn() });

      const onFinalTranscript = vi.fn();
      const { result } = renderHook(() => useVoiceToDSL(onFinalTranscript));

      // Fire and forget start to get it into listening state
      act(() => {
         result.current.startListening();
      });

      await waitFor(() => {
        expect(result.current.isListening).toBe(true);
      });

      await act(async () => {
        await result.current.stopListening();
      });

      expect(SpeechRecognition.stop).toHaveBeenCalled();
      expect(result.current.isListening).toBe(false);
    });
  });
});
