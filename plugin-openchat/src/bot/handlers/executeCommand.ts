import { commandNotFound } from "@open-ic/openchat-botclient-ts";
import { Request, Response } from "express";
import { WithBotClient } from "../../types/index.js";
import {
    ChannelType,
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    MemoryType,
    UUID,
} from "@elizaos/core";
import { OpenChatClientService } from "../../services/openchatClient.js";
import { makeMessageUuid, makeRoomUuid, makeUserUuid } from "../../utils/openchatIds.js";
import { OpenChatMessageMetadata } from "../../types/index.js";

/**
 * Type guard to check if request has BotClient
 */
function hasBotClient(req: Request): req is WithBotClient {
    return (req as WithBotClient).botClient !== undefined;
}

/**
 * Helper to create success response
 */
function success(msg?: any) {
    return {
        message: msg?.toResponse(),
    };
}

function sanitizeText(text?: string | null): string {
    if (!text) {
        return "";
    }
    return text.replace(/\u0000/g, "").trim();
}

function createCommandResponseCallback(
    runtime: IAgentRuntime,
    client: WithBotClient["botClient"],
    roomId: UUID,
    metadata: OpenChatMessageMetadata,
    incomingMessageId: UUID,
    channelType: ChannelType,
): HandlerCallback {
    return async (content: Content) => {
        const text = sanitizeText(content.text);
        if (!text) {
            return [];
        }

        if (content.attachments && content.attachments.length > 0) {
            runtime.logger?.warn?.(
                "[OpenChat] Attachments are not supported yet for OpenChat responses",
            );
        }

        const message = (await client.createTextMessage(text)).setFinalised(true);
        const response = await client.sendMessage(message);

        if (response.kind !== "success") {
            runtime.logger?.error?.(
                "[OpenChat] Failed to send response",
                response.message,
            );
            return [];
        }

        const responseMessageId = response.messageId.toString();
        const memory: Memory = {
            id: makeMessageUuid(`${metadata.chatId}-${responseMessageId}`),
            entityId: runtime.agentId as UUID,
            agentId: runtime.agentId,
            roomId,
            content: {
                ...content,
                text,
                source: "openchat",
                channelType,
                inReplyTo: incomingMessageId,
            },
            metadata: {
                type: MemoryType.MESSAGE,
                source: "openchat",
                scope: "room",
                openchat: {
                    ...metadata,
                    messageId: responseMessageId,
                },
            } as any,
            embedding: [],
            createdAt: Date.now(),
        };

        try {
            await runtime.createMemory?.(memory, "messages");
        } catch (error: any) {
            runtime.logger?.error?.(
                "[OpenChat] Failed to persist response memory",
                error?.message || error,
            );
        }

        return [memory];
    };
}

async function sendFallbackResponse(
    runtime: IAgentRuntime,
    client: WithBotClient["botClient"],
    message: string,
): Promise<void> {
    const character = runtime.character;
    const prompt = `You are ${character.name}. ${character.bio?.[0] || ""}

User: ${message}

${character.name}:`;

    let responseText: string;

    try {
        if (typeof (runtime as any).generateText === "function") {
            responseText = await (runtime as any).generateText(prompt);
        } else if (typeof (runtime as any).completion === "function") {
            const response = await (runtime as any).completion({
                prompt,
                stop: ["\n"],
            });
            responseText = response.text || response.content || String(response);
        } else {
            responseText =
                character.postExamples?.[0] || character.bio?.[0] || "Hello! How can I help you?";
        }
    } catch (error: any) {
        runtime.logger?.error("[OpenChat] Text generation error:", error?.message || error);
        responseText = "I'm having trouble generating a response. Please try again.";
    }

    if (typeof responseText !== "string") {
        if (responseText && typeof responseText === "object") {
            responseText = (responseText as any).text
                || (responseText as any).content?.text
                || JSON.stringify(responseText);
        } else {
            responseText = String(responseText || "I'm here to help!");
        }
    }

    const finalText = responseText.trim();
    const responseMsg = (await client.createTextMessage(finalText)).setFinalised(true);
    await client.sendMessage(responseMsg);
}

/**
 * Handle chat command - properly integrated with ElizaOS message system
 */
