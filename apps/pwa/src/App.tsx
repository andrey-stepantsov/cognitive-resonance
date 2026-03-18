import { useEffect, useState } from 'react';
import {
  Send, BrainCircuit, Activity, Network, Trash2, Check, X,
  AlertTriangle, Plus, Copy, FileText, Share2, Diamond, Archive, ArchiveRestore,
  Database, Loader2, Paperclip, Star, Edit3, Upload, Mic, MicOff, Square, Globe, Eye, EyeOff, Cloud, HardDrive, LogOut
} from 'lucide-react';
import { SemanticGraph, DissonanceMeter, MarkdownRenderer, AuthScreen, ArtifactEditor } from '@cr/ui';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useREPL, useVoiceToDSL, translateToDSL, useCognitivePlatform, GitContextManager } from '@cr/core';
import { clearApiKey } from '@cr/backend';
import { Intercom } from './components/Intercom';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

export default function App() {
  const app = useREPL();
  const { authStatus, auth, storage, user } = useCognitivePlatform();

  const [toasts, setToasts] = useState<{ id: string; message: string; onUndo?: () => void }[]>([]);
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const showToast = (message: string, onUndo?: () => void) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, onUndo }]);
    if (!onUndo) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 5000);
    }
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const voice = useVoiceToDSL(async (transcript) => {
    // Determine translation using Gemini
    const translated = await translateToDSL(transcript);
    
    // Check if it returned a command format with slash.
    if (translated.startsWith('/')) {
        // Execute command programmatically
        await app.executeCommand(translated);
    } else {
        // Just place text in input for user review
        app.setInput(translated);
    }
  });

  useEffect(() => {
    // Check for ?invite= in URL
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const inviteToken = urlParams.get('invite');
      if (inviteToken && authStatus !== 'authenticated') {
         // Auto-login logic. For now, since CloudflareAuthProvider handles local storage, 
         // we just need to set the token. However, CloudflareAuthProvider doesn't expose a 'setToken' directly.
         // A simple workaround is to just pass it directly to the socket, or store it in localStorage 
         // so CloudflareAuthProvider picks it up.
         localStorage.setItem('cr_auth_token', inviteToken);
         // Reload to let the provider pick it up.
         const newUrl = new URL(window.location.href);
         newUrl.searchParams.delete('invite');
         window.location.href = newUrl.toString();
      }
    }
  }, [authStatus]);

  if (authStatus !== 'authenticated') {
    return (
      <AuthScreen 
        onConnectCloud={(apiKey) => {
          if (auth.connectCloud) {
            auth.connectCloud(apiKey).catch((err: any) => {
              console.error(err);
              alert(`Connection failed: ${err?.message || JSON.stringify(err)}`);
            });
          }
        }}
        onConnectLocal={() => {
          if (auth.connectLocal) {
            auth.connectLocal().catch((err: any) => {
              console.error(err);
              alert(`Connection failed: ${err?.message || JSON.stringify(err)}`);
            });
          }
        }}
      />
    );
  }

  // API Key Modal
  if (app.showApiKeyModal) {
    return (
      <div className="fixed inset-0 bg-[#111116] flex items-center justify-center z-[200]">
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] animate-pulse" />
            <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Cognitive Resonance</h1>
          </div>
          <p className="text-sm text-zinc-400 mb-6">Enter your Google Gemini API key to get started. You can get one from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener" className="text-indigo-400 hover:text-indigo-300 underline">Google AI Studio</a>.</p>
          <form onSubmit={(e) => { e.preventDefault(); app.handleSetApiKey(); }} className="space-y-4">
            <input
              type="password"
              value={app.apiKeyInput}
              onChange={(e) => app.setApiKeyInput(e.target.value)}
              placeholder="AIza..."
              autoFocus
              className="w-full bg-zinc-950 border border-zinc-700/50 rounded-xl px-4 py-3 text-sm text-zinc-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <button type="submit" disabled={!app.apiKeyInput.trim()} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-xl transition-colors disabled:opacity-50">
              Save & Start
            </button>
          </form>
          <p className="text-xs text-zinc-600 mt-4 text-center">Your key is stored locally in this browser only.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#111116] text-zinc-100 font-sans overflow-hidden">
      
      {/* Toast Notifications */}
      <div className="fixed bottom-6 right-6 z-[300] flex flex-col gap-2pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="bg-zinc-800 text-zinc-200 px-4 py-3 rounded-xl shadow-xl border border-zinc-700/50 flex items-center justify-between gap-4 pointer-events-auto min-w-[280px] animate-in slide-in-from-bottom-5">
            <span className="text-sm font-medium">{t.message}</span>
            <div className="flex items-center gap-2">
              {t.onUndo && (
                <button onClick={() => { t.onUndo!(); removeToast(t.id); }} className="text-sm font-semibold text-indigo-400 hover:text-indigo-300">
                  Undo
                </button>
              )}
              <button onClick={() => removeToast(t.id)} className="p-1 text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {deletingSessionId && (
        <div className="fixed inset-0 bg-black/60 z-[300] flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-red-500/30 shadow-2xl rounded-2xl p-6 max-w-sm w-full">
            <div className="flex items-center gap-3 text-red-400 mb-4">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-lg font-semibold text-zinc-100">Delete Session</h3>
            </div>
            <p className="text-sm text-zinc-400 mb-6">Are you sure you want to permanently delete this session? This action cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeletingSessionId(null)} className="px-4 py-2 text-sm font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors">Cancel</button>
              <button onClick={(e) => { app.handleDeleteSession(deletingSessionId, e as any); setDeletingSessionId(null); }} className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors shadow-lg shadow-red-900/20">Delete Forever</button>
            </div>
          </div>
        </div>
      )}

      {/* Session Sidebar Backdrop */}
      {app.isHistorySidebarOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => app.setIsHistorySidebarOpen(false)} />
      )}

      {/* Session Sidebar */}
      <div className={cn(
        "fixed top-0 left-0 bottom-0 w-full sm:w-[320px] lg:w-[280px] bg-zinc-900 border-r border-zinc-800/50 shadow-2xl z-50 transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col pt-[env(safe-area-inset-top)] pb-36 lg:pb-[env(safe-area-inset-bottom)]",
        app.isHistorySidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
          <div className="flex gap-4">
            <button onClick={() => app.setActiveSidebarTab('history')} className={cn("text-sm font-semibold tracking-wide transition-colors pb-1 border-b-2", app.activeSidebarTab === 'history' ? "text-zinc-200 border-indigo-500" : "text-zinc-500 border-transparent hover:text-zinc-300")}>History</button>
            <button onClick={() => { app.setActiveSidebarTab('search'); app.setHistorySearchQuery(''); }} className={cn("text-sm font-semibold tracking-wide transition-colors pb-1 border-b-2 flex items-center gap-1.5", app.activeSidebarTab === 'search' ? "text-zinc-200 border-indigo-500" : "text-zinc-500 border-transparent hover:text-zinc-300")}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
              Search
            </button>
          </div>
          <button onClick={() => app.setIsHistorySidebarOpen(false)} className="text-zinc-500 hover:text-white transition-colors p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {app.activeSidebarTab === 'search' && (
          <div className="p-3 border-b border-zinc-800/50 bg-zinc-900/50">
            <input type="text" placeholder="Search concepts across all sessions..." value={app.historySearchQuery} onChange={(e) => app.setHistorySearchQuery(e.target.value)} autoFocus
              className="w-full bg-zinc-950/80 border border-zinc-700/50 rounded-lg py-2 pl-3 pr-3 text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-indigo-500/80 transition-colors shadow-inner" />
          </div>
        )}

        {app.activeSidebarTab === 'history' && (
          <div className="p-3 flex gap-2">
            <button onClick={app.startNewSession} className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 border border-indigo-500/20 rounded-lg text-sm font-medium transition-all">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
              New
            </button>
            <input type="file" ref={app.importInputRef} onChange={app.handleImportSession} accept=".json" className="hidden" />
            <button onClick={() => app.importInputRef.current?.click()} className="flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800/50 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50 rounded-lg text-sm font-medium transition-all" title="Import session from JSON file">
              <Upload className="w-4 h-4" />
              Import
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-1 mt-1">
          {app.activeSidebarTab === 'history' && (() => {
            const activeSessions = app.sessions.filter(s => !(s as any).isArchived);
            const archivedSessions = app.sessions.filter(s => (s as any).isArchived);

            if (activeSessions.length === 0 && archivedSessions.length === 0) {
              return <div className="text-xs text-zinc-500 text-center mt-6">No previous sessions found</div>;
            }

            const renderSession = (s: any) => (
              <div key={s.id} onClick={() => { if (app.editingSessionId !== s.id) app.handleLoadSession(s.id); }}
                className={cn("group relative px-3 py-2.5 rounded-lg transition-colors border border-transparent flex justify-between items-center mb-1",
                  app.editingSessionId !== s.id && "cursor-pointer",
                  app.activeSessionId === s.id ? "bg-zinc-800/80 border-zinc-700/50 text-indigo-300" : "hover:bg-zinc-800/50 text-zinc-400 hover:text-zinc-200"
                )}>
                {app.editingSessionId === s.id ? (
                  <div className="flex items-center gap-2 w-full" onClick={e => e.stopPropagation()}>
                    <input type="text" value={app.editSessionName} onChange={(e) => app.setEditSessionName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') app.handleRenameSessionSubmit(s.id, e); if (e.key === 'Escape') {} }}
                      autoFocus className="flex-1 bg-zinc-950 border border-indigo-500/50 rounded px-2 py-1 text-xs text-zinc-100 focus:outline-none" />
                    <button onClick={(e) => app.handleRenameSessionSubmit(s.id, e)} className="text-indigo-400 hover:text-indigo-300">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="truncate text-xs font-medium">
                      {s.customName || s.preview}
                      <div className="text-[10px] text-zinc-600 mt-0.5 flex items-center gap-1.5">
                        {new Date(s.timestamp).toLocaleString()}
                        {(s as any).isCloud ? (
                          <span className="inline-flex items-center gap-0.5 text-emerald-500/80" title="Synced to cloud">
                            <Cloud className="w-3 h-3" />
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-zinc-500" title="Local only">
                            <HardDrive className="w-3 h-3" />
                          </span>
                        )}
                        {(s as any).isArchived && (
                          <span className="inline-flex items-center gap-0.5 text-amber-500/80" title="Archived Room">
                            <Archive className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 flex items-center gap-1 transition-all shrink-0">
                      <button onClick={(e) => {
                        app.handleCloneSession(s.id, e);
                        showToast('Session cloned successfully.');
                      }} className="p-1.5 text-zinc-500 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-md transition-colors" title="Clone Session">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      {(s as any).isArchived ? (
                        <button onClick={(e) => {
                          e.stopPropagation();
                          const mockEvt = { stopPropagation: () => {} } as any;
                          app.handleArchiveSession(s.id, false, e);
                          showToast('Session recovered.', () => app.handleArchiveSession(s.id, true, mockEvt));
                        }} className="p-1.5 text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-md transition-colors" title="Recover from Archive">
                          <ArchiveRestore className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button onClick={(e) => {
                          e.stopPropagation();
                          const mockEvt = { stopPropagation: () => {} } as any;
                          app.handleArchiveSession(s.id, true, e);
                          showToast('Session archived.', () => app.handleArchiveSession(s.id, false, mockEvt));
                        }} className="p-1.5 text-zinc-500 hover:text-amber-400 hover:bg-amber-500/10 rounded-md transition-colors" title="Archive Session">
                          <Archive className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={(e) => app.startRenameSession(s.id, s.customName || s.preview, e)} className="p-1.5 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-colors" title="Rename">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); setDeletingSessionId(s.id); }} className="p-1.5 text-red-500/70 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors" title="Delete">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            );

            return (
              <div className="flex flex-col gap-6 mt-2">
                {activeSessions.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">Active Sessions</div>
                    {activeSessions.map(renderSession)}
                  </div>
                )}
                {archivedSessions.length > 0 && (
                  <div>
                    <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2 px-1">Archived Sessions</div>
                    {archivedSessions.map(renderSession)}
                  </div>
                )}
              </div>
            );
          })()}

          {app.activeSidebarTab === 'search' && app.historySearchQuery.trim() === '' && (
            <div className="text-xs text-zinc-500 text-center mt-6 px-4 leading-relaxed">Type a concept to search your entire Cognitive Resonance history.</div>
          )}
          {app.activeSidebarTab === 'search' && app.historySearchQuery.trim() !== '' && app.searchResults.length === 0 && (
            <div className="text-xs text-zinc-500 text-center mt-6">No matching concepts found.</div>
          )}
          {app.activeSidebarTab === 'search' && app.searchResults.map((r, i) => (
            <div key={`${r.sessionId}-${r.turnIndex}-${i}`} onClick={() => app.handleSearchResultClick(r)}
              className="group relative p-3 rounded-lg cursor-pointer transition-colors border border-transparent flex flex-col gap-1.5 hover:bg-zinc-800/60 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700">
              <div className="flex flex-wrap gap-1">
                {r.matchedConcepts.map((c: string) => (
                  <span key={c} className="px-1.5 py-0.5 bg-indigo-500/20 text-indigo-300 rounded text-[10px] font-medium border border-indigo-500/30">{c}</span>
                ))}
              </div>
              <div className="text-xs text-zinc-400 italic line-clamp-2 px-1 border-l-2 border-zinc-700 ml-1">"{r.contextSnippet}"</div>
              <div className="text-[10px] text-zinc-500 mt-1 flex justify-between items-center">
                <span>{new Date(r.timestamp).toLocaleDateString()}</span>
                <span className="flex items-center gap-1">Turn {r.turnIndex + 1}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Header */}
      <header className="flex-none px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-4 border-b border-zinc-800/50 bg-zinc-900/30 flex items-center justify-between backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => app.setIsHistorySidebarOpen(true)} className="p-1.5 text-zinc-400 hover:text-indigo-400 bg-zinc-800/30 hover:bg-zinc-800 rounded-md transition-colors" title="Session History">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" /></svg>
          </button>
          <div className="h-6 w-px bg-zinc-800 mx-1" />
          <div className="w-2 h-2 rounded-full bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)] animate-pulse" />
          <h1 className="text-sm font-semibold tracking-wide text-zinc-100 flex items-center gap-2">
            Cognitive Resonance
            <span className="px-2 py-0.5 bg-zinc-800 text-zinc-400 rounded text-[10px] font-mono border border-zinc-700/50">v1.0.0</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {Object.keys(app.activeUsers || {}).length > 0 && (
            <div className="flex items-center -space-x-2 mr-2">
               {Object.values(app.activeUsers || {}).map((u: any) => (
                  <div key={u.sessionId} className="w-6 h-6 rounded-full bg-purple-600 border border-purple-800 flex items-center justify-center text-[10px] font-bold text-white uppercase shadow-sm" title={u.userId || 'Anonymous User'}>
                     {(u.userId || 'A').charAt(0)}
                  </div>
               ))}
            </div>
          )}
          <Intercom 
            activeUsers={app.activeUsers} 
            localSessionId={app.localSessionId} 
            onSignal={app.onSignal} 
            sendSignal={app.sendSignal} 
            mediaStream={voice.mediaStream} 
            acquireMediaStream={voice.acquireMediaStream} 
            releaseMediaStream={voice.releaseMediaStream} 
          />
          {storage.type === 'cloud' && storage.isReady() ? (
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" title="Connected to cloud storage">
              <Cloud className="w-3 h-3" />
              Synced
            </div>
          ) : (
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium bg-zinc-800/50 text-zinc-500 border border-zinc-700/30" title="Using local storage">
              <HardDrive className="w-3 h-3" />
              Local
            </div>
          )}
          {user && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-medium bg-zinc-800/50 text-zinc-400 border border-zinc-700/30">
              <span className="max-w-[100px] truncate hidden sm:inline">{user.email || user.name}</span>
              <button onClick={() => { auth.logout(); clearApiKey(); }} className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors" title="Log out">
                <LogOut className="w-3 h-3" />
              </button>
            </div>
          )}
          {!app.isViewMode && (
            <button onClick={app.handleDownloadHistory} disabled={app.messages.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-400 disabled:opacity-30 disabled:cursor-not-allowed hover:text-white bg-zinc-800/30 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors" title="Download Snapshot JSON">
              <Share2 className="w-3.5 h-3.5" /> Share
            </button>
          )}
          {!app.isViewMode && user && (
            <button onClick={app.handleGenerateInvite}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-indigo-400 hover:text-indigo-300 bg-indigo-500/10 hover:bg-indigo-500/20 disabled:opacity-30 disabled:cursor-not-allowed rounded border border-indigo-500/20 transition-colors" title="Invite a guest to this room">
              <Plus className="w-3.5 h-3.5" /> Invite
            </button>
          )}
          <button onClick={() => { clearApiKey(); app.setShowApiKeyModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-300 bg-zinc-800/30 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors" title="Change Gemini Key">
            🔑
          </button>
        </div>
      </header>

      <div className="flex h-full w-full bg-[#0a0a0a] text-zinc-100 font-sans overflow-hidden relative">
        {app.isDissonancePanelOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" onClick={() => app.setIsDissonancePanelOpen(false)} />}

        {/* Left Sidebar: Dissonance */}
        <div className={cn("fixed inset-y-0 left-0 z-50 w-full lg:w-80 bg-zinc-950 lg:bg-zinc-900/30 border-r border-zinc-800/50 flex flex-col pt-[max(1.5rem,env(safe-area-inset-top))] px-6 pb-36 lg:pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:py-6 lg:px-6",
          "transform transition-transform duration-300 ease-in-out lg:relative lg:transform-none lg:z-auto",
          app.isDissonancePanelOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3"><Activity className="w-5 h-5 text-indigo-400" /><h2 className="font-medium tracking-wide text-zinc-100">Internal State</h2></div>
            <div className="flex items-center gap-2">
              {app.isViewingHistory && <button onClick={() => app.setSelectedTurnIndex(null)} className="text-xs bg-indigo-500/20 text-indigo-300 px-2.5 py-1.5 rounded-md hover:bg-indigo-500/30 transition-colors">Return to Current</button>}
              <button className="lg:hidden p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800/50 rounded-md" onClick={() => app.setIsDissonancePanelOpen(false)}><X className="w-4 h-4" /></button>
            </div>
          </div>
          <DissonanceMeter currentScore={app.activeState?.dissonanceScore ?? null} reason={app.activeState?.dissonanceReason ?? null} history={app.historyData} activeTurnIndex={app.activeTurnIndex} isViewingHistory={app.isViewingHistory} onSelectTurn={app.setSelectedTurnIndex} />
        </div>

        {/* Center: Chat */}
        <div className="flex-1 flex flex-col min-w-0 w-full lg:min-w-[400px] max-w-3xl mx-auto lg:border-x border-zinc-800/30 bg-[#0a0a0a] shadow-2xl relative lg:z-10">
          <div className="p-4 lg:p-6 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/20 backdrop-blur-md relative">
            <div className="flex items-center"><button className="lg:hidden p-2 -ml-2 text-zinc-400 hover:text-zinc-100" onClick={() => app.setIsDissonancePanelOpen(true)}><Activity className="w-5 h-5" /></button></div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => app.setShowSystemMessages(!app.showSystemMessages)}
                className="flex items-center justify-center p-1.5 text-zinc-400 hover:text-indigo-400 bg-zinc-800/30 hover:bg-zinc-800 rounded border border-zinc-800 transition-colors"
                title={app.showSystemMessages ? "Hide System Interactions" : "Show System Interactions"}
              >
                {app.showSystemMessages ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              </button>
              {app.activeState?.tokenUsage?.totalTokenCount != null && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums transition-all border bg-zinc-800/50 text-zinc-400 border-zinc-700/50 shadow-inner" title={`Context Size: ${app.activeState.tokenUsage.totalTokenCount.toLocaleString()} tokens`}>
                  <Database className="w-3.5 h-3.5 opacity-70" />
                  {app.activeState.tokenUsage.totalTokenCount >= 1000 
                    ? `${(app.activeState.tokenUsage.totalTokenCount / 1000).toFixed(1)}k` 
                    : app.activeState.tokenUsage.totalTokenCount}
                </div>
              )}
              {app.activeState?.dissonanceScore != null && (
                <button onClick={() => app.setIsDissonancePanelOpen(true)} className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold tabular-nums transition-all border",
                  app.activeState.dissonanceScore <= 30 ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" :
                  app.activeState.dissonanceScore <= 60 ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                  "bg-red-500/10 text-red-400 border-red-500/20 animate-pulse"
                )} title={app.activeState.dissonanceReason || 'Dissonance Score'}>
                  <Activity className="w-3.5 h-3.5" />
                  {app.activeState.dissonanceScore}
                </button>
              )}
              <button className="lg:hidden p-2 -mr-2 text-zinc-400 hover:text-zinc-100" onClick={() => app.setIsRightSidebarOpen(true)}><Network className="w-5 h-5" /></button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {app.messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-zinc-500 space-y-4 px-8 text-center">
                <BrainCircuit className="w-12 h-12 opacity-20 mb-2" />
                <p className="text-sm font-medium text-zinc-400">Initiate conversation to observe internal state.</p>
                <div className="text-xs opacity-70 space-y-2 max-w-sm">
                  <p>💡 Tip: Save sessions using the Backup button. Your conversations are stored locally in this browser.</p>
                </div>
              </div>
            )}

            {app.messages.map((msg, idx) => ({ msg, idx })).filter(({ msg }) => app.showSystemMessages || !(msg.role === 'model' && typeof msg.content === 'string' && msg.content.startsWith('[System]:'))).map(({ msg, idx }) => (
              <div key={idx} id={`message-${idx}`} className={cn("flex w-full flex-col scroll-mt-24 min-w-0 break-words", msg.role === 'user' ? "items-end" : "items-start")}>
                {msg.isError ? (
                  <div className="max-w-[80%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed bg-red-950/60 text-red-200 border border-red-800/60 rounded-bl-sm">
                    <div className="flex items-start gap-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-red-400 mb-1">Error</p>
                        <p className="break-words whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    </div>
                    <button onClick={() => { navigator.clipboard.writeText(msg.content); app.setCopiedIndex(idx); setTimeout(() => app.setCopiedIndex(null), 2000); }}
                      className="mt-2.5 flex items-center gap-1.5 text-xs text-red-400/70 hover:text-red-300 transition-colors">
                      {app.copiedIndex === idx ? <><Check className="w-3 h-3" /> Copied!</> : <><Copy className="w-3 h-3" /> Copy error</>}
                    </button>
                  </div>
                ) : (
                  <div className={cn("max-w-[85%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed overflow-hidden break-words min-w-0 relative group",
                    msg.role === 'user' ? "bg-indigo-600 text-white shadow-lg shadow-indigo-900/20 rounded-br-sm" : 
                    msg.role === 'peer' ? "bg-purple-900/40 text-purple-100 border border-purple-800/40 shadow-lg shadow-purple-900/10 rounded-bl-sm" :
                    "bg-zinc-800/80 text-zinc-200 border border-zinc-700/50 rounded-bl-sm prose prose-invert max-w-none prose-p:leading-relaxed prose-pre:m-0 w-full"
                  )}>
                    <div className={cn("text-[10px] font-semibold mb-1 tracking-wider uppercase flex items-center gap-2", 
                      msg.role === 'user' ? "text-indigo-200/80 justify-end" : msg.role === 'peer' ? "text-purple-400/80 justify-start" : "text-zinc-500 justify-start"
                    )}>
                      {msg.senderName || (msg.role === 'model' ? app.savedGems.find(g => g.id === app.activeGemId)?.name || 'AI' : 'User')}
                      <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/20 px-1.5 py-0.5 rounded text-[9px] font-mono cursor-pointer hover:text-white" onClick={() => { navigator.clipboard.writeText(`#${idx + 1}`); }} title="Click to copy Turn ID">
                        #{idx + 1}
                      </span>
                    </div>
                    {(msg.role === 'model' || msg.role === 'peer') && !msg.isError ? <MarkdownRenderer content={msg.content} /> : msg.content}
                  </div>
                )}
                {msg.role === 'model' && msg.modelTurnIndex !== undefined && !msg.isError && (
                  <button onClick={() => { app.setSelectedTurnIndex(msg.modelTurnIndex!); app.setIsDissonancePanelOpen(true); }}
                    className={cn("mt-2 text-xs font-medium transition-colors flex items-center gap-1.5 px-1",
                      app.activeTurnIndex === msg.modelTurnIndex ? "text-indigo-400" : "text-zinc-500 hover:text-zinc-300")}>
                    <Activity className="w-3.5 h-3.5" />
                    {app.activeTurnIndex === msg.modelTurnIndex ? "Viewing State" : "View State"}
                  </button>
                )}
              </div>
            ))}

            {app.isLoading && (
              <div className="flex justify-start">
                <div className="bg-zinc-800/80 border border-zinc-700/50 rounded-2xl rounded-bl-sm px-5 py-4 flex items-center gap-3">
                  <Loader2 className="w-4 h-4 animate-spin text-indigo-400" />
                  <span className="text-sm text-zinc-400">Processing cognitive state...</span>
                </div>
              </div>
            )}
            <div ref={app.messagesEndRef} />
          </div>

          {!app.isViewMode && (
            <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] bg-zinc-950/95 backdrop-blur-xl lg:bg-zinc-900/50 border-t border-zinc-800/50 flex flex-col gap-2 relative z-[60] lg:z-20 shadow-[0_-20px_40px_rgba(0,0,0,0.5)] lg:shadow-none">
              <div className="flex items-center gap-2 px-1 pb-1">
                <button onClick={() => app.setIsGemSidebarOpen(true)} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-zinc-800/40 hover:bg-zinc-800 text-indigo-300 border border-indigo-500/20 rounded-lg transition-colors shadow-sm" title="Manage Gems">
                  <Diamond className="w-3.5 h-3.5" />
                  {app.savedGems.find(g => g.id === app.activeGemId)?.name || 'Select Gem'}
                </button>
                <select value={app.selectedModel} onChange={(e) => app.setSelectedModel(e.target.value)}
                  className={cn("text-xs font-medium bg-transparent hover:bg-zinc-800/40 border border-transparent hover:border-zinc-700/50 rounded-lg px-2 py-1.5 cursor-pointer focus:outline-none transition-all max-w-[200px] truncate shadow-sm",
                    (!app.selectedModel || !app.chatModels.find(m => m.name.replace('models/', '') === app.selectedModel.replace('models/', ''))) ? 'text-red-400/90' : 'text-zinc-400'
                  )} title="Override model for this session">
                  {app.chatModels.length === 0 && <option value={app.selectedModel}>{app.selectedModel}</option>}
                  {app.chatModels.map((m: any) => { const val = m.name.replace('models/', ''); return <option key={val} value={val}>{m.displayName || val}</option>; })}
                </select>
              </div>

              {app.attachedFiles.length > 0 && (
                <div className="flex flex-wrap gap-2 px-1">
                  {app.attachedFiles.map(f => (
                    <div key={f.id} className="flex items-center gap-2 bg-zinc-800/80 border border-zinc-700/50 rounded-lg px-2.5 py-1.5 text-xs group">
                      {f.preview ? <img src={f.preview} alt={f.name} className="w-8 h-8 rounded object-cover" /> : <FileText className="w-4 h-4 text-zinc-400" />}
                      <span className="text-zinc-300 max-w-[120px] truncate">{f.name}</span>
                      <button onClick={() => app.setAttachedFiles(prev => prev.filter(af => af.id !== f.id))} className="p-0.5 text-zinc-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"><X className="w-3 h-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Autocomplete Panel */}
              <div 
                className={cn(
                  "w-full flex flex-col overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] bg-zinc-950/80 backdrop-blur-md rounded-2xl",
                  app.input.startsWith('/') || app.mentionSearchQuery !== null ? "h-[50vh] min-h-[300px] opacity-100 border border-zinc-800 shadow-xl mb-2" : "h-0 min-h-0 opacity-0 border-transparent mb-0"
                )}
              >
                <div className="flex-1 overflow-y-auto p-3 sm:p-4 custom-scrollbar">
                  {/* AST Context Search Results */}
                  {app.mentionSearchQuery !== null && app.mentionContext !== null && (
                    <div className="flex flex-col gap-4 pb-2">
                       {app.mentionSuggestions.length === 0 ? (
                         <div className="text-xs text-zinc-500 italic px-1 py-2">No matching context found.</div>
                       ) : (
                         <>
                           {app.mentionContext === 'dsl' && (
                             <div className="flex flex-col gap-1.5">
                               <div className="text-[10px] font-semibold text-emerald-400/80 uppercase tracking-wider mb-1 px-1 flex items-center gap-1.5"><Activity className="w-3 h-3" /> Lisp AST Operations</div>
                               {app.mentionSuggestions.map((m: any) => (
                                 <div key={m.name} className="group relative flex flex-col justify-center p-3 rounded-xl cursor-pointer transition-all border overflow-hidden bg-zinc-900/30 border-zinc-800/50 hover:bg-emerald-900/20 hover:border-emerald-500/30" onClick={() => app.handleMentionSelect(m.name, m.raw)}>
                                   <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                   <span className="relative text-sm font-medium text-emerald-300 font-mono">{m.description}</span>
                                 </div>
                               ))}
                             </div>
                           )}

                           {app.mentionContext === 'turn' && (
                             <div className="flex flex-col gap-1.5">
                               <div className="text-[10px] font-semibold text-blue-400/80 uppercase tracking-wider mb-1 px-1 flex items-center gap-1.5"><Activity className="w-3 h-3" /> Chat Context (Turns)</div>
                               {app.mentionSuggestions.map((m: any) => (
                                 <div key={m.name} className="group relative flex flex-col justify-center p-3 rounded-xl cursor-pointer transition-all border overflow-hidden bg-zinc-900/30 border-zinc-800/50 hover:bg-blue-900/20 hover:border-blue-500/30" onClick={() => app.handleMentionSelect(m.name)}>
                                   <div className="absolute inset-0 bg-gradient-to-r from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                   <span className="relative text-sm font-medium text-blue-300 font-mono">#{m.name}</span>
                                   <span className="relative text-[11px] text-zinc-400 mt-1 italic line-clamp-4">"{m.description}"</span>
                                 </div>
                               ))}
                             </div>
                           )}

                           {app.mentionContext === 'gem' && (
                             <div className="flex flex-col gap-1.5">
                               <div className="text-[10px] font-semibold text-indigo-400/80 uppercase tracking-wider mb-1 px-1 flex items-center gap-1.5"><Diamond className="w-3 h-3" /> AI Gems</div>
                               {app.mentionSuggestions.map((m: any) => (
                                 <div key={m.id} className="group relative flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border overflow-hidden bg-zinc-900/30 border-zinc-800/50 hover:bg-zinc-800/80 hover:border-indigo-500/30" onClick={() => app.handleMentionSelect(m.name)}>
                                   <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                   <span className="relative text-sm font-medium text-indigo-300 flex items-center gap-2">:{m.name}</span>
                                   <span className="relative text-[10px] font-mono bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-400 max-w-[120px] truncate">{m.description}</span>
                                 </div>
                               ))}
                             </div>
                           )}

                           {app.mentionContext === 'peer' && (
                             <div className="flex flex-col gap-1.5 mt-2">
                               {app.mentionSuggestions.filter((m: any) => m.type === 'peer').length > 0 && (
                                 <>
                                   <div className="text-[10px] font-semibold text-purple-400/80 uppercase tracking-wider mb-1 px-1 flex items-center gap-1.5"><Activity className="w-3 h-3" /> Active Participants</div>
                                   {app.mentionSuggestions.filter((m: any) => m.type === 'peer').map((m: any) => (
                                     <div key={m.id} className="group relative flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border overflow-hidden bg-zinc-900/30 border-zinc-800/50 hover:bg-purple-900/20 hover:border-purple-500/30" onClick={() => app.handleMentionSelect(m.name, undefined, m.type)}>
                                       <div className="absolute inset-0 bg-gradient-to-r from-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                       <span className="relative text-sm font-medium text-purple-300 flex items-center gap-2">@{m.name}</span>
                                       <span className="relative text-[10px] font-mono bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-400 max-w-[120px] truncate">{m.description}</span>
                                     </div>
                                   ))}
                                 </>
                               )}

                               {app.mentionSuggestions.filter((m: any) => m.type === 'semantic').length > 0 && (
                                 <>
                                   <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1 mt-2 px-1 flex items-center gap-1.5"><Network className="w-3 h-3" /> Semantic Markers</div>
                                   {app.mentionSuggestions.filter((m: any) => m.type === 'semantic').map((m: any) => (
                                     <div key={m.name} className="group relative flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border overflow-hidden bg-zinc-900/30 border-zinc-800/50 hover:bg-zinc-800/80 hover:border-zinc-500/30" onClick={() => app.handleMentionSelect(m.name, undefined, m.type)}>
                                       <div className="absolute inset-0 bg-gradient-to-r from-zinc-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                       <span className="relative text-sm font-medium text-zinc-300 flex items-center gap-2">@{m.name}</span>
                                       <span className="relative text-[10px] font-mono bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-500">Weight: {m.count}</span>
                                     </div>
                                   ))}
                                 </>
                               )}
                             </div>
                           )}

                           {app.mentionContext === 'semantic' && (
                             <div className="flex flex-col gap-1.5 mt-2">
                               <div className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-1 px-1 flex items-center gap-1.5"><Network className="w-3 h-3" /> Semantic Markers</div>
                               {app.mentionSuggestions.map((m: any) => (
                                 <div key={m.name} className="group relative flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border overflow-hidden bg-zinc-900/30 border-zinc-800/50 hover:bg-zinc-800/80 hover:border-zinc-500/30" onClick={() => app.handleMentionSelect(m.name, undefined, m.type)}>
                                   <div className="absolute inset-0 bg-gradient-to-r from-zinc-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                                   <span className="relative text-sm font-medium text-zinc-300 flex items-center gap-2">@{m.name}</span>
                                   <span className="relative text-[10px] font-mono bg-zinc-800/80 px-1.5 py-0.5 rounded text-zinc-500">Weight: {m.count}</span>
                                 </div>
                               ))}
                             </div>
                           )}
                         </>
                       )}
                    </div>
                  )}

                  {/* Slash Command Results */}
                  {app.input.startsWith('/') && app.mentionSearchQuery === undefined && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {[
                        { cmd: '/session ls', desc: 'List recent sessions in the sidebar' },
                        { cmd: '/session new', desc: 'Start a fresh chat session' },
                        { cmd: '/session clear', desc: 'Wipe current session context entirely' },
                        { cmd: '/history', desc: 'View local REPL command history' },
                        { cmd: '/model use [name]', desc: 'Switch active LLM (e.g. pro, flash)' },
                        { cmd: '/gem ls', desc: 'List your available agent profiles' },
                        { cmd: '/graph ls', desc: 'Dump active semantic nodes to chat' },
                        { cmd: '/graph search [query]', desc: 'Fuzzy search across graph nodes' },
                        { cmd: '/graph stats', desc: 'View graph memory metrics' },
                        { cmd: '/clear', desc: 'Clear the chat viewport' }
                      ].filter(c => c.cmd.includes(app.input) || app.input === '/').map((c, i) => (
                        <div key={i} className="group relative flex flex-col p-4 bg-zinc-900/30 hover:bg-zinc-800/80 rounded-xl cursor-pointer transition-all border border-zinc-800/50 hover:border-indigo-500/30 overflow-hidden shrink-0 h-fit"
                             onClick={() => app.setInput(c.cmd.replace(/ \[.*\]/, ' '))}>
                          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <span className="relative text-sm font-mono text-indigo-300 font-medium mb-1.5 drop-shadow-sm">{c.cmd}</span>
                          <span className="relative text-xs text-zinc-400 leading-relaxed">{c.desc}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {app.isReadOnly ? (
                <div className="flex flex-col items-center justify-center p-4 bg-zinc-950/80 border border-amber-500/20 rounded-xl mb-2 gap-3 mt-4 mx-2 lg:mx-0">
                  <div className="flex items-center gap-2 text-amber-500/80 text-sm font-medium">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                    Read-Only Session
                  </div>
                  <p className="text-xs text-zinc-400 text-center max-w-sm">
                    You are viewing a shared session. To continue this conversation or run tools, you must clone it to your own workspace.
                  </p>
                  <button
                    onClick={(e) => {
                      if (app.activeSessionId) {
                         app.handleCloneSession(app.activeSessionId, e);
                         showToast('Session cloned successfully. You are now the owner.');
                      }
                    }}
                    className="flex items-center gap-2 px-6 py-2 bg-emerald-600/90 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-emerald-900/20"
                  >
                    <Copy className="w-4 h-4" />
                    Clone to Continue
                  </button>
                </div>
              ) : (
                <form onSubmit={app.handleSubmit} className="relative flex items-center">
                  <div className="flex items-center gap-1 shrink-0 px-2 lg:px-0">
                    <button
                      type="button"
                      onClick={() => app.setIsSearchEnabled(!app.isSearchEnabled)}
                      disabled={app.isLoading}
                      className={cn("p-2 transition-colors disabled:opacity-40 rounded-lg",
                        app.isSearchEnabled ? "text-blue-400 bg-blue-500/10" : "text-zinc-400 hover:text-indigo-400"
                      )}
                      title={app.isSearchEnabled ? "Google Search Grounding: ON" : "Google Search Grounding: OFF"}
                    >
                      <Globe className={cn("w-4 h-4", app.isSearchEnabled ? "animate-pulse" : "")} />
                    </button>
                    <input type="file" ref={app.fileInputRef} onChange={app.handleFileSelect} multiple className="hidden" />
                    <button type="button" onClick={() => app.fileInputRef.current?.click()} disabled={app.isLoading} className="p-2.5 text-zinc-400 hover:text-indigo-400 transition-colors disabled:opacity-40" title="Attach files">
                      <Paperclip className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="relative w-full group">
                    <input type="text" ref={app.inputRef} value={app.input} onChange={app.handleInputChange} onKeyDown={app.handleKeyDown} placeholder={voice.isListening ? "Listening..." : "Send a message..."}
                      disabled={!app.selectedModel || voice.isListening}
                      className={cn(
                        "w-full bg-zinc-950 border border-zinc-700/50 rounded-xl pl-4 pr-12 py-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all disabled:opacity-50",
                        voice.isListening ? "border-indigo-500/50 focus:border-indigo-500/50 animate-pulse text-indigo-300" : "focus:border-indigo-500/50"
                      )} />
                    <button type="button" onClick={voice.isListening ? voice.stopListening : voice.startListening} disabled={app.isLoading}
                      className={cn("absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-lg transition-colors border",
                        voice.isListening ? "text-red-400 bg-red-500/10 border-red-500/20" : "text-zinc-500 border-transparent hover:text-indigo-400 hover:bg-zinc-800"
                      )} title={voice.isListening ? "Stop listening" : "Dictate command or message"}>
                      {voice.isListening ? <MicOff className="w-4 h-4 animate-pulse" /> : <Mic className="w-4 h-4" />}
                    </button>
                  </div>
                  {app.isLoading ? (
                    <button type="button" onClick={app.handleStopGeneration} className="ml-2 p-2 bg-red-600/20 hover:bg-red-600/40 text-red-500 rounded-lg transition-colors shrink-0" title="Stop generation">
                      <Square className="w-4 h-4 fill-current" />
                    </button>
                  ) : (
                    <button type="submit" disabled={!app.input.trim() || !app.selectedModel}
                      className="ml-2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:hover:bg-indigo-600 shrink-0">
                      <Send className="w-4 h-4" />
                    </button>
                  )}
                </form>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar: Semantic Graph */}
        {app.isRightSidebarOpen && <div className="fixed inset-0 bg-black/60 z-40 lg:hidden backdrop-blur-sm" onClick={() => app.setIsRightSidebarOpen(false)} />}
        <div className={cn("fixed inset-y-0 right-0 z-50 w-full lg:w-96 bg-zinc-950 lg:bg-zinc-900/30 border-l border-zinc-800/50 flex flex-col pt-[max(1.5rem,env(safe-area-inset-top))] px-6 pb-36 lg:pb-[max(1.5rem,env(safe-area-inset-bottom))] lg:py-6 lg:px-6",
          "transform transition-transform duration-300 ease-in-out lg:relative lg:transform-none lg:z-auto",
          app.isRightSidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"
        )}>
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3"><Network className="w-5 h-5 text-indigo-400" /><h2 className="font-medium tracking-wide text-zinc-100">Semantic Markers</h2></div>
            <div className="flex items-center gap-2">
              <div className="flex bg-zinc-900/80 rounded-lg p-0.5 border border-zinc-800">
                <button onClick={() => app.setMarkerViewMode('graph')} className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-all", app.markerViewMode === 'graph' ? "bg-zinc-700/50 text-indigo-300 shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>Graph</button>
                <button onClick={() => app.setMarkerViewMode('list')} className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-all", app.markerViewMode === 'list' ? "bg-zinc-700/50 text-indigo-300 shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>List</button>
                <button onClick={() => app.setMarkerViewMode('artifact')} className={cn("px-2.5 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1", app.markerViewMode === 'artifact' ? "bg-zinc-700/50 text-emerald-300 shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>
                  <FileText className="w-3 h-3" /> Artifacts
                </button>
              </div>
              {app.isViewingHistory && <button onClick={() => app.setSelectedTurnIndex(null)} className="text-xs bg-indigo-500/20 text-indigo-300 px-2.5 py-1.5 rounded-md hover:bg-indigo-500/30 transition-colors">Return to Current</button>}
              <button className="lg:hidden p-1.5 text-zinc-400 hover:text-zinc-100 bg-zinc-800/50 rounded-md" onClick={() => app.setIsRightSidebarOpen(false)}><X className="w-4 h-4" /></button>
            </div>
          </div>
          <div className="flex-1 flex flex-col min-h-0">
            <p className="text-xs text-zinc-500 mb-4 shrink-0">
              {app.isViewingHistory ? `Viewing semantic markers for turn ${app.activeTurnIndex + 1}.` : "Real-time visualization of concepts and their relationships currently active in the model's context window."}
            </p>
            {app.markerViewMode === 'graph' ? (
              <div className="flex-1 min-h-0 relative">
                <SemanticGraph nodes={app.activeState?.semanticNodes ?? []} edges={app.activeState?.semanticEdges ?? []}
                  onNodeClick={(nodeId) => {
                    const targetIdx = app.messages.findIndex(m => m.internalState?.semanticNodes?.some(n => n.id === nodeId));
                    if (targetIdx !== -1) {
                      const element = document.getElementById(`message-${targetIdx}`);
                      if (element) { element.scrollIntoView({ behavior: 'smooth', block: 'center' }); element.classList.add('bg-indigo-900/40', 'transition-colors', 'duration-500'); setTimeout(() => element.classList.remove('bg-indigo-900/40'), 2000); }
                    }
                  }} />
              </div>
            ) : app.markerViewMode === 'artifact' ? (
              <div className="flex-1 min-h-0 relative -mx-2">
                <ArtifactEditor
                  filename="VirtualContext.md"
                  initialContent={app.artifactContent}
                  sessionId={app.activeSessionId || undefined}
                  onSave={async (filename, content, commitMessage, scope) => {
                    app.setArtifactContent(content);
                    const sessionId = app.ensureActiveSession();
                    const git = new GitContextManager(sessionId);
                    
                    if (scope === 'global') {
                      await git.initGlobalRepo();
                      await git.stageGlobalFile(filename, content);
                      await git.commitGlobalChange(commitMessage || 'Automated commit');
                    } else {
                      await git.initRepo();
                      await git.stageFile(filename, content);
                      await git.commitChange(commitMessage || 'Automated commit');
                    }

                    app.executeCommand('/system on');
                    app.executeCommand(`/search off`); // Optional toggle
                  }}
                  onSync={async (scope) => {
                     app.executeCommand(scope === 'global' ? '/global sync' : '/git sync');
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 flex flex-col min-h-0">
                <input type="text" placeholder="Filter markers..." value={app.markerSearchQuery} onChange={(e) => app.setMarkerSearchQuery(e.target.value)}
                  className="w-full bg-zinc-900/50 border border-zinc-700/50 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500/80 mb-3 shrink-0" />
                <div className="flex-1 overflow-y-auto pr-2 space-y-1">
                  {app.filteredMarkers.length === 0 && <div className="text-zinc-500 text-xs text-center py-4">No markers found.</div>}
                  {app.filteredMarkers.map(m => (
                    <div key={m.name} onClick={() => { app.setHistorySearchQuery(m.name); app.setActiveSidebarTab('search'); app.setIsHistorySidebarOpen(true); }}
                      className="flex items-center justify-between p-2 rounded-lg bg-zinc-900/30 border border-transparent hover:border-zinc-700/50 hover:bg-zinc-800/50 cursor-pointer group transition-colors">
                      <span className="text-xs text-zinc-300 font-medium truncate pr-2 group-hover:text-indigo-300 transition-colors">{m.name}</span>
                      <span className="text-[10px] font-mono bg-zinc-800 px-1.5 py-0.5 rounded text-zinc-500 group-hover:bg-indigo-500/10 group-hover:text-indigo-400 transition-colors shrink-0">{m.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Gem Sidebar */}
        {app.isGemSidebarOpen && <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => app.setIsGemSidebarOpen(false)} />}
        <div className={cn("fixed top-0 right-0 bottom-0 w-full sm:w-[400px] lg:w-[340px] bg-zinc-900 border-l border-zinc-800/50 shadow-2xl z-50 transform transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] flex flex-col pt-[env(safe-area-inset-top)] pb-36 lg:pb-[env(safe-area-inset-bottom)]",
          app.isGemSidebarOpen ? "translate-x-0" : "translate-x-full"
        )}>
          <div className="p-4 border-b border-zinc-800 flex justify-between items-center">
            <div className="flex items-center gap-2"><Diamond className="w-4 h-4 text-indigo-400" /><h2 className="text-sm font-semibold tracking-wide text-zinc-200">Gems</h2></div>
            <button onClick={() => { app.setIsGemSidebarOpen(false); app.setEditingGem(null); app.setCreatingGem(false); }} className="text-zinc-500 hover:text-white transition-colors p-1"><X className="w-4 h-4" /></button>
          </div>

          {app.editingGem || app.creatingGem ? (
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
              <div className="flex items-center gap-2 text-sm font-medium text-zinc-300 mb-2">
                <button onClick={() => { app.setEditingGem(null); app.setCreatingGem(false); }} className="text-zinc-500 hover:text-zinc-300"><X className="w-4 h-4" /></button>
                {app.creatingGem ? 'New Custom Gem' : 'Edit Gem'}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400 ml-1">Name</label>
                <input type="text" value={app.editingGem ? app.editingGem.name : app.draftGem.name} onChange={(e) => app.editingGem ? app.setEditingGem({...app.editingGem, name: e.target.value}) : app.setDraftGem({...app.draftGem, name: e.target.value})}
                  placeholder="E.g. Code Reviewer" className="w-full bg-zinc-950/50 text-sm text-zinc-200 border border-zinc-700/50 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-zinc-400 ml-1">Base Model</label>
                <select value={app.editingGem ? app.editingGem.model : app.draftGem.model} onChange={(e) => app.editingGem ? app.setEditingGem({...app.editingGem, model: e.target.value}) : app.setDraftGem({...app.draftGem, model: e.target.value})}
                  className="w-full bg-zinc-950/50 text-sm text-zinc-200 border border-zinc-700/50 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50">
                  {app.chatModels.map((m: any) => { const val = m.name.replace('models/', ''); return <option key={val} value={val}>{m.displayName || val}</option>; })}
                </select>
              </div>
              <div className="space-y-1.5 flex-1 flex flex-col">
                <label className="text-xs font-semibold text-zinc-400 ml-1">System Prompt</label>
                <textarea value={app.editingGem ? app.editingGem.systemPrompt : app.draftGem.systemPrompt} onChange={(e) => app.editingGem ? app.setEditingGem({...app.editingGem, systemPrompt: e.target.value}) : app.setDraftGem({...app.draftGem, systemPrompt: e.target.value})}
                  placeholder="You are an expert..." className="w-full bg-zinc-950/50 text-xs text-zinc-300 border border-zinc-700/50 rounded-lg px-3 py-2.5 flex-1 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 font-mono resize-none min-h-[200px]" />
              </div>
              <div className="pt-2">
                <button onClick={() => { if (app.editingGem) app.handleSaveGem(app.editingGem); else app.handleSaveGem({ id: 'gem-' + Date.now(), name: app.draftGem.name || 'Unnamed', model: app.draftGem.model, systemPrompt: app.draftGem.systemPrompt }); }}
                  disabled={app.editingGem ? !app.editingGem.name : !app.draftGem.name}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50">Save Gem</button>
              </div>
            </div>
          ) : (
            <>
              <div className="p-3">
                <button onClick={() => { app.setCreatingGem(true); app.setDraftGem({ name: '', model: 'gemini-2.5-flash', systemPrompt: '' }); }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-zinc-800 text-zinc-300 hover:text-white hover:bg-zinc-700 border border-zinc-700 rounded-lg text-sm font-medium transition-all">
                  <Plus className="w-4 h-4" /> Create Custom Gem
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 pb-4 space-y-2 mt-1">
                {app.savedGems.map(g => (
                  <div key={g.id} onClick={() => app.handleSelectGem(g.id)}
                    className={cn("group relative px-3 py-3 rounded-lg cursor-pointer transition-colors border flex flex-col gap-1",
                      app.activeGemId === g.id ? "bg-indigo-900/20 border-indigo-500/40 shadow-sm" : "bg-zinc-800/20 border-zinc-800/80 hover:bg-zinc-800/50")}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="text-sm font-semibold text-zinc-200">{g.name}</div>
                        {g.isBuiltIn && <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-sm bg-zinc-800 text-zinc-400">Built-in</span>}
                      </div>
                      <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                        <button onClick={(e) => app.handleSetDefaultGem(g.id, e)} className={cn("p-1.5 rounded-md transition-colors", app.defaultGemId === g.id ? "text-amber-400" : "text-zinc-500 hover:text-amber-400 hover:bg-amber-400/10")} title="Set as Default">
                          <Star className="w-3.5 h-3.5" fill={app.defaultGemId === g.id ? "currentColor" : "none"} />
                        </button>
                        {!g.isBuiltIn && (
                          <>
                            <button onClick={(e) => { e.stopPropagation(); app.setEditingGem(g); }} className="p-1.5 text-zinc-400 hover:text-white hover:bg-zinc-700 rounded-md transition-colors"><Edit3 className="w-3.5 h-3.5" /></button>
                            <button onClick={(e) => app.handleDeleteGem(g.id, e)} className="p-1.5 text-red-500/70 hover:text-red-400 hover:bg-red-500/10 rounded-md transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="text-[11px] text-zinc-500 font-medium">{g.model}</div>
                    <div className="text-xs text-zinc-400 line-clamp-2 mt-1">{g.systemPrompt || <span className="italic opacity-50">No system prompt</span>}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
