# Quick Start Guide - OpenChat Plugin for ElizaOS

Get your ElizaOS agent running on OpenChat in 10 minutes!

## 🎯 What This Plugin Does

The OpenChat plugin enables your ElizaOS agent to:
- **Respond to Commands**: Users interact via `/chat`, `/help`, and `/info` commands
- **Autonomous Messaging**: Bot can send messages and respond to events automatically
- **Multi-Installation**: Works in groups, channels, and direct messages simultaneously
- **Event Handling**: Processes messages, member joins, reactions, and more
- **Full ElizaOS Integration**: Uses actions, providers, and memory system seamlessly

## ⚡ Fast Setup

### Step 1: Generate Bot Identity (30 seconds)

```bash
openssl ecparam -genkey -name secp256k1 -out private_key.pem
```

**Important**: Keep `private_key.pem` secret and secure!

### Step 2: Get OpenChat Configuration (2 minutes)

1. Go to [OpenChat](https://oc.app)
2. Click your profile → Advanced → "Bot client data"
3. Copy these values:
   - **OpenChat Public Key** - For JWT verification
   - **IC Host** - Internet Computer endpoint (usually `https://ic0.app`)
   - **Storage Index Canister** - For bot storage

### Step 3: Install Plugin (1 minute)

```bash
# In your ElizaOS project directory
npm install @elizaos/plugin-openchat
# or
bun add @elizaos/plugin-openchat
```

### Step 4: Configure Environment (2 minutes)

Create or edit `.env`:

```bash
# Bot Identity - Your private key from Step 1
OPENCHAT_BOT_IDENTITY_PRIVATE_KEY="-----BEGIN EC PRIVATE KEY-----
YOUR_PRIVATE_KEY_CONTENT_HERE
-----END EC PRIVATE KEY-----"

# OpenChat Configuration - Values from Step 2
OPENCHAT_PUBLIC_KEY="your-public-key-here"
OPENCHAT_IC_HOST="https://ic0.app"
OPENCHAT_STORAGE_INDEX_CANISTER="your-canister-id"

# Optional Settings
OPENCHAT_BOT_PORT="3000"
OPENCHAT_WELCOME_NEW_MEMBERS="true"
```

**Note**: The private key should have actual newlines, not `\n` strings.

### Step 5: Add to Your Character (1 minute)

```typescript
// character.ts
import { openchatPlugin } from "@elizaos/plugin-openchat";

export const character = {
    name: "YourBot",
    bio: [
        "I'm a helpful AI assistant on OpenChat",
        "I can answer questions and help with various tasks"
    ],
    topics: ["general", "help", "technology"],
    style: {
        all: ["helpful", "friendly", "concise"],
        chat: ["engaging", "responsive"]
    },
    plugins: [openchatPlugin],
};
```

### Step 6: Start Your Agent (30 seconds)

```bash
elizaos start
# or
npm start
```

You should see:
```
╔════════════════════════════════════════════════════════════╗
║                  OpenChat Bot Ready                       ║
╠════════════════════════════════════════════════════════════╣
║  Bot server running on port 3000                           ║
║  Bot definition: http://localhost:3000/bot_definition     ║
║                                                            ║
║  Next steps:                                               ║
║  1. Register bot on OpenChat using /register_bot          ║
║  2. Install bot in desired chats/groups                   ║
║  3. Users can interact via /chat command                  ║
╚════════════════════════════════════════════════════════════╝
```

### Step 7: Register Bot on OpenChat (2 minutes)

1. **Ensure bot is accessible**: Your bot server must be publicly accessible for OpenChat to reach it
2. **In OpenChat**: Use the `/register_bot` command in any chat
3. **Enter bot URL**: `https://your-domain.com:3000` (or your server's public URL)
4. **Provide bot principal**: OpenChat will derive this from your bot definition endpoint
5. **Review**: OpenChat fetches `/bot_definition` to verify your bot's schema
6. **Confirm**: Complete the registration process

**Note**: For local development, you'll need to expose your bot using a tunnel service (ngrok, cloudflare tunnel, etc.)

### Step 8: Install Bot in a Chat (1 minute)

**For Groups/Communities:**
1. Go to a group you own (or create one)
2. Click Members → "Add bot" or "Bots"
3. Search for your bot by name
4. Click "Add" and grant requested permissions

**For Direct Messages:**
1. Search for your bot by name
2. Start a direct conversation
3. Bot is automatically "installed" in the DM context

**Permissions Granted:**
- **Message Types**: Text, Image, Video, Audio, File
- **Chat Actions**: Read messages, react, delete messages, read chat summary
- **Subscriptions**: Messages, member joins, member leaves

### Step 9: Test It! (30 seconds)

In the chat where you installed the bot:

```
/chat Hello! Are you there?
```

Or mention the bot in a group:
```
@YourBot what can you do?
```

Or in a direct message, just type normally:
```
Tell me about yourself
```

You should get an intelligent response from your ElizaOS agent! 🎉

## 🎯 How It Works

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                     OpenChat Platform                       │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ HTTP/JWT Commands & MsgPack Events
                │
┌───────────────▼─────────────────────────────────────────────┐
│             Express Bot Server (Port 3000)                  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Routes:                                              │  │
│  │  • POST /execute_command  - Command execution         │  │
│  │  • POST /notify          - Event notifications       │  │
│  │  • GET  /bot_definition  - Bot schema                │  │
│  └───────────────────────────────────────────────────────┘  │
└───────────────┬─────────────────────────────────────────────┘
                │
                ├─── Command Handler (executeCommand.ts)
                │    • /chat - Main interaction
                │    • /help - Bot capabilities
                │    • /info - Bot information
                │
                └─── Event Handler (notify.ts)
                     • bot_installed_event
                     • bot_uninstalled_event
                     • bot_chat_event (messages, joins, etc.)
                     │
                     ▼
┌────────────────────────────────────────────────────────────┐
│           OpenChat Message Manager                         │
│  • Processes incoming messages                             │
│  • Manages mentions and replies                            │
│  • Creates ElizaOS Memory objects                          │
│  • Handles response callbacks                              │
└───────────────┬────────────────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────────────────────────┐
│              ElizaOS Runtime & Agent                       │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  • Message Service - Process messages                │  │
│  │  • Actions - Send messages, react, delete, etc.     │  │
│  │  • Providers - Context about installations          │  │
│  │  • Memory System - Persist conversations            │  │
│  │  • Character - Define personality & behavior        │  │
│  └──────────────────────────────────────────────────────┘  │
└───────────────┬────────────────────────────────────────────┘
                │
                │ Response via BotClient
                │
┌───────────────▼─────────────────────────────────────────────┐
│            OpenChat Bot Client Library                      │
│  • Create messages (text, rich content)                     │
│  • Send messages to chats                                   │
│  • React to messages                                        │
│  • Delete messages                                          │
│  • Query chat history                                       │
└───────────────┬─────────────────────────────────────────────┘
                │
                │ Internet Computer Calls
                │
┌───────────────▼─────────────────────────────────────────────┐
│                  OpenChat Canisters (IC)                    │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

**1. OpenChatClientService** (`services/openchatClient.ts`)
- Manages Express server and routes
- Tracks bot installations across multiple chats
- Creates BotClient instances for different scopes
- Coordinates between OpenChat and ElizaOS

**2. Message Manager** (`services/openchatMessageManager.ts`)
- Converts OpenChat events to ElizaOS Memory objects
- Handles message routing and callbacks
- Manages room/user connections
- Processes mentions and replies

**3. Bot Handlers** (`bot/handlers/`)
- `executeCommand.ts` - Processes user commands (/chat, /help, /info)
- `notify.ts` - Handles autonomous events (messages, joins, installs)
- `schema.ts` - Generates bot definition with permissions

**4. Actions** (`actions/`)
- `sendMessage.ts` - Send messages to OpenChat
- `reactToMessage.ts` - Add reactions to messages
- `deleteMessage.ts` - Delete messages (moderation)
- `readChatHistory.ts` - Fetch recent messages

**5. Providers** (`providers/`)
- `chatContext.ts` - Provides context about installations and permissions

### Message Flow

**User Command Flow:**
1. User types `/chat Hello!` in OpenChat
2. OpenChat sends JWT-signed command to `/execute_command`
3. Middleware verifies JWT and creates BotClient
4. Handler extracts message, creates ElizaOS Memory
5. Runtime processes through message service
6. Agent generates response using character/AI
7. Response sent back via BotClient
8. OpenChat displays message to user

**Autonomous Event Flow:**
1. Event occurs in OpenChat (message, join, etc.)
2. OpenChat sends MsgPack notification to `/notify`
3. Handler verifies signature and deserializes event
4. Event routed to appropriate handler
5. MessageManager processes if it's a message event
6. Creates Memory, calls runtime.messageService
7. Agent decides if/how to respond
8. Response sent via BotClient (if applicable)

## 🎮 User Commands

### Available Commands

**`/chat <message>`** - Main interaction command
```
/chat What's the weather like today?
/chat Can you help me with this problem?
/chat Tell me a joke
```

**`/help`** - Show bot capabilities
```
/help
```
Response includes available commands, bot description, and usage instructions.

**`/info`** - Get bot information
```
/info
```
Response includes bot name, bio, topics, style, and capabilities.


## 🔧 Advanced Features

### Autonomous Responses

Beyond commands, your bot can respond autonomously to:

**Mentions in Groups:**
```
@YourBot what do you think about this?
```
Bot automatically detects mentions and responds.

**Direct Messages:**
In DMs, the bot responds to every message without needing `/chat`.

**Replies:**
When users reply to a bot message, it maintains context.

**Threads:**
Bot can participate in threaded conversations.

### Custom Actions

Your agent can use OpenChat-specific actions:

```typescript
import { sendMessageAction } from "@elizaos/plugin-openchat";

// In your custom action
const service = runtime.getService("openchat");
const installations = service.getInstallations();

// Send to all groups where bot is installed
for (const [key, installation] of installations) {
    const client = service.createClientForScope(
        installation.scope,
        installation.record.apiGateway,
        installation.record.grantedAutonomousPermissions
    );
    const msg = await client.createTextMessage("Hello from my action!");
    await client.sendMessage(msg.setFinalised(true));
}
```

### Event Subscriptions

The bot automatically subscribes to:
- **Messages** - All messages in installed chats
- **MembersJoined** - Welcome new members
- **MembersLeft** - Handle departures

Configure in `src/bot/handlers/schema.ts`:
```typescript
default_subscriptions: {
    chat: ["Message", "MembersJoined", "MembersLeft"],
    community: [], // Community-level events
}
```

### Multi-Installation Support

A single bot instance can run in multiple locations:
- Multiple group chats simultaneously
- Multiple community channels
- Multiple direct messages
- Each with different permissions

The plugin tracks all installations and routes messages correctly.

### Context Providers

Access OpenChat context in your actions:

```typescript
import { chatContextProvider } from "@elizaos/plugin-openchat";

// In your agent
const context = await chatContextProvider.get(runtime, message, state);
// Returns info about current installations, permissions, etc.
```

## 🐛 Troubleshooting

### Bot Server Won't Start

**Issue**: Missing environment variables
```
Error: Missing required environment variables
```
**Solution**: Verify all required vars are set:
```bash
echo $OPENCHAT_BOT_IDENTITY_PRIVATE_KEY
echo $OPENCHAT_PUBLIC_KEY
echo $OPENCHAT_IC_HOST
echo $OPENCHAT_STORAGE_INDEX_CANISTER
```

---

**Issue**: Port already in use
```
Error: EADDRINUSE: address already in use :::3000
```
**Solution**: 
```bash
# Change port
OPENCHAT_BOT_PORT=3001

# Or kill process on port
lsof -ti:3000 | xargs kill -9
```

---

**Issue**: Private key format error
```
Error: Invalid private key format
```
**Solution**: Ensure PEM format with actual newlines:
```bash
# Check key format
cat private_key.pem

# Should look like:
-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIK...
...
-----END EC PRIVATE KEY-----
```

### Bot Not Responding

**Checklist:**
1. ✅ Is bot server running? Check: `curl http://localhost:3000/bot_definition`
2. ✅ Is bot registered on OpenChat? (Use `/register_bot`)
3. ✅ Is bot installed in the chat? (Check members list)
4. ✅ Did you grant permissions during installation?
5. ✅ Are you using the correct command format? (`/chat message`)

**Debug Steps:**
```bash
# Check server logs
# Look for these log lines:
[OpenChat] Executing command: chat
[OpenChat] Generated roomId (UUID): ...
[OpenChat] Final response: ...
[OpenChat] ✅ Response sent successfully
```

**Common Issues:**

- **Command not found**: Ensure you're using `/chat` not just `chat`
- **No response**: Check bot has `SendMessages` permission
- **Bot not in member list**: Reinstall the bot
- **Timeout**: Bot might be processing - check for "Thinking..." placeholder

### Registration Issues

**Issue**: `Bot URL not reachable`
```
Error: Failed to fetch bot definition
```
**Solution**:
- Ensure bot server is publicly accessible
- Test: `curl https://your-domain.com:3000/bot_definition`
- For local dev, use ngrok or similar:
  ```bash
  ngrok http 3000
  # Use the ngrok URL for registration
  ```

---

**Issue**: `Invalid bot definition`
**Solution**:
- Check `/bot_definition` returns valid JSON
- Verify schema matches OpenChat requirements
- Review logs for schema generation errors

### Message Sending Failures

**Issue**: Messages not appearing in chat
**Checklist:**
1. ✅ Check bot has `SendMessages` permission
2. ✅ Ensure message is finalized: `.setFinalised(true)`
3. ✅ Verify client scope matches installation
4. ✅ Check for error responses from BotClient

**Debug:**
```typescript
const msg = (await client.createTextMessage(text)).setFinalised(true);
const response = await client.sendMessage(msg);

if (response.kind !== "success") {
    console.error("Send failed:", response.message);
}
```

### JWT Verification Errors

**Issue**: `Invalid JWT signature`
**Solution**:
- Verify `OPENCHAT_PUBLIC_KEY` matches your environment
- Ensure you're using correct OpenChat instance (mainnet/testnet)
- Check key hasn't been changed/rotated

### Memory/Database Errors

**Issue**: `Cannot create room` or `User not found`
**Solution**: These are usually non-fatal warnings. The plugin handles them gracefully:
```typescript
try {
    await runtime.ensureConnection?.(...);
} catch (connectionError) {
    // Plugin logs warning but continues
}
```

If persistent, check your ElizaOS database configuration.

## 📚 Next Steps

### Customize Your Bot

**1. Add Custom Commands**

Edit `src/bot/handlers/schema.ts`:
```typescript
commands: [
    {
        name: "my_command",
        default_role: "Participant",
        description: "My custom command",
        permissions: Permissions.encodePermissions({...}),
        params: [...]
    }
]
```

Implement in `src/bot/handlers/executeCommand.ts`:
```typescript
case "my_command":
    await handleMyCommand(req, res, runtime);
    break;
```

**2. Create Custom Actions**

```typescript
// myAction.ts
import { Action, IAgentRuntime } from "@elizaos/core";
import { OpenChatClientService } from "@elizaos/plugin-openchat";

export const myAction: Action = {
    name: "MY_OPENCHAT_ACTION",
    description: "Do something on OpenChat",
    examples: [...],
    handler: async (runtime, message, state) => {
        const service = runtime.getService("openchat");
        // Your logic here
    }
};
```

**3. Enhance Message Processing**

Override default behavior in `openchatMessageManager.ts` or create custom handlers.

**4. Add Rich Content**

Support images, videos, polls (coming soon):
```typescript
// Future support
const imageMsg = await client.createImageMessage(imageUrl, caption);
await client.sendMessage(imageMsg.setFinalised(true));
```

### Deployment

**Production Checklist:**
- [ ] Use environment variable management (e.g., AWS Secrets Manager)
- [ ] Set up proper logging and monitoring
- [ ] Configure HTTPS with valid certificates
- [ ] Use a process manager (PM2, systemd, Docker)
- [ ] Set up health checks and auto-restart
- [ ] Configure rate limiting if needed
- [ ] Monitor API Gateway usage
- [ ] Backup bot identity keys securely

**Recommended Stack:**
```
Your Server (VPS/Cloud)
  ├── Reverse Proxy (nginx/caddy) - HTTPS termination
  ├── Process Manager (PM2) - Auto-restart
  └── ElizaOS Agent with OpenChat Plugin
```

**Example Docker Deployment:**
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["npm", "start"]
```

### Testing

**Local Testing:**
1. Use ngrok to expose local server
2. Register bot with ngrok URL
3. Test in a private group

**Integration Testing:**
1. Create test group on OpenChat
2. Install bot with minimal permissions
3. Run through command scenarios
4. Test autonomous responses

### Monitoring

**Key Metrics to Track:**
- Command execution rate
- Response latency
- Error rates by type
- Installation count
- Message volume per installation

**Logging Strategy:**
```typescript
runtime.logger.info("[OpenChat] Normal operation");
runtime.logger.warn("[OpenChat] Recoverable issue");
runtime.logger.error("[OpenChat] Critical error");
runtime.logger.debug("[OpenChat] Detailed debug info");
```

## 📖 Learn More

### Documentation

- **[Full README](./README.md)** - Complete documentation
- **[Implementation Summary](./IMPLEMENTATION_SUMMARY.md)** - Technical details
- **[OpenChat Bot Docs](https://github.com/open-chat-labs/open-chat-bots)** - Official bot framework
- **[ElizaOS Docs](https://docs.elizaos.ai/)** - ElizaOS platform documentation

### Resources

- **OpenChat Platform**: https://oc.app
- **Internet Computer**: https://internetcomputer.org/
- **OpenChat Bot Examples**: https://github.com/open-chat-labs/open-chat-bots/tree/master/examples

### Community

- **ElizaOS Discord** - Get help from the community
- **OpenChat Community** - Join OpenChat discussions
- **GitHub Issues** - Report bugs or request features

## 🎓 Examples

### Basic Chatbot

See current implementation - `/chat` command with character-based responses.

### Moderation Bot

Check message content and delete inappropriate messages:
```typescript
// Use deleteMessageAction from the plugin
```

### Welcome Bot

Greet new members (already implemented):
```bash
OPENCHAT_WELCOME_NEW_MEMBERS="true"
```

### Information Bot

Answer questions about your project/community.

### Task Bot

Execute tasks based on user commands and report back.

## 🤝 Contributing

Want to improve the plugin? Contributions welcome!

1. Fork the repository
2. Create feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests if applicable
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 🙏 Acknowledgments

- **OpenChat Labs** - For the excellent bot framework and platform
- **ElizaOS Team** - For the powerful agent runtime
- **IC Community** - For Internet Computer infrastructure

## 💬 Support

Need help? Try these options:

1. **Documentation**: Read the [full README](./README.md)
2. **Examples**: Check example implementations
3. **Issues**: Search or create a GitHub issue
4. **Community**: Ask in ElizaOS Discord or OpenChat
5. **Logs**: Check your bot server logs for detailed errors

---

**Congratulations!** 🎊 Your ElizaOS agent is now live on OpenChat!

Ready to build something amazing? Start customizing your bot and join the OpenChat community!
