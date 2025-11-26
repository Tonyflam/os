# Testing Guide - OpenChat Plugin

This guide covers how to test all features of the OpenChat plugin, including message reactions.

## 🧪 Testing Message Reactions

### Prerequisites
- Bot is running and registered on OpenChat
- Bot is installed in a test group/channel
- Bot has been granted **ReactToMessages** permission (automatically requested)

### Current Implementation Status

✅ **Reaction capability is implemented** via `reactToMessageAction`
✅ **Permission is requested** in bot definition (`autonomous_config`)
✅ **Supported emojis**: Any Unicode emoji (👍, ❤️, 🎉, 😊, etc.)

### Method 1: Test via Natural Language Commands

The bot can be instructed to react through conversation:

```
User: /chat React with a thumbs up to this message
Bot: [Processes and attempts to add 👍 reaction]

User: /chat Add a heart reaction to my previous message  
Bot: [Attempts to add ❤️ reaction]

User: /chat React to the OpenChat message with 🎉
Bot: [Attempts to add 🎉 reaction]
```

**Note**: This depends on the agent's AI understanding the intent and triggering the `reactToMessageAction`.

### Method 2: Add a Direct `/react` Command

For easier testing, you can add a dedicated `/react` command:

#### Step 1: Add command to schema (`src/bot/handlers/schema.ts`)

Add this to the `commands` array:

```typescript
{
    name: "react",
    default_role: "Participant", 
    description: "Add a reaction to the previous message",
    permissions: Permissions.encodePermissions({
        ...emptyPermissions,
        message: ["Text"],
        chat: ["ReactToMessages", "ReadMessages"],
    }),
    direct_messages: false,
    params: [
        {
            name: "emoji",
            required: false,
            description: "Emoji to react with (default: 👍)",
            placeholder: "👍",
            param_type: {
                StringParam: {
                    min_length: 1,
                    max_length: 10,
                    choices: [],
                    multi_line: false,
                },
            },
        },
    ],
}
```

#### Step 2: Add handler (`src/bot/handlers/executeCommand.ts`)

Add this handler function:

```typescript
async function handleReactCommand(
    req: WithBotClient,
    res: Response,
    runtime: IAgentRuntime
): Promise<void> {
    const client = req.botClient;
    
    // Get emoji parameter or use default
    const emoji = client.stringArg("emoji") || "👍";
    
    try {
        // Get the chat summary to find recent messages
        const summary = await client.chatSummary();
        if (summary.kind === "error") {
            const errorMsg = await client.createTextMessage(
                "Unable to fetch chat information."
            );
            res.status(200).json(success(errorMsg.setFinalised(true)));
            await client.sendMessage(errorMsg.setFinalised(true));
            return;
        }

        const latestEventIndex = summary.latestEventIndex ?? 0;
        
        // Fetch recent events to find a message to react to
        const events = await client.chatEvents(
            {
                kind: "chat_events_page",
                startEventIndex: Math.max(0, latestEventIndex - 10),
                ascending: false,
                maxEvents: 10,
                maxMessages: 10,
            },
            undefined
        );

        if (events.kind !== "success" || events.events.length === 0) {
            const errorMsg = await client.createTextMessage(
                "No recent messages found to react to."
            );
            res.status(200).json(success(errorMsg.setFinalised(true)));
            await client.sendMessage(errorMsg.setFinalised(true));
            return;
        }

        // Find the most recent user message (not from bot)
        let targetMessageId: bigint | undefined;
        for (const event of events.events) {
            if (event.event.kind === "message" && 
                event.event.senderContext?.kind !== "bot") {
                targetMessageId = event.event.messageId;
                break;
            }
        }

        if (!targetMessageId) {
            const errorMsg = await client.createTextMessage(
                "No user messages found to react to."
            );
            res.status(200).json(success(errorMsg.setFinalised(true)));
            await client.sendMessage(errorMsg.setFinalised(true));
            return;
        }

        // Add the reaction
        const reactionResponse = await client.addReaction(targetMessageId, emoji, undefined);
        
        if (reactionResponse.kind !== "success") {
            const errorMsg = await client.createTextMessage(
                `Failed to add reaction: ${reactionResponse.message || "Unknown error"}`
            );
            res.status(200).json(success(errorMsg.setFinalised(true)));
            await client.sendMessage(errorMsg.setFinalised(true));
            return;
        }

        const successMsg = await client.createTextMessage(
            `Added ${emoji} reaction!`
        );
        res.status(200).json(success(successMsg.setFinalised(true)));
        await client.sendMessage(successMsg.setFinalised(true));

        runtime.logger?.info(`[OpenChat] Added reaction ${emoji} to message ${targetMessageId}`);
        
    } catch (error: any) {
        runtime.logger?.error("[OpenChat] Error in react handler:", error?.message || error);
        const errorMsg = await client.createTextMessage(
            "Failed to add reaction. Please try again."
        );
        res.status(200).json(success(errorMsg.setFinalised(true)));
        await client.sendMessage(errorMsg.setFinalised(true));
    }
}
```

