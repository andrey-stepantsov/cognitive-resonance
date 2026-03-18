# Cognitive Resonance: User Guide

Welcome to the Cognitive Resonance platform! This document explains how to connect to the network, establish your identity, and configure your AI agents.

## 1. Connecting to the Database

When you first open the web application, you are prompted to select your connection topology: **Edge** or **Local**. This step strictly handles where your session data, chat history, and files are stored.

### Connect via Edge
The **Edge** mode connects your browser directly to the production Cloudflare database (D1). 
- **Requirement:** You must enter the **Edge Auth Token** provided by your administrator.
- **Why?** This token proves you are authorized to read and write to the central collaborative database. It has nothing to do with the AI—it simply guarantees secure database access.

### Connect Local Daemon
The **Local** mode connects your browser to a local file-syncing daemon running on your computer.
- **Requirement:** You must be running the CLI daemon via `cr serve` in your terminal.
- By default, this connects to `http://localhost:3000`. You do not need a password, because your browser is strictly talking to your own machine. All files and chat events are saved immediately to your local hard drive.

---

## 2. Configuring the AI Engine (Gemini)

Once you establish a connection using one of the methods above, the main interface will open. 

Because Cognitive Resonance is designed for privacy and flexibility, **the AI generation happens directly from your browser**, not the Cloudflare backend.

1. In the chat interface, you will see a prompt: **"Enter your Google Gemini API key to get started."**
2. Obtain a free or paid API key from [Google AI Studio](https://aistudio.google.com/apikey) (it usually starts with `AIza...`).
3. Paste that key into the input box and click **Save**.
4. The application will securely store this key in your browser's local storage and use it exclusively to stream LLM responses directly from Google.

---

## 3. Working in the CLI

If you prefer the terminal, you can interact with Cognitive Resonance natively:

1. **Define your AI Key:** Export your Gemini key to your terminal environment so the CLI can generate text:
   ```bash
   export CR_GEMINI_API_KEY="AIzaSy...your-actual-key"
   ```
2. **Start the Chat CLI:**
   ```bash
   npx tsx apps/cli/src/index.ts chat
   ```
3. **Register and Login:** Because the CLI syncs your files to the network, you must establish an identity:
   ```text
   cr> /signup myemail@domain.com password "My Name"
   cr> /login myemail@domain.com password
   ```
   *Your login token will be saved to your local machine, and your subsequent commits and interactions will be securely signed under your name.*
