# Cognitive Resonance CLI Interaction Catalog

To build a fully controlled CLI experience, we must map every user interaction currently handled by the React UI (via the `useCognitiveResonance` hook and Context APIs) to equivalent CLI commands or terminal interfaces.

Here is the comprehensive catalog of all user interactions and their proposed CLI equivalents:

## 1. Chat & Messaging (Core Loop)
| UI Interaction | Hook Function/State | Proposed CLI Command / Interface |
| :--- | :--- | :--- |
| **Send a message** | `handleSubmit`, `setInput` | **Interactive REPL:** `> [message]`<br> **One-off:** `cr chat "message"` |
| **Attach a file** | `handleFileSelect`, `setAttachedFiles` | `cr chat "message" --attach ./file.json` |
| **Cancel generating message** | N/A (Currently implicitly bounded or via browser stop) | `Ctrl+C` during generation in REPL |
| **Copy message** | `setCopiedIndex` / Clipboard API | `cr history show <turn> --copy` |

## 2. Session Management
| UI Interaction | Hook Function/State | Proposed CLI Command / Interface |
| :--- | :--- | :--- |
| **Start new session** | `startNewSession` | `cr session reset` (in REPL) or `cr chat --new` |
| **List past sessions** | `sessions` state | `cr session list` |
| **Load a session** | `handleLoadSession` | `cr session load <session-id>` |
| **Rename a session** | `handleRenameSessionSubmit` | `cr session rename <session-id> "New Name"` |
| **Delete a session** | `handleDeleteSession` | `cr session delete <session-id>` |
| **Export/Download session** | `handleDownloadHistory` | `cr session export --output ./chat.cr.json` |
| **Import a session**| `handleImportSession` | `cr session import ./chat.cr.json` |
| **Search history** | `setHistorySearchQuery`, `handleSearchResultClick` | `cr search "query"` |

## 3. Configuration & Models
| UI Interaction | Hook Function/State | Proposed CLI Command / Interface |
| :--- | :--- | :--- |
| **List available models** | `availableModels` | `cr model list` |
| **Select a model** | `setSelectedModel` | `cr model select <model-name>` |
| **Set System Prompt** | `setSessionSystemPrompt` | `cr config set system_prompt "..."` |
| **Set API Key** | `handleSetApiKey` | `cr config set api_key "..."` or `cr auth login` |

## 4. Gem Management
| UI Interaction | Hook Function/State | Proposed CLI Command / Interface |
| :--- | :--- | :--- |
| **List saved gems** | `savedGems` | `cr gem list` |
| **Select a gem for session**| `handleSelectGem` | `cr gem use <gem-id>` or `cr chat --gem <gem-id>` |
| **Set default gem** | `handleSetDefaultGem` | `cr gem set-default <gem-id>` |
| **Create/Save a custom gem**| `handleSaveGem` | `cr gem create` (opens an interactive prompt for name/description/prompt) |
| **Delete a custom gem** | `handleDeleteGem` | `cr gem delete <gem-id>` |

## 5. Dissonance & Semantic Markers (Advanced Diagnostics)
| UI Interaction | Hook Function/State | Proposed CLI Command / Interface |
| :--- | :--- | :--- |
| **View Dissonance Score** | `isDissonancePanelOpen`, `activeState.dissonanceScore` | `cr turn info <turn-index>` |
| **View Semantic Nodes** | `activeState.semanticNodes` | `cr turn graph <turn-index>` |
| **Search/Filter Markers** | `setMarkerSearchQuery`, `filteredMarkers` | `cr marker list --query "..."` |

---

## Proposed CLI Interface Architecture

To implement this, we should adopt a robust CLI parser like Commander.js or Yargs, and structure the application into two modes:

1. **Interactive REPL Mode (`cr`)**:
   - Running the command without arguments boots an interactive terminal session where the user can chat continuously.
   - Using slash commands (e.g. `/model gemini-1.5-pro`, `/gem use my-gem`, `/attach foo.txt`) within the REPL controls the context.
   
2. **Headless Execution Mode (`cr chat ...`)**:
   - Useful for scripting, piping standard input, and CI environments.
   - Example: `cat error.log | cr chat "Diagnose this error for me" --model gemini-2.5-flash`

Does this catalog cover everything you had in mind for the CLI translation?
