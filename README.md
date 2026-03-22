# Cognitive Resonance

Cognitive Resonance is a state-of-the-art multi-platform AI chat application built atop a Local-First Event-Sourced architecture. It natively supports multi-repository orchestration, strict asynchronous multi-agent collaboration, and robust cryptographic edge synchronization.

---

## ⛅ Cloudflare Edge Native
This platform is aggressively optimized to run entirely on the **Cloudflare Edge Infrastructure**:
- **Cloudflare D1** handles all scalable Event Graph SQLite persistence.
- **Cloudflare Durable Objects** govern sub-millisecond WebSockets orchestrating live multi-user and multi-agent AI synchronization.
- **Cloudflare Vectorize** powers real-time conversational semantic embeddings.
- **Cloudflare Workers** natively handle the Git Smart HTTP transport and process the incremental `cr serve` sync daemons.

---

## 🚀 Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```
2. **Setup Environment**
   Ensure your `.env` is configured correctly (refer to `.env.example`).
   
3. **Boot the Local Environment**
   ```bash
   ./start_dev.sh
   ```
   This script will automatically boot the local core packages, database engines, and backend integrations.

---

## 📚 Documentation Map

All system documentation is organized under a strict **Flat Prefix Taxonomy** inside the `docs/` folder, ensuring modules remain deeply discoverable and categorizable at a glance.

- **[Architecture Deep-Dive](./ARCHITECTURE.md)** 
  Start here for the high-level system topography, Workspace explanations, and Cloudflare edge design.

- **[End User Guide](./docs/guide-user-guide.md)** 
  The core operating manual for utilizing the system effectively.

- **Component Designs (`docs/design-*`)** 
  Explore precise component specifications such as the Semantic Librarian Auditor or the DSL definitions.
  
- **Technical Implementation (`docs/tech-*`)** 
  Dive into low-level architectural internals, including our custom Git Object Storage integration and AI Cognitive State engines.

- **Visual Demonstrations (`docs/demo-*`)** 
  View high-resolution `.gif` and `.cast` terminal recordings of the system in action, including live Yjs collaboration and isolated Multi-Agent Autonomous generations!

- **[Project Roadmap](./docs/proj-roadmap.md)** 
  View our sequenced architectural roadmap and remaining milestone checklists.

---

## 🤝 Contributing
Please review our [Contributing Guidelines](./docs/proj-contributing.md) and [Bug Database](./docs/proj-bug-database.md) before submitting pull requests or issue tickets.