#### Step 3: Add to command switch

In `executeCommand` function, add:

```typescript
case "react":
    await handleReactCommand(req, res, runtime);
    break;
```

### Method 3: Test Programmatically

You can test the reaction functionality directly:

```typescript
import { OpenChatClientService } from "@elizaos/plugin-openchat";

// In your test or custom action
const service = runtime.getService("openchat") as OpenChatClientService;
const installations = service.getInstallations();

for (const [key, installation] of installations) {
    const client = service.createClientForScope(
        installation.scope,
        installation.record.apiGateway,
        installation.record.grantedAutonomousPermissions
    );
    
    // Get recent messages
    const summary = await client.chatSummary();
    const latestIndex = summary.latestEventIndex ?? 0;
    
    const events = await client.chatEvents({
        kind: "chat_events_page",
        startEventIndex: Math.max(0, latestIndex - 5),
        ascending: false,
        maxEvents: 5,
        maxMessages: 5,
    }, undefined);
    
    if (events.kind === "success" && events.events.length > 0) {
        const messageEvent = events.events.find(e => e.event.kind === "message");
        if (messageEvent && messageEvent.event.kind === "message") {
            // Add reaction
            const result = await client.addReaction(
                messageEvent.event.messageId,
                "👍",
                undefined
            );
            console.log("Reaction result:", result);
        }
    }
}
```

## 🧪 Testing Other Features

### Testing Send Message

```
/chat Hello, this is a test message!
```

Expected: Bot responds with an intelligent reply.

### Testing Help Command

```
/help
```

Expected: Bot displays available commands and capabilities.

### Testing Info Command

```
/info
```

Expected: Bot displays information about itself.

### Testing Direct Messages

1. Start a DM with your bot
2. Send a message without using `/chat`
3. Bot should respond automatically

### Testing Mentions in Groups

```
@YourBotName what do you think about this?
```

Expected: Bot detects mention and responds.

### Testing Welcome Messages

1. Set `OPENCHAT_WELCOME_NEW_MEMBERS="true"`
2. Add a new member to the group
3. Bot should welcome the new member

### Testing Read Chat History

The bot can read recent messages. To test this, you need to trigger the `readChatHistoryAction`.

**Via natural language**:
```
/chat Read the last 10 messages from this chat
/chat Show me recent conversation history
/chat What was discussed in the chat recently?
```

### Testing Message Deletion

Requires **DeleteMessages** permission (already requested in autonomous_config).

**Via natural language**:
```
/chat Delete that inappropriate message
/chat Remove the last message
```

**Note**: Only works on messages the bot has permission to delete.

## 🔍 Debugging Reaction Issues

### Check Permissions

1. **Verify bot definition includes ReactToMessages**:
   ```bash
   curl http://localhost:3000/bot_definition | jq '.autonomous_config.permissions'
   ```
   
   Should show `ReactToMessages` in the chat permissions.

