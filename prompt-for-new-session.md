# Objective: Phase 3 - The Headless Orchestrator (The OS Watchdog)

We are beginning **Phase 3** of the Cognitive Resonance and Phantomachine Joint Architecture Roadmap (`cr-core-contracts/ROADMAP.md`).
The secure WebSocket execution wire (Phase 2) has successfully connected the Cognitive Resonance edge client to the Phantomachine V1 Daemon OS. 

Right now, Phantomachine (`node-executor`) executes payloads blindly over the WebSocket bridge via `EXECUTION_REQUESTED`.
The goal of this current session is to make the operating environment safe for autonomous, headless Actor execution by defining and enforcing an OS-level "Watchdog" orchestration loop.

## Key Requirements for this Session:
1. **Analyze `phantomachine/ai-operating-environment/node-executor`**: Specifically focus on where `EXECUTION_REQUESTED` payloads are handled.
2. **Pre-flight & Post-flight Assessment**: Implement logic that assesses available OS resources before dropping into `docker run`, and wraps the exit code and outputs into a productivity assessment once execution finishes.
3. **Runaway OS Termination**: Guarantee Phantomachine has strict timeout enforcement to identify looping AI paradoxes or infinite processes and instantly send an OS-defined SIGKILL.

Start by assuming the role of the dedicated **Phantomachine Systems Engineer**, reviewing the current state of `docker.ts` and `socket.ts`, and devising a clean `task.md` detailing how to implement the Orchestrator loop inside the V1 Daemon.
