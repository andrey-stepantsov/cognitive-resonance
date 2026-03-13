import React, { useState } from 'react';
import { Globe } from 'lucide-react';

interface AuthScreenProps {
  onLoginOAuth?: (provider: string) => void;
  onLoginEmail?: (email: string, password: string) => void;
  onSignupEmail?: (email: string, password: string) => void;
  isDev?: boolean;
}

export function AuthScreen({ onLoginOAuth, onLoginEmail, onSignupEmail }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'signup'>('login');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login' && onLoginEmail) {
      onLoginEmail(email, password);
    } else if (mode === 'signup' && onSignupEmail) {
      onSignupEmail(email, password);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0a0a0a] flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-8 relative overflow-hidden">
        
        {/* Decorative flair */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-indigo-500" />
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-indigo-500/10 blur-3xl rounded-full" />
        
        <div className="flex flex-col items-center mb-8 relative">
          <div className="w-12 h-12 bg-zinc-950 border border-zinc-800 rounded-xl flex items-center justify-center mb-4 shadow-inner">
            <div className="w-3 h-3 rounded-full bg-indigo-500 shadow-[0_0_15px_rgba(99,102,241,0.6)] animate-pulse" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white mb-1">Cognitive Resonance</h1>
          <p className="text-sm text-zinc-400">Initialize context parameters</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider pl-1">Ident</label>
            <input 
              type="email" 
              placeholder="operator@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50 transition-colors"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider pl-1">Passphrase</label>
            <input 
              type="password" 
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/50 transition-colors"
              required
            />
          </div>
          
          <button 
            type="submit" 
            className="w-full py-3 mt-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl transition-colors shadow-lg shadow-indigo-500/20"
          >
            {mode === 'login' ? 'Authenticate' : 'Establish Record'}
          </button>
        </form>

        <div className="flex items-center gap-4 my-6">
          <div className="flex-1 h-px bg-zinc-800" />
          <span className="text-xs font-medium text-zinc-500 uppercase tracking-wider">Or</span>
          <div className="flex-1 h-px bg-zinc-800" />
        </div>

        <button 
          onClick={() => onLoginOAuth?.('google')}
          className="w-full py-3 flex items-center justify-center gap-3 bg-zinc-800 text-zinc-200 hover:bg-zinc-700 hover:text-white font-medium rounded-xl transition-colors border border-transparent shadow-sm"
        >
          <Globe className="w-5 h-5 text-indigo-400" />
          Authenticate via Google
        </button>

        <p className="text-xs text-center text-zinc-500 mt-6">
          {mode === 'login' ? "Don't have context established?" : "Already established context?"}{' '}
          <button 
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="text-indigo-400 hover:text-indigo-300 font-medium underline"
          >
            {mode === 'login' ? 'Create Record' : 'Authenticate'}
          </button>
        </p>
      </div>
    </div>
  );
}