2. **Check installation permissions**:
   Look at server logs when bot is installed:
   ```
   [OpenChat] Bot installed in group_chat: group-xyz (messagePermMask=31)
   ```

3. **Verify permission was granted during installation**:
   In OpenChat, when installing the bot, ensure you checked the box for reaction permissions.

### Common Issues

**Issue**: "Failed to add reaction: Permission denied"
**Solution**: 
- Reinstall the bot and grant ReactToMessages permission
- Or update bot permissions in group settings

**Issue**: "Could not determine target message id"
**Solution**:
- The action needs a valid message ID to react to
- Make sure you're passing the messageId in options or state
- Or react to the current message context

**Issue**: Reaction command doesn't appear
**Solution**:
- Restart the bot after adding the command to schema.ts
- Check `/bot_definition` endpoint includes the new command
- Re-register the bot on OpenChat

### Debug Logging

Enable detailed logging:

```typescript
// In your character or environment
runtime.logger.setLevel("debug");
```

Look for these log lines:
```
[OpenChat] Added reaction '👍' in group-xyz
[OpenChat] Failed to add reaction: <error message>
```

## 📊 Test Checklist

Use this checklist to verify all functionality:

### Basic Commands
- [ ] `/chat` command works
- [ ] `/help` command works  
- [ ] `/info` command works

### Message Handling
- [ ] Bot responds to direct messages
- [ ] Bot detects and responds to mentions
- [ ] Bot handles replies in context
- [ ] Bot participates in threads

### Advanced Features
- [ ] Bot can add reactions (👍, ❤️, etc.)
- [ ] Bot reads chat history
- [ ] Bot can delete messages (if needed)
- [ ] Bot welcomes new members (if enabled)

### Multiple Installations
- [ ] Bot works in multiple groups simultaneously
- [ ] Bot works in channels
- [ ] Bot works in DMs
- [ ] Different permissions work in different chats

### Error Handling
- [ ] Invalid commands return helpful errors
- [ ] Missing permissions fail gracefully
- [ ] Network issues are handled properly
- [ ] Malformed input doesn't crash bot

## 🎯 Performance Testing

### Load Testing

Test bot with multiple simultaneous messages:

```bash
# Send multiple commands rapidly
for i in {1..10}; do
  echo "Testing message $i"
  # Use OpenChat to send /chat Test message $i
done
```

### Latency Testing

Measure response times:
- Command execution latency (should be < 2s for simple responses)
- Autonomous message handling (should be < 5s)
- Reaction addition (should be < 1s)

### Memory Testing

Monitor bot memory usage over time with multiple installations and high message volume.

## 📝 Test Report Template

```markdown
## Test Session Report

**Date**: YYYY-MM-DD
**Bot Version**: x.y.z
**OpenChat Environment**: Mainnet/Testnet

### Test Results

#### Commands
- `/chat`: ✅ Pass / ❌ Fail - Notes: ...
- `/help`: ✅ Pass / ❌ Fail - Notes: ...
- `/info`: ✅ Pass / ❌ Fail - Notes: ...
- `/react`: ✅ Pass / ❌ Fail - Notes: ...

#### Features
- Message Reactions: ✅ Pass / ❌ Fail - Notes: ...
- Direct Messages: ✅ Pass / ❌ Fail - Notes: ...
- Mentions: ✅ Pass / ❌ Fail - Notes: ...
- Welcome Messages: ✅ Pass / ❌ Fail - Notes: ...

#### Issues Found
1. [Description]
2. [Description]

#### Performance
- Average response time: Xms
- Memory usage: XMB
- Error rate: X%
```

## 🚀 Next Steps

After testing reactions:
1. Test all other actions (send, delete, read history)
2. Test with different message types (text, images, etc.)
3. Test permission boundaries
4. Test error scenarios
5. Test at scale with multiple installations

---

**Happy Testing!** 🎉

For issues or questions, check the [QUICKSTART.md](./QUICKSTART.md) or [README.md](./README.md).
