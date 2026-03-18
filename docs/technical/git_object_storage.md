# Git Object Storage Protocol

Cognitive Resonance treats user artifacts and documents as Git repositories. However, instead of relying on a traditional central Git server (like GitHub or a standard bare Git repo on a VPS), we have integrated Git directly into the Cloudflare Edge network architecture to enable hyper-scalable, serverless synchronization.

## Overview
The protocol spans client-side isomorphic execution and server-side Smart HTTP interception. The core principle relies on exploding standard Git packfiles during push operations and persisting them as raw loose objects within Cloudflare R2, while seamlessly reconstructing packfiles dynamically on pull requests.

## 1. Client-Side Git Execution
All client environments—whether the CLI (`apps/cli`), the Progressive Web App (`apps/pwa`), or the VS Code Extension (`apps/extension`)—embed `isomorphic-git`.
- Artifact documents are abstracted and treated internally as localized virtual repositories.
- `GitRemoteSync` orchestrates the translation between internal event edits and Git commits, performing seamless `isomorphic-git.push` and `pull` operations under the hood.

## 2. Server-Side Smart HTTP Implementation
The Cloudflare Worker natively implements the Git Smart HTTP protocol constraints. By capturing the `/git/*` HTTP endpoints, the worker emulates a full-fledged git server:
- **`git-info-refs`**: Advertises available references directly from R2 lookup. R2 stores heads (e.g., `refs/heads/main`) as lightweight text blobs containing the raw commit SHA.
- **`git-receive-pack`**: Handles incoming pushes.
- **`git-upload-pack`**: Handles outgoing pulls.

## 3. Unpacking and R2 Storage (Push)
When a client executes a `git push`, `isomorphic-git` constructs a highly optimized `PACK v2` packfile (interleaved with OFS and REF deltas) and transmits it to the worker.
1. The Cloudflare Worker intercepts the payload and passes it to `packParser.ts`.
2. The parse routine completely unpacks the data structure, expanding all interleaved deltas into their full tree/blob raw signatures.
3. Every individual object is hashed and permanently stored in **Cloudflare R2** under the standard `{userId}/objects/{sha[0:2]}/{sha[2:]}` sharded namespace strategy.
4. The requested branch reference acts as a pointer and is updated within the `{userId}/refs/heads/` namespace.

## 4. Dynamic Packfile Generation (Pull)
When a client triggers a `git pull`, the system dynamically reconstitutes Git history for transfer.
1. `isomorphic-git` initiates a `git-upload-pack` HTTP trigger conveying the "want" SHAs (what it needs) alongside "have" SHAs (the outer boundary of what it currently possesses).
2. The Worker executes a fast Breadth-First-Search (BFS) via `packParser.ts`, walking from the "want" object boundary backward through commit references, tree nodes, and file blobs, stopping immediately at the documented "have" assertions.
3. It buffers to stream these collected loose R2 objects.
4. Finally, the system dynamically compresses this payload, building complex `OFS_DELTA` configurations natively, streaming a compliant `PACK v2` file directly to the client's local node.
