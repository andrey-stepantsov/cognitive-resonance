import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Save, FileText, CornerDownRight, Maximize2, Minimize2 } from 'lucide-react';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

import { useMultiplayerSync } from '@cr/core';

interface ArtifactEditorProps {
  filename: string;
  initialContent: string;
  onSave: (filename: string, content: string, commitMessage: string, scope: 'session' | 'global') => Promise<void>;
  onSync?: (scope: 'session' | 'global') => Promise<void>;
  sessionId?: string; // Phase 3: Multiplayer Edge
}

export function ArtifactEditor({ filename, initialContent, onSave, onSync, sessionId }: ArtifactEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [commitMessage, setCommitMessage] = useState(`Update ${filename}`);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scope, setScope] = useState<'session' | 'global'>('session');

  // Multiplayer Hook
  const { isConnected, cursors, sendCursor } = useMultiplayerSync({
    workerUrl: (import.meta as any).env?.VITE_CLOUDFLARE_WORKER_URL || 'localhost:8787',
    sessionId: sessionId || 'default-room'
  });

  useEffect(() => {
    setHasChanges(content !== initialContent);
  }, [content, initialContent]);

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isConnected) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    sendCursor(x, y);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(filename, content, commitMessage || `Update ${filename}`, scope);
      setHasChanges(false);
    } catch(err) {
      console.error('Failed to save artifact', err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      {isFullscreen && (
        <div 
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" 
          onClick={() => setIsFullscreen(false)} 
        />
      )}
      <div className={cn(
        "flex flex-col bg-[#0a0a0a] border border-zinc-800 overflow-hidden shadow-2xl transition-all duration-200",
        isFullscreen 
          ? "fixed inset-2 md:inset-8 z-50 rounded-xl" 
          : "h-full w-full rounded-xl relative"
      )}>
        {/* Scope Toggle Bar */}
        <div className="flex items-center px-4 py-1.5 bg-zinc-950 border-b border-zinc-800 gap-2">
           <button
             onClick={() => setScope('session')}
             className={cn("text-xs font-medium px-2 py-1 rounded transition-colors", scope === 'session' ? 'bg-indigo-500/20 text-indigo-300' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800')}
           >
             Session Workspace
           </button>
           <button
             onClick={() => setScope('global')}
             className={cn("text-xs font-medium px-2 py-1 rounded transition-colors", scope === 'global' ? 'bg-emerald-500/20 text-emerald-300' : 'text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800')}
           >
             Global Workspace
           </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-y-2 px-4 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0 relative overflow-hidden">
          {/* subtle indicator for connection status */}
          <div className={cn(
            "absolute top-0 right-0 h-0.5 w-full bg-gradient-to-r",
            isConnected ? "from-emerald-500/0 via-emerald-500/20 to-emerald-500/0 opacity-100" : "opacity-0"
          )} />
          
          <div className="flex items-center gap-2 text-zinc-300 min-w-0 pr-2">
            <FileText className={cn("w-4 h-4 shrink-0", scope === 'global' ? 'text-emerald-400' : 'text-indigo-400')} />
            <span className="text-sm font-mono font-medium truncate">{filename}</span>
            {hasChanges && <span className="w-2 h-2 rounded-full bg-amber-500 ml-2 shrink-0" title="Unsaved changes" />}
            {sessionId && (
              <span className={cn(
                "ml-2 flex items-center gap-1.5 px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-semibold border",
                isConnected ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
              )}>
                <span className={cn("w-1.5 h-1.5 rounded-full", isConnected ? "bg-emerald-400 animate-pulse" : "bg-amber-500")} />
                {isConnected ? `${Object.keys(cursors).length + 1} LIVE` : 'CONNECTING...'}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2 flex-wrap ml-auto">
             <input 
               type="text"
               value={commitMessage}
               onChange={(e) => setCommitMessage(e.target.value)}
               placeholder="Commit message..."
               className="bg-zinc-950 text-xs text-zinc-300 border border-zinc-800 rounded px-2 py-1 w-full max-w-[12rem] xl:max-w-[16rem] focus:outline-none focus:border-indigo-500/50"
             />
             <button 
               onClick={handleSave}
               disabled={!hasChanges || isSaving}
               className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors shrink-0",
                  hasChanges 
                    ? (scope === 'global' ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "bg-indigo-600 hover:bg-indigo-500 text-white") 
                    : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
               )}
             >
               <Save className="w-3.5 h-3.5" />
               <span className="hidden sm:inline">{isSaving ? 'Committing...' : `Commit to ${scope === 'global' ? 'Global' : 'Session'}`}</span>
               <span className="inline sm:hidden">{isSaving ? '...' : 'Save'}</span>
             </button>
             {onSync && (
               <button
                 onClick={() => onSync(scope)}
                 className={cn("flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded transition-colors shrink-0 border",
                    scope === 'global' ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-400 hover:bg-emerald-900/50" : "bg-indigo-950/30 border-indigo-500/30 text-indigo-400 hover:bg-indigo-900/50"
                 )}
                 title="Sync Repository to Remote"
               >
                 <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" /></svg>
                 <span className="hidden sm:inline">Sync</span>
               </button>
             )}
             <button
               onClick={() => setIsFullscreen(!isFullscreen)}
               className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors shrink-0 ml-1"
               title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
             >
               {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
             </button>
          </div>
        </div>
      
      <div 
        className="flex-1 min-h-0 relative group"
        onPointerMove={handlePointerMove}
      >
        {/* Remote Cursors Overlay */}
        {Object.entries(cursors).map(([senderId, pos]) => (
          <div 
            key={senderId} 
            className="absolute pointer-events-none z-[60] text-indigo-400 drop-shadow-md transition-all duration-75 ease-linear flex items-center gap-1"
            style={{ 
              left: `${pos.x * 100}%`, 
              top: `${pos.y * 100}%`,
              transform: 'translate(-50%, -50%)'
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="white" strokeWidth="1.5" className="w-4 h-4 drop-shadow">
              <path d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86c.16-.16.38-.25.6-.25h6.98c.45 0 .67-.54.35-.85L6.35 2.36c-.24-.24-.85-.07-.85.85z"/>
            </svg>
            <div className="bg-indigo-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm opacity-80 whitespace-nowrap hidden md:block">
              {senderId.substring(0, 4)}...
            </div>
          </div>
        ))}
        
        <textarea 
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="absolute inset-0 w-full h-full bg-zinc-950 text-zinc-200 font-mono text-sm p-4 resize-none focus:outline-none focus:ring-inset focus:ring-1 focus:ring-indigo-500/30 custom-scrollbar"
          spellCheck={false}
        />
        {/* Simple line number guider */}
        <div className="absolute top-4 left-0 w-8 flex flex-col items-center pointer-events-none opacity-0 group-hover:opacity-30 transition-opacity">
           <CornerDownRight className={cn("w-4 h-4", scope === 'global' ? "text-emerald-400" : "text-indigo-400")} />
        </div>
      </div>
    </div>
    </>
  );
}
