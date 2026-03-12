import { renderHook, act } from '@testing-library/react';
import { useVoiceToDSL } from '../hooks/useVoiceToDSL';
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('useVoiceToDSL', () => {
  let mockSpeechRecognition: any;
  let mockRecognitionInstance: any;

  beforeEach(() => {
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
    expect(result.current.error).toBe('Microphone access denied. Please check your browser permissions.');
  });
});
