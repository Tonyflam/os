import {
    ChannelType,
    Content,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    MemoryType,
    UUID,
} from "@elizaos/core";
import {
    BotClient,
    BotChatEvent,
    MessageEvent as OCMessageEvent,
} from "@open-ic/openchat-botclient-ts";
import { OpenChatMessageMetadata } from "../types/index.js";
import {
    makeMessageUuid,
    makeRoomUuid,
    makeUserUuid,
} from "../utils/openchatIds.js";

function sanitizeText(text?: string | null): string {
    if (!text) {
        return "";
    }
    return text.replace(/\u0000/g, "").trim();
}

function buildPlaceholderForContent(event: OCMessageEvent): string {
    const kind = event.content.kind;
    switch (kind) {
        case "text_content":
            return sanitizeText(event.content.text);
        case "image_content":
            return `Received an image${event.content.caption ? `: ${event.content.caption}` : ""}`;
        case "video_content":
            return `Received a video${event.content.caption ? `: ${event.content.caption}` : ""}`;
        case "audio_content":
            return `Received an audio clip${event.content.caption ? `: ${event.content.caption}` : ""}`;
        case "file_content":
            return `Received a file: ${event.content.name}`;
        case "poll_content":
            return `Received a poll with ${event.content.config.options.length} options.`;
        default:
            return `Received ${kind.replace(/_/g, " ")}.`;
    }
}

export class OpenChatMessageManager {
    constructor(private readonly runtime: IAgentRuntime) {}

    public async handleMessageEvent(
        botClient: BotClient,
        chatEvent: BotChatEvent,
        metadata: OpenChatMessageMetadata,
    ): Promise<void> {
        const event = chatEvent.event;
        if (event.kind !== "message") {
            return;
        }
        if (event.deleted) {
            return;
        }
        if (event.senderContext?.kind === "bot") {
            // Ignore messages produced by bots (including ourselves)
            return;
        }

        const textContent = buildPlaceholderForContent(event);
        if (!textContent) {
            this.runtime.logger?.debug?.("[OpenChat] Skipping empty message event");
            return;
        }

        const channelType = metadata.chatKind === "direct" ? ChannelType.DM : ChannelType.GROUP;
        const roomId = makeRoomUuid(metadata.chatKind, metadata.roomKey) as UUID;
        const senderId = makeUserUuid(event.sender);
        const incomingMessageId = makeMessageUuid(`${metadata.chatId}-${metadata.messageId}`);

        try {
            await this.runtime.ensureConnection?.({
                entityId: senderId,
                roomId,
                userName: event.sender,
                name: event.sender,
                source: "openchat",
                worldId: roomId,
                type: channelType,
                channelId: metadata.chatId,
                serverId: metadata.chatId,
            });
        } catch (connectionError: any) {
            this.runtime.logger?.warn?.(
                "[OpenChat] ensureConnection failed",
                connectionError?.message || connectionError,
            );
        }

        const mentionContext = {
            isMention: this.containsBotMention(textContent),
            isReply: Boolean(event.repliesTo),
            isThread: Boolean(metadata.threadId),
            mentionType: event.repliesTo ? "reply" : metadata.threadId ? "thread" : undefined,
        };

        const memory: Memory = {
            id: incomingMessageId,
            entityId: senderId,
            agentId: this.runtime.agentId,
            roomId,
            content: {
                text: textContent,
                source: "openchat",
                channelType,
                mentionContext,
                inReplyTo: event.repliesTo
                    ? makeMessageUuid(`${metadata.chatId}-${event.repliesTo.eventIndex}`)
                    : undefined,
            } as Content,
            metadata: {
                type: MemoryType.MESSAGE,
                source: "openchat",
                scope: "room",
                openchat: {
                    ...metadata,
                    sender: event.sender,
                },
            } as any,
            embedding: [],
            createdAt: Date.now(),
        };

        if (!this.runtime.messageService) {
            this.runtime.logger?.error?.("[OpenChat] messageService is not available");
            return;
        }

        const callback = this.createResponseCallback(
            botClient,
            roomId,
            metadata,
            incomingMessageId,
            channelType,
        );

        await this.runtime.messageService.handleMessage(this.runtime, memory, callback);
    }

    private containsBotMention(text: string): boolean {
        const name = this.runtime.character?.name;
        if (!name || !text) {
            return false;
        }
        const normalized = text.toLowerCase();
        const mention = `@${name}`.toLowerCase();
        return normalized.includes(mention);
    }

    private createResponseCallback(
        botClient: BotClient,
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
                this.runtime.logger?.warn?.(
                    "[OpenChat] Attachments are not supported yet for OpenChat responses",
                );
            }

            const message = (await botClient.createTextMessage(text)).setFinalised(true);
            const response = await botClient.sendMessage(message);

            if (response.kind !== "success") {
                this.runtime.logger?.error?.(
                    "[OpenChat] Failed to send response",
                    response.message,
                );
                return [];
            }

            const responseMessageId = response.messageId.toString();
            const memory: Memory = {
                id: makeMessageUuid(`${metadata.chatId}-${responseMessageId}`),
                entityId: this.runtime.agentId as UUID,
                agentId: this.runtime.agentId,
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
                await this.runtime.createMemory?.(memory, "messages");
            } catch (error: any) {
                this.runtime.logger?.error?.(
                    "[OpenChat] Failed to persist response memory",
                    error?.message || error,
                );
            }

            return [memory];
        };
    }
}
