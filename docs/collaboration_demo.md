# Cognitive Resonance Demo: Human-AI Collaborative Chat

This walkthrough outlines a demonstration flow for presenting the real-time multiplayer features of Cognitive Resonance to an audience. It showcases the Cloudflare Durable Object synchronization, secure invite system, WebRTC Intercom, and synchronized AI processing.

## Pre-requisites
1. Start the local development servers (`./start_dev.sh`).
2. Open the Cognitive Resonance PWA in **Browser A** (e.g., Chrome). 
3. Open the Cognitive Resonance PWA in **Browser B** (e.g., Safari or a separate Chrome profile).
4. Ensure both profiles are logged in via the secure local AuthScreen, or using the CLI (`/login`).

---

## 🎬 Act 1: The Multiplayer Foundation & Secure Invites

**1. Creating the Room (Browser A)**
*   _Narrative:_ "Cognitive Resonance isn't a solitary tool—it's an interactive team room secured by session-specific tokens."
*   _Action:_ Click **New Session** in Browser A to start a fresh context. 
*   _Result:_ A new `RoomSession` ID is generated locally and mapped to a high-speed Cloudflare Durable Object.

**2. Inviting a Collaborator (Browser A to Browser B)**
*   _Narrative:_ "Instead of copy-pasting code back and forth or sharing screens on Zoom, I can securely invite my teammate to this specific session."
*   _Action:_ Click the **Invite** button in the PWA header (Browser A). A secure, short-lived invite URL is copied to your clipboard.
*   _Action:_ Paste the invite URL into Browser B.
*   _Result:_ Browser B automatically consumes the invite token, bypasses the login screen, and drops the guest directly into the synchronized session. You should see two active avatars in the header.

**3. Real-time Cursor & Messaging Sync**
*   _Action:_ Move the mouse around the chat pane in Browser A.
*   _Result:_ Browser B displays a live multiplayer cursor tracing Browser A's movements.
*   _Action:_ Type a greeting ("Hey, can you help me brainstorm this module?") in Browser A and hit send.
*   _Result:_ The message instantly pops up in Browser B's feed without refreshing.

---

## 🎬 Act 2: WebRTC Voice Intercom

**1. Ditching Zoom**
*   _Narrative:_ "We could type, but discussing complex architectures is faster out loud. Let's flip on the Intercom."
*   _Action:_ Click the **Intercom** button (Phone icon) in Browser A. The browser will ask for microphone permissions.
*   _Action:_ Click the **Intercom** button in Browser B.
*   _Result:_ The Intercom buttons turn green and start pulsing. WebRTC SDP Offers and ICE candidates are securely relayed through the Cloudflare Worker, establishing a direct P2P audio stream.
*   _Narrative:_ "We are now talking directly to each other, peer-to-peer. The Cloudflare edge just handled the handshake—our audio is direct and sub-millisecond latency."

---

## 🎬 Act 3: Steering the AI Together

**1. Co-piloting the Prompt**
*   _Narrative:_ "Now that we're talking, let's ask the AI to build something for us as a team."
*   _Action:_ In Browser B, switch the AI persona to **System Coder**, and type a prompt: `"We need a Node.js utility function to recursively list files in a Semantic Focus boundary ignoring node_modules."` but *don't hit send yet*.
*   _Narrative:_ "Before I hit send, notice how my prompt draft is synced, and my colleague in Browser A can see exactly what I'm asking."

**2. The AI Responds to the Room**
*   _Action:_ Hit send in Browser B.
*   _Result:_ Both users see the "AI is typing..." indicator. 
*   _Narrative:_ "The AI is processing the context for *both* of us simultaneously. The response streams live." Both browsers render the generated code block concurrently.

**3. Git-Backed Context Tweaking (The Virtual File)**
*   _Narrative:_ "What if the AI's response isn't quite right? Usually you have to explain everything again. In Cognitive Resonance, we use Git-backed Virtual Context."
*   _Action (Browser A):_ Open the `VirtualContext.md` side panel. Type: `"Rule: Always use async/await, no raw promises or callbacks."`
*   _Action (Browser A):_ Click "Save to Context" (Session Workspace). Under the hood, this uses the Event-Sourced Materializer to persist the file.
*   _Action (Browser B):_ In the chat, simply say: `"Rewrite that function."`
*   _Result:_ The AI sees the synchronized Git status matrix pushed by Browser A, complies with the new async/await rule, and outputs the refactored code for both users to see in real-time.

---

## Conclusion
"By fusing real-time sync (Yjs/Durable Objects), P2P Voice (WebRTC), and Git-backed AI context into a single window, Cognitive Resonance eliminates the context-switching tax of modern software engineering. We didn't just share a chat log—we shared an entire AI orchestration environment, backed by robust local security policies."
