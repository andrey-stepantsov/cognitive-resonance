import { useEffect, useRef, useState } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface IntercomProps {
  activeUsers: Record<string, { userId?: string; sessionId: string }>;
  localSessionId: string | null;
  onSignal: (cb: (data: any) => void) => () => void;
  sendSignal: (targetUserId: string, signalData: any) => void;
  mediaStream: MediaStream | null;
  acquireMediaStream: () => Promise<MediaStream | null>;
  releaseMediaStream: () => void;
}

export function Intercom({ activeUsers, localSessionId, onSignal, sendSignal, mediaStream, acquireMediaStream, releaseMediaStream }: IntercomProps) {
  const [isActive, setIsActive] = useState(false);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});

  useEffect(() => {
    if (!isActive || !localSessionId) return;

    // Handle incoming signals
    const unsubscribe = onSignal(async (data: any) => {
      const parentPayload = data.payload || data;
      const { targetUserId, signalData } = parentPayload;
      const senderId = data.senderId;
      if (!senderId || !signalData) return;

      let pc = peersRef.current.get(senderId);
      if (!pc) {
        pc = createPeerConnection(senderId);
      }

      if (signalData.type === 'offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signalData));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendSignal(senderId, pc.localDescription);
      } else if (signalData.type === 'answer') {
        await pc.setRemoteDescription(new RTCSessionDescription(signalData));
      } else if (signalData.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signalData));
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isActive, localSessionId, onSignal, sendSignal, mediaStream]);

  useEffect(() => {
    if (!isActive || !localSessionId) return;

    // Connect to new users we haven't connected to yet
    for (const [peerId, user] of Object.entries(activeUsers)) {
      if (peerId === localSessionId) continue;
      
      if (!peersRef.current.has(peerId)) {
        // We act as initiator if our ID is "greater"
        if (localSessionId > peerId) {
          const pc = createPeerConnection(peerId);
          pc.createOffer().then(offer => {
            return pc.setLocalDescription(offer);
          }).then(() => {
            sendSignal(peerId, pc.localDescription);
          }).catch(console.error);
        }
      }
    }
  }, [activeUsers, isActive, localSessionId, sendSignal, mediaStream]);

  const createPeerConnection = (peerId: string) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    });

    if (mediaStream) {
      mediaStream.getTracks().forEach(track => pc.addTrack(track, mediaStream));
    }

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(peerId, event.candidate);
      }
    };

    pc.ontrack = (event) => {
      setRemoteStreams(prev => ({ ...prev, [peerId]: event.streams[0] }));
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        peersRef.current.delete(peerId);
        setRemoteStreams(prev => {
          const next = { ...prev };
          delete next[peerId];
          return next;
        });
      }
    };

    peersRef.current.set(peerId, pc);
    return pc;
  };

  const toggleIntercom = async () => {
    if (isActive) {
      peersRef.current.forEach(pc => pc.close());
      peersRef.current.clear();
      setRemoteStreams({});
      releaseMediaStream();
      setIsActive(false);
    } else {
      await acquireMediaStream();
      setIsActive(true);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button 
        onClick={toggleIntercom}
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium transition-all border",
          isActive 
            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-sm" 
            : "bg-zinc-800/50 text-zinc-400 border-zinc-700/30 hover:border-zinc-500 hover:text-zinc-300"
        )}
        title={isActive ? "Voice Intercom Active" : "Join Voice Intercom"}
      >
        {isActive ? <Phone className="w-3 h-3 animate-pulse" /> : <PhoneOff className="w-3 h-3" />}
        <span className="hidden sm:inline">Intercom</span>
      </button>

      {Object.entries(remoteStreams).map(([peerId, stream]) => (
        <audio 
          key={peerId}
          autoPlay
          ref={el => {
            if (el && el.srcObject !== stream) {
              el.srcObject = stream;
            }
          }}
          className="hidden"
        />
      ))}
    </div>
  );
}
