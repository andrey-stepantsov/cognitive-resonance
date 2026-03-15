import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import Fuse from 'fuse.js';
import { appendDiagnostic, readDiagnosticLog, formatDiagnosticReport } from './diagnostics';

export function activate(context: vscode.ExtensionContext) {
  console.log('Cognitive Resonance extension is now active!');

  const storagePath = context.globalStorageUri.fsPath;

  let setApiKeyCommand = vscode.commands.registerCommand('cognitive-resonance.setApiKey', async () => {
    const defaultVal = await context.secrets.get('gemini-api-key');
    const apiKey = await vscode.window.showInputBox({
      prompt: 'Enter your Gemini API Key',
      ignoreFocusOut: true,
      password: true,
      value: defaultVal || ''
    });

    if (apiKey) {
      await context.secrets.store('gemini-api-key', apiKey);
      vscode.window.showInformationMessage('Gemini API Key saved securely.');
    }
  });

  let startSessionCommand = vscode.commands.registerCommand('cognitive-resonance.start', async () => {
    const apiKey = await context.secrets.get('gemini-api-key');
    if (!apiKey) {
      vscode.window.showErrorMessage('Gemini API Key not set. Please run "Cognitive Resonance: Set Gemini API Key" first.');
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'cognitiveResonance',
      'Cognitive Resonance',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview-ui', 'dist'))]
      }
    );

    setupChatPanel(panel, context, apiKey);
  });

  let viewHistoryCommand = vscode.commands.registerCommand('cognitive-resonance.viewHistory', async () => {
    const fileUris = await vscode.window.showOpenDialog({
      canSelectMany: false,
      openLabel: 'Open History',
      filters: {
        'JSON': ['json']
      }
    });

    if (!fileUris || fileUris.length === 0) {
      return;
    }

    const fileUri = fileUris[0];
    const filename = path.basename(fileUri.fsPath);

    try {
      const fileContent = await fs.promises.readFile(fileUri.fsPath, 'utf8');
      const data = JSON.parse(fileContent);

      if (!data || !Array.isArray(data.messages)) {
        vscode.window.showErrorMessage('Invalid history file format. Expected an array of messages.');
        return;
      }

      const panel = vscode.window.createWebviewPanel(
        'cognitiveResonanceHistory',
        `Resonance History: ${filename}`,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview-ui', 'dist'))]
        }
      );

      panel.webview.html = getWebviewContent(panel.webview, context.extensionPath);

      setTimeout(() => {
        panel.webview.postMessage({ type: 'load_history', data, filename });
      }, 500);

    } catch (error: any) {
      console.error("Error reading history file:", error);
      const errorMessage = typeof error === 'object' && error !== null && 'message' in error 
        ? String(error.message) 
        : String(error);
      appendDiagnostic(storagePath, { level: 'error', context: 'viewHistory', message: errorMessage });
      vscode.window.showErrorMessage('Failed to read history file: ' + errorMessage);
    }
  });

  let loadSessionCommand = vscode.commands.registerCommand('cognitive-resonance.loadSession', async () => {
    // We now just open the webview, the new sidebar handles loading.
    const apiKey = await context.secrets.get('gemini-api-key');
    if (!apiKey) {
      vscode.window.showErrorMessage('Gemini API Key not set. Please run "Cognitive Resonance: Set Gemini API Key" first.');
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'cognitiveResonance',
      'Cognitive Resonance',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview-ui', 'dist'))]
      }
    );
    setupChatPanel(panel, context, apiKey);
  });

  let exportDiagnosticsCommand = vscode.commands.registerCommand('cognitive-resonance.exportDiagnostics', async () => {
    const log = readDiagnosticLog(storagePath);
    if (!log.trim()) {
      vscode.window.showInformationMessage('No diagnostic entries recorded.');
      return;
    }
    const report = formatDiagnosticReport(log);
    await vscode.env.clipboard.writeText(report);
    vscode.window.showInformationMessage(`Diagnostics report copied to clipboard (${log.trim().split('\n').length} entries).`);
  });

  const GALLERY_REGISTRY_URL = 'https://andrey-stepantsov.github.io/cognitive-resonance-vscode/gallery/index.json';
  const RAW_GITHUB_BASE_URL = 'https://raw.githubusercontent.com/andrey-stepantsov/cognitive-resonance-vscode/main/data/gallery-sessions';

  let browseGalleryCommand = vscode.commands.registerCommand('cognitive-resonance.browseGallery', async () => {
    try {
      // 1. Fetch the gallery registry
      const entries: any[] = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Loading Gallery...', cancellable: false },
        async () => {
          const res = await fetch(GALLERY_REGISTRY_URL);
          if (!res.ok) {
            throw new Error(`Failed to fetch gallery registry (HTTP ${res.status})`);
          }
          return res.json() as Promise<any[]>;
        }
      );

      if (!entries || entries.length === 0) {
        vscode.window.showInformationMessage('The public gallery is currently empty.');
        return;
      }

      // 2. Show QuickPick
      interface GalleryQuickPickItem extends vscode.QuickPickItem {
        filename: string;
      }

      const items: GalleryQuickPickItem[] = entries.map(entry => ({
        label: `$(book)  ${entry.title}`,
        description: `${entry.model}  ·  ${entry.messageCount} turns`,
        detail: `${entry.preview}${entry.tags && entry.tags.length > 0 ? '\n$(tag) ' + entry.tags.join(', ') : ''}`,
        filename: entry.filename
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a chat to view in the History Visualizer',
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (!selected) {
        return;
      }

      // 3. Fetch the raw chat JSON
      const rawUrl = `${RAW_GITHUB_BASE_URL}/${selected.filename}`;
      const data: any = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Downloading: ${selected.filename}...`, cancellable: false },
        async () => {
          const res = await fetch(rawUrl);
          if (!res.ok) {
            throw new Error(`Failed to download chat (HTTP ${res.status})`);
          }
          return res.json();
        }
      );

      if (!data || !Array.isArray(data.messages)) {
        vscode.window.showErrorMessage('Invalid gallery chat format.');
        return;
      }

      // 4. Open in History Visualizer webview
      const panel = vscode.window.createWebviewPanel(
        'cognitiveResonanceHistory',
        `Gallery: ${selected.filename.replace('.json', '')}`,
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'webview-ui', 'dist'))]
        }
      );

      panel.webview.html = getWebviewContent(panel.webview, context.extensionPath);

      setTimeout(() => {
        panel.webview.postMessage({ type: 'load_history', data, filename: selected.filename });
      }, 500);

    } catch (error: any) {
      console.error('Error browsing gallery:', error);
      const errorMessage = typeof error === 'object' && error !== null && 'message' in error 
        ? String(error.message) 
        : String(error);
      appendDiagnostic(storagePath, { level: 'error', context: 'browseGallery', message: errorMessage });
      vscode.window.showErrorMessage('Gallery error: ' + errorMessage);
    }
  });

  context.subscriptions.push(setApiKeyCommand, startSessionCommand, loadSessionCommand, viewHistoryCommand, exportDiagnosticsCommand, browseGalleryCommand);
}

function setupChatPanel(panel: vscode.WebviewPanel, context: vscode.ExtensionContext, apiKey: string) {
  const storagePath = context.globalStorageUri.fsPath;
  const sessionsPath = path.join(storagePath, 'sessions');
  const gemsFilePath = path.join(storagePath, 'gems.json');

  // Ensure directories exist
  if (!fs.existsSync(storagePath)) {
    fs.mkdirSync(storagePath, { recursive: true });
  }
  if (!fs.existsSync(sessionsPath)) {
    fs.mkdirSync(sessionsPath, { recursive: true });
  }

  panel.webview.html = getWebviewContent(panel.webview, context.extensionPath);

  // Load saved gems from file
  const loadGemsConfig = () => {
    let config: { gems: any[], defaultGemId: string } = { gems: [], defaultGemId: 'gem-general' };
    try {
      if (fs.existsSync(gemsFilePath)) {
        const data = JSON.parse(fs.readFileSync(gemsFilePath, 'utf8'));
        if (Array.isArray(data)) {
           config.gems = data;
        } else if (data && typeof data === 'object') {
           config.gems = data.gems || [];
           config.defaultGemId = data.defaultGemId || 'gem-general';
        }
      }
    } catch (err) {
      console.error("Failed to parse gems file.", err);
    }
    return config;
  };

  // Load all sessions
  const broadcastSessions = async () => {
    try {
      const files = await fs.promises.readdir(sessionsPath);
      const sessionsList = [];
      for (const file of files) {
        if (file.endsWith('.json')) {
           const p = path.join(sessionsPath, file);
           const stat = await fs.promises.stat(p);
           const content = await fs.promises.readFile(p, 'utf8');
           try {
             const json = JSON.parse(content);
             sessionsList.push({
               id: file.replace('.json', ''),
               timestamp: stat.mtimeMs,
               preview: json.messages.length > 0 ? (json.messages[0].content.substring(0, 40) + '...') : 'Empty Session',
               customName: json.customName,
               config: json.config,
               isArchived: json.isArchived
             });
           } catch(e) {}
        }
      }
      sessionsList.sort((a,b) => b.timestamp - a.timestamp);
      panel.webview.postMessage({ type: 'sessions_loaded', sessions: sessionsList });
    } catch (err) {
      console.error("Failed to read sessions dir", err);
    }
  };

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage(
    async message => {
      try {
      switch (message.type) {
        case 'webview_ready':
          panel.webview.postMessage({ type: 'init_api_key', apiKey });
          return;
        case 'save_history':
          try {
            const uri = await vscode.window.showSaveDialog({
              filters: { 'JSON': ['json'] },
              defaultUri: vscode.Uri.file(`cognitive-resonance-history-${new Date().toISOString().split('T')[0]}.json`),
              saveLabel: 'Save Session History'
            });
            if (uri) {
              await fs.promises.writeFile(uri.fsPath, JSON.stringify(message.data, null, 2), 'utf8');
              vscode.window.showInformationMessage('Session history saved successfully.');
            }
          } catch (err: any) {
             const errorMessage = typeof err === 'object' && err !== null && 'message' in err 
               ? String(err.message) 
               : String(err);
             appendDiagnostic(storagePath, { level: 'error', context: 'saveHistory', message: errorMessage });
          }
          return;
        case 'save_active_session':
          try {
             const sessionId = message.sessionId || `session-${Date.now()}`;
             const fp = path.join(sessionsPath, `${sessionId}.json`);
             await fs.promises.writeFile(fp, JSON.stringify(message.data, null, 2), 'utf8');
             broadcastSessions();
             panel.webview.postMessage({ type: 'session_saved', sessionId });
          } catch (err) {
             console.error("Failed to aut-save session:", err);
          }
          return;
        case 'load_specific_session':
          try {
            const fp = path.join(sessionsPath, `${message.sessionId}.json`);
            if (fs.existsSync(fp)) {
                const content = await fs.promises.readFile(fp, 'utf8');
                const data = JSON.parse(content);
                panel.webview.postMessage({ type: 'resume_history', data, filename: message.sessionId, sessionId: message.sessionId });
            }
          } catch (err) {
            console.error("Failed to load session:", err);
            vscode.window.showErrorMessage("Failed to load session.");
          }
          return;
        case 'delete_session':
          try {
            const fp = path.join(sessionsPath, `${message.sessionId}.json`);
            if (fs.existsSync(fp)) {
               await fs.promises.unlink(fp);
            }
            broadcastSessions();
          } catch (err) {
             console.error("Failed to delete session:", err);
          }
          return;
        case 'rename_session':
          try {
             if (message.sessionId && message.newName) {
               const fp = path.join(sessionsPath, `${message.sessionId}.json`);
               if (fs.existsSync(fp)) {
                 const content = await fs.promises.readFile(fp, 'utf8');
                 const json = JSON.parse(content);
                 json.customName = message.newName;
                 await fs.promises.writeFile(fp, JSON.stringify(json, null, 2), 'utf8');
                 broadcastSessions();
               }
             }
          } catch (err) {
             console.error("Failed to rename session:", err);
          }
          return;
        case 'archive_session':
          try {
             if (message.sessionId) {
               const fp = path.join(sessionsPath, `${message.sessionId}.json`);
               if (fs.existsSync(fp)) {
                 const content = await fs.promises.readFile(fp, 'utf8');
                 const json = JSON.parse(content);
                 json.isArchived = message.archive;
                 await fs.promises.writeFile(fp, JSON.stringify(json, null, 2), 'utf8');
                 broadcastSessions();
               }
             }
          } catch (err) {
             console.error("Failed to archive session:", err);
          }
          return;
        case 'request_sessions':
          broadcastSessions();
          return;
        case 'request_gems':
          const gemsConf = loadGemsConfig();
          panel.webview.postMessage({ type: 'gems_loaded', gems: gemsConf.gems, defaultGemId: gemsConf.defaultGemId });
          return;
        case 'save_gems_config':
          try {
            const configPayload = {
               gems: message.data,
               defaultGemId: message.defaultGemId
            };
            await fs.promises.writeFile(gemsFilePath, JSON.stringify(configPayload, null, 2), 'utf8');
          } catch (err: any) {
            const errorMessage = typeof err === 'object' && err !== null && 'message' in err 
              ? String(err.message) 
              : String(err);
            appendDiagnostic(storagePath, { level: 'error', context: 'saveGemsConfig', message: errorMessage });
          }
          return;
        case 'search_history':
          try {
            const query = message.query;
            if (!query || query.trim() === '') {
               panel.webview.postMessage({ type: 'search_results_loaded', results: [] });
               return;
            }

            const files = await fs.promises.readdir(sessionsPath);
            const searchableItems: any[] = [];

            for (const file of files) {
              if (file.endsWith('.json')) {
                const p = path.join(sessionsPath, file);
                const stat = await fs.promises.stat(p);
                const content = await fs.promises.readFile(p, 'utf8');
                try {
                  const json = JSON.parse(content);
                  const sessionId = file.replace('.json', '');
                  
                  if (json.messages && Array.isArray(json.messages)) {
                    json.messages.forEach((msg: any, idx: number) => {
                      if (msg.role === 'model' && msg.internalState && msg.internalState.semanticNodes && msg.internalState.semanticNodes.length > 0) {
                        const nodes = msg.internalState.semanticNodes.map((n: any) => n.label || n.id);
                        searchableItems.push({
                           sessionId,
                           sessionPreview: json.messages.length > 0 ? (json.messages[0].content.substring(0, 40) + '...') : 'Empty Session',
                           timestamp: stat.mtimeMs,
                           turnIndex: idx, // The exact message index in the chat
                           contextSnippet: msg.content.substring(0, 80) + '...',
                           nodes: nodes
                        });
                      }
                    });
                  }
                } catch (e) { }
              }
            }

            // Configure Fuse for fuzzy search against individual turns
            const options = {
              keys: ['nodes'],
              threshold: 0.3,
              ignoreLocation: true,
              includeMatches: true
            };
            const fuse = new Fuse(searchableItems, options);
            const rawResults = fuse.search(query);
            
            // Map to RankedResult format
            const rankedResults = rawResults.map(result => {
               // Extract the specific nodes that caused the match
               let matchedConcepts: string[] = [];
               if (result.matches) {
                 result.matches.forEach(match => {
                   if (match.key === 'nodes') {
                     matchedConcepts.push(match.value as string);
                   }
                 });
               }
               
               return {
                 sessionId: result.item.sessionId,
                 sessionPreview: result.item.sessionPreview,
                 timestamp: result.item.timestamp,
                 turnIndex: result.item.turnIndex,
                 contextSnippet: result.item.contextSnippet,
                 matchedConcepts: Array.from(new Set(matchedConcepts)) // deduplicate
               };
            });

            panel.webview.postMessage({ type: 'search_results_loaded', results: rankedResults, query });

          } catch(err) {
            console.error("Failed to search history:", err);
          }
          return;
        case 'save_artifact':
          try {
            const saveUri = await vscode.window.showSaveDialog({
              filters: { 'All Files': ['*'] },
              defaultUri: vscode.Uri.file(message.filename || 'artifact.txt'),
              saveLabel: 'Save Artifact'
            });
            if (saveUri) {
              await fs.promises.writeFile(saveUri.fsPath, message.content, 'utf8');
              vscode.window.showInformationMessage(`Artifact saved: ${path.basename(saveUri.fsPath)}`);
            }
          } catch (err: any) {
            const errorMessage = typeof err === 'object' && err !== null && 'message' in err 
              ? String(err.message) 
              : String(err);
            appendDiagnostic(storagePath, { level: 'error', context: 'saveArtifact', message: errorMessage });
            vscode.window.showErrorMessage('Failed to save artifact: ' + errorMessage);
          }
          return;
      }
      } catch (unexpectedError: any) {
        // Safety net
        console.error("Unexpected error in message handler:", unexpectedError);
        const errorMessage = typeof unexpectedError === 'object' && unexpectedError !== null && 'message' in unexpectedError 
          ? String(unexpectedError.message) 
          : String(unexpectedError);
        appendDiagnostic(storagePath, { level: 'error', context: 'messageHandler', message: errorMessage, detail: unexpectedError.stack || unexpectedError });
        panel.webview.postMessage({ type: 'error', error: errorMessage });
      }
    },
    undefined,
    context.subscriptions
  );
}

function getWebviewContent(webview: vscode.Webview, extensionPath: string): string {
  const distPath = path.join(extensionPath, 'webview-ui', 'dist');
  
  // Note: we'll configure vite to output index.js and index.css without hashes
  const scriptUri = webview.asWebviewUri(vscode.Uri.file(path.join(distPath, 'assets', 'index.js')));
  const styleUri = webview.asWebviewUri(vscode.Uri.file(path.join(distPath, 'assets', 'index.css')));

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Cognitive Resonance</title>
        <link href="${styleUri}" rel="stylesheet">
      </head>
      <body>
        <div id="root"></div>
        <script>
          const vscode = acquireVsCodeApi();
          window.vscode = vscode;
        </script>
        <script type="module" src="${scriptUri}"></script>
      </body>
    </html>
  `;
}

export function deactivate() {}
