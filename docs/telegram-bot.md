# Telegram Bot Guide: Commands, Multi-Player, and Agent Promotion

The Cognitive Resonance Telegram Bot allows you to seamlessly interact with your D1 Event Graph and Edge AI personas directly from your chat client.

## Slash Commands
The bot provides the following integrated commands to manage sessions natively:

- `/help` - Overview of the bot's features.
- `/agents` - Lists the active edge personas available natively (@Guide, @Operator, @SRE). Note that local CLI agents (@coder, @architect) require your local `cr serve` daemon to be running.
- `/multiplayer` - Overview of how groups work.
- `/memory` - Prints the approximate token count of your current session. If it exceeds 6,000, the system automatically offloads to a Semantic Knowledge Graph.
- `/clear` - Deletes the current active context, effectively flushing the memory for the session array.
- `/promote <agent>` - Locks the default routing identity. E.g., `/promote guide` means all ambient human messages route to `@Guide` immediately without needing an `@mention`. Use `/promote clear` to reset.
- `/model <name>` - Switches the LLM instance operating on your thread. Default is `gemini-2.5-pro` natively deployed by Cloudflare Workers.

## Multi-Player Context Proxying
When adding the bot to a **Group Chat**:
1. All participants share a single synchronized `tg_chat_<group-id>` context session in D1.
2. The bot tracks who said what by prepending `first_name` arrays into the message actor graph, allowing the AI to understand multiple human participants.
3. The bot employs **spam protection** and will **not** reply if humans simply talk to each other.
4. To explicitly trigger the bot's AI logic in a group chat, you must ping it (e.g., `@guide what do you think?` or `!operator restart`). Un-pinged payloads form a passive memory block until explicitly queried.

## Supported Edge AI Personas
- **@Guide**: Employs an intelligent Vectorize RAG pipeline mapping codebase and internal `docs/`. Ask it technical architectural logic.
- **@Operator**: System administrator with bindings to read Database metrics, Vectorize capacities, and Cloudflare account usage, and revoke credentials.
- **@SRE**: Observability controller running dissonance evaluation checks, abusive pattern 401 monitoring, and trailing 30-day token cost calculations.
