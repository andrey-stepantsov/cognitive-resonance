import { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { Save, FileText, CornerDownRight, Maximize2, Minimize2 } from 'lucide-react';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

interface ArtifactEditorProps {
  filename: string;
  initialContent: string;
  onSave: (filename: string, content: string, commitMessage: string) => Promise<void>;
}

export function ArtifactEditor({ filename, initialContent, onSave }: ArtifactEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [commitMessage, setCommitMessage] = useState(`Update ${filename}`);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setHasChanges(content !== initialContent);
  }, [content, initialContent]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(filename, content, commitMessage || `Update ${filename}`);
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
        <div className="flex flex-wrap items-center justify-between gap-y-2 px-4 py-2 bg-zinc-900 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-2 text-zinc-300 min-w-0 pr-2">
            <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
            <span className="text-sm font-mono font-medium truncate">{filename}</span>
            {hasChanges && <span className="w-2 h-2 rounded-full bg-amber-500 ml-2 shrink-0" title="Unsaved changes" />}
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
                  hasChanges ? "bg-indigo-600 hover:bg-indigo-500 text-white" : "bg-zinc-800 text-zinc-500 cursor-not-allowed"
               )}
             >
               <Save className="w-3.5 h-3.5" />
               <span className="hidden sm:inline">{isSaving ? 'Committing...' : 'Commit'}</span>
               <span className="inline sm:hidden">{isSaving ? '...' : 'Save'}</span>
             </button>
             <button
               onClick={() => setIsFullscreen(!isFullscreen)}
               className="p-1.5 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 rounded transition-colors shrink-0 ml-1"
               title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
             >
               {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
             </button>
          </div>
        </div>
      
      <div className="flex-1 min-h-0 relative group">
        <textarea 
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="absolute inset-0 w-full h-full bg-zinc-950 text-zinc-200 font-mono text-sm p-4 resize-none focus:outline-none focus:ring-inset focus:ring-1 focus:ring-indigo-500/30 custom-scrollbar"
          spellCheck={false}
        />
        {/* Simple line number guider */}
        <div className="absolute top-4 left-0 w-8 flex flex-col items-center pointer-events-none opacity-0 group-hover:opacity-30 transition-opacity">
           <CornerDownRight className="w-4 h-4 text-indigo-400" />
        </div>
      </div>
    </div>
    </>
  );
}
