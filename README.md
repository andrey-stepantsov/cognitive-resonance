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

> **⚠️ Important Note for OSS Developers:**
> Because Cognitive Resonance is deeply integrated with Cloudflare Edge (D1, Workers, Durable Objects) and the Gemini API, an arbitrary developer cannot simply `npm run dev` out of the box. 
> To successfully boot the environment, you must either:
> 1. Run our fully idempotent automated provisioning script (`packages/cloudflare-worker/scripts/provision-prod.sh`) to seamlessly instantiate your D1 Database, Vectorize index, R2 Buckets, and Cloudflare Queues; and supply your own Gemini API keys in the `.env` file.
> 2. Obtain explicit authorization/access tokens from the repository maintainer.
>
> **Continuous Integration / Continuous Deployment (CI/CD)**
> Cognitive Resonance is configured with a rigorous zero-downtime, fully-automated GitHub Actions CD pipeline. Upon pushing to `main`, the CI natively executes structural provisioning validations via `wrangler`, securely hot-swaps the production Edge Worker, and immediately validates Edge responsiveness via a programmatic HTTP assertion smoke-test (`/api/system/health`).

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

4. **Deploy Telegram Webhooks (Optional)**
   If you wish to configure natively isolated Telegram chat bots that pipe directly into your edge workers, please follow the [Bring Your Own Bot (BYOB) Integration Guide](./docs/guide-telegram-integration.md).

### 🌍 Workspace Configuration Resolution

The Cognitive Resonance CLI is designed to be executed from anywhere on your system! 
When executing commands like `cr-dev chat`, the CLI will automatically:
1. Crawl upward from your current directory to find the nearest `.cr/` folder, safely operating within that localized workspace's event context.
2. If it reaches the system root without finding a local workspace, it will seamlessly fall back to your global user profile configuration located at `~/.cr/`.

*Note: This architecture guarantees that event streams and AI cognitive states are securely isolated within specific projects, while still granting system administrators the maximum flexibility to run headless commands globally.*

---

## 📚 Documentation Map

All system documentation is organized under a strict **Flat Prefix Taxonomy** inside the `docs/` folder, ensuring modules remain deeply discoverable and categorizable at a glance.

- **[Architecture Deep-Dive](./ARCHITECTURE.md)** 
  Start here for the high-level system topography, Workspace explanations, and Cloudflare edge design.

- **[End User Guide](./docs/guide-user-guide.md)** 
  The core operating manual for utilizing the system effectively.

- **[Telegram BYOB Integration](./docs/guide-telegram-integration.md)** 
  A step-by-step guide for provisioning zero-trust multi-tenant Telegram robot connections securely routed to specific workspaces.

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
