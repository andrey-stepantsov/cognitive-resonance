import { useState, useEffect, useRef, useCallback } from 'react';

export interface MultiplayerMessage {
  type: 'chat' | 'cursor' | 'rtc' | 'ping' | 'presence';
  payload?: any;
  timestamp?: number;
  senderId?: string;
}

export interface UseMultiplayerSyncOptions {
  workerUrl: string; // e.g. "api.my-domain.workers.dev" or local "localhost:8787"
  sessionId: string;
  token?: string;
}

export function useMultiplayerSync({ workerUrl, sessionId, token }: UseMultiplayerSyncOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const [activeUsers, setActiveUsers] = useState<Record<string, { userId?: string; sessionId: string }>>({});
  const [messages, setMessages] = useState<MultiplayerMessage[]>([]);
  const [cursors, setCursors] = useState<Record<string, {x: number, y: number}>>({});
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    // Determine wss:// vs ws://
    const isLocal = workerUrl.includes('localhost') || workerUrl.includes('127.0.0.1');
    const protocol = isLocal ? 'ws' : 'wss';
    // Strip trailing slashes and any existing http(s) protocol prefix
    const cleanWorkerUrl = workerUrl.replace(/\/$/, '').replace(/^https?:\/\//, '');
    let wsUrl = `${protocol}://${cleanWorkerUrl}/room/${sessionId}`;
    if (token) {
      wsUrl += `?token=${encodeURIComponent(token)}`;
    }
    
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      
      // Ping keep-alive every 30s to prevent Cloudflare/browser from dropping idle connection
      pingIntervalRef.current = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'ping' }));
        }
      }, 30000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
          case 'chat':
            setMessages(prev => [...prev, data]);
            break;
          case 'cursor':
            if (data.senderId) {
              setCursors(prev => ({
                ...prev,
                [data.senderId]: data.payload
              }));
            }
            break;
          case 'rtc':
             // RTC signaling is left for the specific Voice/Video component to observe
             // For now we just push it to messages array to make it observable
            setMessages(prev => [...prev, data]);
            break;
          case 'presence':
            if (data.payload.action === 'sync') {
              const usersMap: Record<string, any> = {};
              if (Array.isArray(data.payload.users)) {
                data.payload.users.forEach((u: any) => { usersMap[u.sessionId] = u; });
              }
              setActiveUsers(usersMap);
            } else if (data.payload.action === 'join') {
              setActiveUsers(prev => ({ ...prev, [data.payload.sessionId]: { userId: data.payload.userId, sessionId: data.payload.sessionId } }));
            } else if (data.payload.action === 'leave') {
               setActiveUsers(prev => {
                  const next = { ...prev };
                  delete next[data.payload.sessionId];
                  return next;
               });
            }
            break;
        }
      } catch (err) {
        // ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      
      // Reconnect with basic 3s backoff
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 3000);
    };

    ws.onerror = () => {
      // browser will fire onclose immediately after onerror usually
    };

  }, [workerUrl, sessionId, token]);

  useEffect(() => {
    if (!sessionId || !workerUrl) return;
    
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional unmount
        wsRef.current.close();
      }
    };
  }, [connect, sessionId, workerUrl, token]);

  const sendMessage = useCallback((type: MultiplayerMessage['type'], payload?: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  const sendCursor = useCallback((x: number, y: number) => {
    sendMessage('cursor', { x, y });
  }, [sendMessage]);

  const sendChatMessage = useCallback((content: string, metadata?: any) => {
    sendMessage('chat', { content, ...metadata });
    // Optimistically add our own message to state so it renders instantly
    // The DO worker won't echo our own messages back to us.
    setMessages(prev => [...prev, {
        type: 'chat',
        payload: { content, ...metadata },
        timestamp: Date.now(),
        senderId: 'me' // Local client placeholder
    }]);
  }, [sendMessage]);

  const sendRtcSignal = useCallback((signal: any) => {
    sendMessage('rtc', signal);
  }, [sendMessage]);

  return {
    isConnected,
    activeUsers,
    messages,
    cursors,
    sendCursor,
    sendChatMessage,
    sendRtcSignal,
  };
}