async function handleChatCommand(
    req: WithBotClient,
    res: Response,
    runtime: IAgentRuntime
): Promise<void> {
    const client = req.botClient;
    
    // Send immediate placeholder to frontend only
    const placeholder = (await client.createTextMessage("Thinking...")).setFinalised(false);
    res.status(200).json(success(placeholder));

    // Get message argument
    const message = client.stringArg("message");
    if (message === undefined) {
        const msg = (await client.createTextMessage("Please provide a message.")).setFinalised(true);
        await client.sendMessage(msg);
        return;
    }
    
    const service = (runtime as any).getService?.("openchat") as OpenChatClientService | undefined;
    if (!service) {
        runtime.logger?.error("[OpenChat] Service not available for chat command");
        await sendFallbackResponse(runtime, client, message);
        return;
    }

    const chatId = client.chatId;
    if (!chatId) {
        runtime.logger?.warn("[OpenChat] Chat identifier missing in command scope");
        await sendFallbackResponse(runtime, client, message);
        return;
    }

    const installation = service.getInstallationByChatId(chatId);
    if (!installation) {
        runtime.logger?.warn("[OpenChat] Installation not found for chat command");
        await sendFallbackResponse(runtime, client, message);
        return;
    }

    const baseMessageId = client.messageId ?? BigInt(Date.now());
    const metadata = service.buildMessageMetadata(
        chatId,
        baseMessageId,
        installation.record.apiGateway,
        client.threadRootMessageId ?? undefined,
    );

    const channelType = metadata.chatKind === "direct" ? ChannelType.DM : ChannelType.GROUP;
    const roomId = makeRoomUuid(metadata.chatKind, metadata.roomKey);
    const senderPrincipal = client.initiator || "OpenChat User";
    const senderId = makeUserUuid(senderPrincipal);
    const incomingMessageId = makeMessageUuid(`${metadata.chatId}-${metadata.messageId}`);

    try {
        await runtime.ensureConnection?.({
            entityId: senderId,
            roomId,
            userName: senderPrincipal,
            name: senderPrincipal,
            source: "openchat",
            worldId: roomId,
            type: channelType,
            channelId: metadata.chatId,
            serverId: metadata.chatId,
        });
    } catch (connectionError: any) {
        runtime.logger?.warn?.(
            "[OpenChat] ensureConnection failed",
            connectionError?.message || connectionError,
        );
    }

    const content: Content = {
        text: message,
        source: "openchat",
        channelType,
        mentionContext: {
            isMention: false,
            isReply: Boolean(metadata.threadId),
            isThread: Boolean(metadata.threadId),
            mentionType: metadata.threadId ? "thread" : undefined,
        },
    } as Content;

    const memory: Memory = {
        id: incomingMessageId,
        entityId: senderId,
        agentId: runtime.agentId,
        roomId,
        content,
        metadata: {
            type: MemoryType.MESSAGE,
            source: "openchat",
            scope: "room",
            openchat: {
                ...metadata,
                sender: senderPrincipal,
            },
        } as any,
        embedding: [],
        createdAt: Date.now(),
    };

    if (!runtime.messageService) {
        runtime.logger?.warn("[OpenChat] messageService unavailable, using fallback response");
        await sendFallbackResponse(runtime, client, message);
        return;
    }

    const callback = createCommandResponseCallback(
        runtime,
        client,
        roomId,
        metadata,
        incomingMessageId,
        channelType,
    );

    try {
        await runtime.messageService.handleMessage(runtime, memory, callback);
    } catch (error: any) {
        runtime.logger?.error("[OpenChat] Error handling chat command:", error?.message || error);
        await sendFallbackResponse(runtime, client, message);
    }
}

/**
 * Handle help command
 */
async function handleHelpCommand(
    req: WithBotClient,
    res: Response,
    runtime: IAgentRuntime
): Promise<void> {
    const client = req.botClient;
    const character = runtime.character;

    const helpText = `🤖 **${character.name}** - AI Agent

**Available Commands:**
• \`/chat <message>\` - Chat with me
• \`/help\` - Show this help message
• \`/info\` - Get information about me

**About Me:**
${character.bio?.[0] || "I'm an AI agent powered by ElizaOS"}

**How to Use:**
Simply use the /chat command followed by your message, or send me a direct message!`;

    const message = (await client.createTextMessage(helpText)).setFinalised(true);
    res.status(200).json(success(message));
    await client.sendMessage(message);
}

/**
 * Handle info command
 */
async function handleInfoCommand(
    req: WithBotClient,
    res: Response,
    runtime: IAgentRuntime
): Promise<void> {
    const client = req.botClient;
    const character = runtime.character;

    const topics = character.topics?.slice(0, 5).join(", ") || "various topics";
    const style = character.style?.all?.[0] || character.style?.chat?.[0] || "friendly and helpful";

    const infoText = `📋 **About ${character.name}**

${character.bio?.[0] || "I'm an AI agent powered by ElizaOS"}

**Topics I can discuss:** ${topics}

**Communication style:** ${style}

**Capabilities:**
• Intelligent conversation
• Context-aware responses
• Memory of past interactions
• Task execution

Powered by ElizaOS 🚀`;

    const message = (await client.createTextMessage(infoText)).setFinalised(true);
    res.status(200).json(success(message));
    await client.sendMessage(message);
}

/**
 * Main command execution handler
 */
export async function executeCommand(
    req: Request,
    res: Response,
    runtime: IAgentRuntime
): Promise<void> {
    if (!hasBotClient(req)) {
        res.status(500).send("Bot client not initialised");
        return;
    }

    const client = req.botClient;
    const commandName = client.commandName;

    runtime.logger?.debug(`[OpenChat] Executing command: ${commandName}`);

    try {
        switch (commandName) {
            case "chat":
                await handleChatCommand(req, res, runtime);
                break;

            case "help":
                await handleHelpCommand(req, res, runtime);
                break;

            case "info":
                await handleInfoCommand(req, res, runtime);
                break;

            default:
                res.status(400).send(commandNotFound());
        }
    } catch (error: any) {
        runtime.logger?.error(`[OpenChat] Error executing command ${commandName}:`, error?.message || error);
        res.status(500).send("Internal server error");
    }
}

export default executeCommand;