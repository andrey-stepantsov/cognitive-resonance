import { useState } from 'react';
import { ArtifactEditor } from '@cr/ui';
import { Check, Terminal, Play, Loader2, X, Maximize2, Minimize2 } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ArtefactRendererProps {
  content: string;
  sessionId?: string;
  onRunArtefact?: (path: string) => Promise<string>;
  onCommitArtefact?: (path: string, content: string, msg: string) => Promise<void>;
}

export function ArtefactRenderer({ content, sessionId, onRunArtefact, onCommitArtefact }: ArtefactRendererProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [artefactContent, setArtefactContent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [runtimeOutput, setRuntimeOutput] = useState<string | null>(null);

  // Parse [Remote Artefact]
  const isArtefact = content.includes('[Remote Artefact]');
  const artefactMatch = content.match(/^\[Remote Artefact\] Draft proposed: (.+) for (.+)$/m);
  
  // Parse [RUNTIME_OUTPUT]
  const isRuntime = content.includes('[RUNTIME_OUTPUT]');
  const runtimeMatch = content.match(/^\[RUNTIME_OUTPUT\]\n([\s\S]+)$/m);

  if (!isArtefact && !isRuntime) {
    return null; // Should not be rendered if it doesn't match
  }

  if (isRuntime && runtimeMatch) {
    const output = runtimeMatch[1];
    return (
      <div className="my-4 border border-zinc-700/50 bg-[#0d0d12] rounded-xl overflow-hidden shadow-sm font-mono text-sm max-w-full">
        <div className="flex items-center gap-2 px-4 py-2 bg-zinc-800/80 border-b border-zinc-700/50 text-zinc-400 text-xs">
          <Terminal className="w-4 h-4 text-amber-400" />
          Runtime Output Execution
        </div>
        <div className="p-4 text-zinc-300 overflow-x-auto">
          <pre className="whitespace-pre-wrap">{output}</pre>
        </div>
      </div>
    );
  }

  if (isArtefact && artefactMatch) {
    const branch = artefactMatch[1];
    const filePath = artefactMatch[2];

    const handleView = async () => {
      setIsOpen(true);
      // If we had a backend fetch to get the drafted file contents from the branch:
      // For now we assume a placeholder or fetch it natively
      if (!artefactContent) {
        setLoading(true);
        try {
          // Placeholder for fetching draft content from Edge/D1/Git 
          // Ideally this comes from the storage provider or git context manager
          // we wait until actual integration in App.tsx
          setTimeout(() => {
             setArtefactContent(`// Content of ${filePath} on branch ${branch}\n\nconsole.log("Hello Output");`);
             setLoading(false);
          }, 800);
        } catch(err) {
          setLoading(false);
        }
      }
    };

    const handleRun = async () => {
      if (onRunArtefact) {
        setLoading(true);
        try {
          const out = await onRunArtefact(filePath);
          setRuntimeOutput(out);
        } finally {
          setLoading(false);
        }
      }
    };

    return (
      <div className="my-4 border border-indigo-500/30 bg-indigo-500/10 rounded-xl flex flex-col shadow-sm max-w-[85%]">
        <div className="p-4 flex items-center gap-4">
          <div className="p-2.5 bg-indigo-500/20 rounded-lg shrink-0">
            <Check className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-indigo-300">Remote Artefact Generated</p>
            <p className="text-[11px] text-zinc-400 truncate mt-0.5">
              Target: <code className="text-indigo-300 bg-black/20 px-1 py-0.5 rounded font-mono">{filePath}</code> ({branch})
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onRunArtefact && (
               <button onClick={handleRun} disabled={loading} className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium rounded-lg transition-colors shadow flex items-center gap-1.5">
                 {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 text-emerald-400" />}
                 Run
               </button>
            )}
            <button onClick={handleView} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium rounded-lg transition-colors shadow shadow-indigo-500/20">
              Open Editor
            </button>
          </div>
        </div>
        
        {runtimeOutput && (
           <div className="px-4 pb-4">
             <div className="bg-[#0d0d12] border border-zinc-700/50 rounded-lg p-3 text-xs font-mono text-zinc-300 overflow-x-auto max-h-48">
               <div className="text-[10px] text-zinc-500 mb-1 flex items-center gap-1 uppercase tracking-wider"><Terminal className="w-3 h-3"/> Output</div>
               {runtimeOutput}
             </div>
           </div>
        )}

        {isOpen && (
          <div className={cn(
             "border-t border-indigo-500/20 bg-zinc-950 transition-all overflow-hidden flex flex-col",
             isFullscreen ? "fixed inset-0 z-[200] border-none rounded-none" : "h-[400px] rounded-b-xl"
          )}>
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
               <span className="text-xs font-medium text-zinc-300 font-mono flex items-center gap-2">
                 <Check className="w-3.5 h-3.5 text-indigo-400" /> {filePath}
               </span>
               <div className="flex items-center gap-1">
                 <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded transition-colors">
                   {isFullscreen ? <Minimize2 className="w-4 h-4"/> : <Maximize2 className="w-4 h-4" />}
                 </button>
                 <button onClick={() => setIsOpen(false)} className="p-1.5 text-zinc-500 hover:text-zinc-300 rounded transition-colors">
                   <X className="w-4 h-4"/>
                 </button>
               </div>
            </div>
            <div className="flex-1 relative">
              {loading && !artefactContent ? (
                <div className="absolute inset-0 flex items-center justify-center bg-zinc-950/50 backdrop-blur-sm z-10">
                  <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
                </div>
              ) : (
                <ArtifactEditor
                  filename={filePath}
                  initialContent={artefactContent}
                  sessionId={sessionId}
                  onSave={async (file, content, msg) => {
                    if (onCommitArtefact) {
                       await onCommitArtefact(file, content, msg || 'Update artefact');
                    }
                    setArtefactContent(content);
                  }}
                />
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  return null;
}
