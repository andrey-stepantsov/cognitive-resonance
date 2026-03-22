# Guide: Bring Your Own Bot (BYOB) Telegram Integration

Cognitive Resonance features a multi-tenant Telegram integration architecture. Rather than relying on a single central bot that could hit rate limits or expose inferences costs, each user (or workspace) can Bring Their Own Bot (BYOB).

This guide walks you through setting up and authorizing your personal Telegram bot to work natively with your Cognitive Resonance environment.

## 1. Create a Telegram Bot

The first step is to create a bot on Telegram to get your unique Bot Token:

1. Open Telegram and search for `@BotFather`.
2. Start a chat and send the command `/newbot`.
3. Follow the prompts to name your bot and choose a unique username ending in `bot`.
   > **Naming Recommendation:** To keep multiple BYOB bots visually organized in an enterprise setting, consider a standard convention like *`CR <Workspace/Owner Name> Bot`* (e.g., "CR Andrey Bot") with a username format of *`@<your_handle>_cr_bot`*.
4. BotFather will provide you with a **Bot Token** (e.g., `123456789:ABCdefGhIJKlmNoPQRsTUVwXyz`). Do not share this token.

## 2. Authorize your Edge Environment

Before you can register bots or link your identity, your Cloudflare Edge Environment must be explicitly configured to securely recognize you as a **Super Administrator** and to mathematically verify your local CLI's offline commands.

1. In your terminal, navigate to your Cloudflare Worker directory:
   ```bash
   cd packages/cloudflare-worker
   ```
2. Upload your CLI's offline public key to the Cloudflare remote edge so it can authenticate you:
   ```bash
   cat ../../.keys/ed25519.pub | npx wrangler secret put CR_PUBLIC_KEY
   ```
3. Explicitly flag your specific User ID as a restricted Super Administrator:
   ```bash
   echo "your-user-id" | npx wrangler secret put SECRET_SUPER_ADMIN_IDS
   ```
   *(Make sure you replace `your-user-id` with your literal ID, e.g., `andrey`)*

## 3. Register the Bot to your Workspace

Once you have your token, you need to register it to your specific Cognitive Resonance user ID. You must be a System Administrator to execute this command.

1. Open your terminal where the `cr` CLI is authenticated.
2. Run the following command:
   ```bash
   cr admin bot register <your-user-id> <your-bot-token>
   ```

**What happens underneath:**
The CLI will securely send the token to your assigned Cloudflare Edge Worker. The worker stores this token mapping in the Edge D1 Database and **automatically** makes an API call to Telegram to update the webhook. From this point on, whenever anyone messages your bot, the webhook will strictly route the events to your specific `user_id` event graph.

*(Note: The system supports multiple workspaces/users having entirely different bots pointing to the exact same Cloudflare Worker URL. The Worker routes execution natively by parsing the specific URL path matching the secret token).*

## 4. Link your Telegram Identity

To prevent unauthorized users from using your bot (and costing you tokens), Cognitive Resonance uses a strict `telegram_links` authorization table. By default, your bot will reject all messages from anyone until their Telegram ID is linked to your Workspace.

1. Open Telegram and send any message (e.g., "Hello") to your newly created bot.
2. The bot will automatically reject the message, but it will reply with your exact **Telegram ID**:
   > *Unauthorized. Your Telegram ID is `987654321`. Please ask the administrator to run: `cr admin bot link <user-id> 987654321`*
3. Copy that Telegram ID!
4. Return to your terminal and execute the authorization command:
   ```bash
   cr admin bot link <your-user-id> 987654321
   ```

## 5. Test the Integration

Send another message to your bot.

Because your identity is now explicitly authorized, the edge routing agent will accept the log. You will see a native **typing indicator** appear in Telegram while the LLM generates a response or while the Edge delegates execution to an offline local agent.

**Congratulations! Your personal Cognitive Resonance system is now accessible via Telegram.**
