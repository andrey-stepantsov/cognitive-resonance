import React, { useState } from 'react';
import { Cloud, Server } from 'lucide-react';

interface AuthScreenProps {
  onConnectCloud?: (apiKey: string) => void;
  onConnectLocal?: () => void;
}

export function AuthScreen({ 
  onConnectCloud, 
  onConnectLocal 
}: AuthScreenProps) {
  const [apiKey, setApiKey] = useState('');
  const [mode, setMode] = useState<'cloud' | 'local'>('cloud');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'cloud' && onConnectCloud) {
      onConnectCloud(apiKey);
    } else if (mode === 'local' && onConnectLocal) {
      onConnectLocal();
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center p-4 z-[9999]">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
        
        {/* Decorative flair */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full" />
        
        <div className="flex flex-col items-center mb-8 relative">
          <div className="w-12 h-12 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-center mb-4 shadow-inner">
            <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.6)] animate-pulse" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white mb-1">Cognitive Resonance</h1>
          <p className="text-sm text-zinc-400">Select connection topology</p>
        </div>

        <div className="flex bg-zinc-950 border border-zinc-800 rounded-xl p-1 mb-6">
          <button 
            type="button" 
            onClick={() => setMode('cloud')} 
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-colors ${mode === 'cloud' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Cloud className="w-4 h-4" /> Edge
          </button>
          <button 
            type="button" 
            onClick={() => setMode('local')} 
            className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-colors ${mode === 'local' ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Server className="w-4 h-4" /> Local
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {mode === 'cloud' ? (
            <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider pl-1">Edge Auth Token</label>
              <input 
                type="password" 
                placeholder="e.g. cognitive-resonance-admin-key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50 transition-colors"
                required={mode === 'cloud'}
              />
              <p className="text-xs text-zinc-500 mt-2 text-center">Enter your secure Edge key to authenticate against your live Cloudflare Worker.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 animate-in fade-in slide-in-from-bottom-2 text-center">
              <div className="py-4 px-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400/90 text-sm">
                Connects to local Sync Daemon (localhost:3000) for event-sourced local-first development.
              </div>
            </div>
          )}
          
          <button 
            type="submit" 
            className={`w-full py-3 mt-4 text-white font-medium rounded-xl transition-all shadow-lg ${mode === 'cloud' ? 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-500/20' : 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-500/20'}`}
          >
            {mode === 'cloud' ? 'Connect via Edge' : 'Connect Local Daemon'}
          </button>
        </form>

      </div>
    </div>
  );
}
