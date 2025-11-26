import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
import {
    ChatEventsCriteria,
    ChatEventsResponse,
    MessageEvent,
} from "@open-ic/openchat-botclient-ts";
import { resolveOpenChatContext } from "./openChatActionContext.js";

function limitValue(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function describeContent(event: MessageEvent): string {
    switch (event.content.kind) {
        case "text_content":
            return event.content.text.trim();
        case "image_content":
            return event.content.caption
                ? `Image: ${event.content.caption}`
                : "Image attachment";
        case "video_content":
            return event.content.caption
                ? `Video: ${event.content.caption}`
                : "Video attachment";
        case "audio_content":
            return event.content.caption
                ? `Audio: ${event.content.caption}`
                : "Audio clip";
        case "file_content":
            return `File: ${event.content.name}`;
        case "poll_content":
            return `Poll with ${event.content.config.options.length} options`;
        default:
            return event.content.kind.replace(/_/g, " ");
    }
}

function formatTimestamp(timestamp: bigint | number | undefined): string {
    if (timestamp === undefined) {
        return "recent";
    }
    try {
        if (typeof timestamp === "bigint") {
            const millis = timestamp / 1_000_000n;
            return new Date(Number(millis)).toISOString();
        }
        return new Date(timestamp).toISOString();
    } catch {
        return "recent";
    }
}

type MessageSummary = {
    event: MessageEvent;
    timestamp?: bigint;
    index: number;
};

function extractMessages(response: ChatEventsResponse): MessageSummary[] {
    if (response.kind !== "success") {
        return [];
    }
    return response.events
        .filter((wrapper) => wrapper.event.kind === "message")
        .map((wrapper) => ({
            event: wrapper.event as MessageEvent,
            timestamp: wrapper.timestamp,
            index: wrapper.index,
        }));
}

export const readChatHistoryAction: Action = {
    name: "READ_OPENCHAT_HISTORY",
    description: "Fetch recent OpenChat messages for additional context",
    similes: [
        "OPENCHAT_READ",
        "OPENCHAT_HISTORY",
        "FETCH_OPENCHAT_MESSAGES",
    ],
    examples: [
        [
            {
                content: {
                    text: "Show me the recent OpenChat messages",
                },
            } as any,
            {
                content: {
                    text: "I'll fetch the recent chat history from OpenChat.",
                    action: "READ_OPENCHAT_HISTORY",
                },
            } as any,
        ],
        [
            {
                content: {
                    text: "What was discussed in the OpenChat group recently?",
                },
            } as any,
            {
                content: {
                    text: "I'll retrieve the recent OpenChat conversation history.",
                    action: "READ_OPENCHAT_HISTORY",
                },
            } as any,
        ],
        [
            {
                content: {
                    text: "Read the last 20 messages from the chat",
                },
            } as any,
            {
                content: {
                    text: "I'll fetch the last 20 messages from OpenChat.",
                    action: "READ_OPENCHAT_HISTORY",
                },
            } as any,
        ],
    ],
    validate: async (runtime: IAgentRuntime, message: Memory, state?: State, options?: any) => {
        const context = resolveOpenChatContext(runtime, message, state, options);
        if (!context) {
            return false;
        }
        return context.installation.record.grantedAutonomousPermissions.hasChatPermission(
            "ReadMessages",
        );
    },
    handler: async (
        runtime: IAgentRuntime,
        message: Memory,
        state?: State,
        options?: any,
        callback?: HandlerCallback,
    ) => {
        const context = resolveOpenChatContext(runtime, message, state, options);
        if (!context) {
            runtime.logger?.error("[OpenChat] Unable to resolve context for history action");
            return;
        }

        const limit = limitValue(
            Number(options?.limit ?? state?.openchat?.historyLimit ?? 10),
            1,
            50,
        );

        const summary = await context.client.chatSummary();
        if (summary.kind === "error") {
            const summaryError = summary.message ?? summary.code?.toString() ?? "Unknown error";
            runtime.logger?.error("[OpenChat] Failed to fetch chat summary", summaryError);
            return;
        }

        const latestEventIndex = summary.latestEventIndex ?? 0;
        const startEventIndex = Math.max(0, latestEventIndex - limit);

        const criteria: ChatEventsCriteria = {
            kind: "chat_events_page",
            startEventIndex,
            ascending: true,
            maxEvents: limit,
            maxMessages: limit,
        };

        const events = await context.client.chatEvents(criteria, context.metadata.threadId);
        if (events.kind !== "success") {
            const eventsError = events.message ?? events.code?.toString() ?? "Unknown error";
            runtime.logger?.error("[OpenChat] Failed to fetch chat events", eventsError);
            if (callback) {
                callback({
                    text: `Unable to read OpenChat history: ${eventsError}`,
                    content: { error: eventsError },
                });
            }
            return;
        }

        const messagesOnly = extractMessages(events);
        if (messagesOnly.length === 0) {
            if (callback) {
                callback({ text: "No recent OpenChat messages found", content: { history: [] } });
            }
            return;
        }

        const lines = messagesOnly.map(({ event, timestamp, index }) => {
            const ts = formatTimestamp(timestamp);
            const text = describeContent(event) || "(no text)";
            return `#${index} · ${ts} · ${event.sender}: ${text}`;
        });

        const summaryText = [`Recent OpenChat activity (${context.metadata.chatId}):`, ...lines].join(
            "\n",
        );

        runtime.logger?.info?.(
            `[OpenChat] Loaded ${messagesOnly.length} historical messages for ${context.metadata.chatId}`,
        );

        if (callback) {
            callback({ text: summaryText, content: { history: lines } });
        }
    },
};

export default readChatHistoryAction;
