import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
import {
    resolveOpenChatContext,
    type OpenChatResolvedContext,
} from "./openChatActionContext.js";
import {
    ChatEventsCriteria,
    ChatEventsResponse,
    MessageEvent,
} from "@open-ic/openchat-botclient-ts";

const DEFAULT_REACTION = "👍";

function safeBigInt(value: string | number | bigint | undefined): bigint | undefined {
    if (value === undefined || value === null) {
        return undefined;
    }
    try {
        return typeof value === "bigint" ? value : BigInt(value);
    } catch {
        return undefined;
    }
}

async function fetchLatestMessageId(
    context: OpenChatResolvedContext,
    runtime: IAgentRuntime,
): Promise<bigint | undefined> {
    try {
        const summary = await context.client.chatSummary();
        if (summary.kind === "error" || summary.latestEventIndex === undefined) {
            return undefined;
        }

        const startIndex = Math.max(0, summary.latestEventIndex - 1);
        const criteria: ChatEventsCriteria = {
            kind: "chat_events_page",
            startEventIndex: startIndex,
            ascending: true,
            maxEvents: 2,
            maxMessages: 2,
        };

        const events = await context.client.chatEvents(criteria, context.metadata.threadId);
        if (events.kind !== "success") {
            runtime.logger?.error?.(
                "[OpenChat] Failed to fetch events while resolving reaction target",
                events.message ?? events.code?.toString() ?? "Unknown error",
            );
            return undefined;
        }

        const lastMessage = extractLastMessage(events);
        if (!lastMessage) {
            return undefined;
        }
        context.metadata = {
            ...context.metadata,
            messageId: lastMessage.messageId.toString(),
            replyToMessageId: lastMessage.repliesTo?.eventIndex?.toString(),
        };
        return lastMessage.messageId;
    } catch (error: any) {
        runtime.logger?.error?.(
            "[OpenChat] Unexpected error while resolving reaction target",
            error?.message || error,
        );
        return undefined;
    }
}

function extractLastMessage(events: ChatEventsResponse): MessageEvent | undefined {
    if (events.kind !== "success") {
        return undefined;
    }
    const wrappers = [...events.events];
    for (let i = wrappers.length - 1; i >= 0; i--) {
        const wrapper = wrappers[i];
        if (wrapper.event.kind === "message") {
            return wrapper.event as MessageEvent;
        }
    }
    return undefined;
}

export const reactToMessageAction: Action = {
    name: "REACT_OPENCHAT_MESSAGE",
    description: "Add a reaction to an OpenChat message",
    similes: [
        "OPENCHAT_REACT",
        "REACT_TO_OPENCHAT",
        "OPENCHAT_ADD_REACTION",
        "REACT_MESSAGE",
    ],
    examples: [
        [
            {
                content: {
                    text: "React with a thumbs up to that message",
                },
            } as any,
            {
                content: {
                    text: "I'll add a 👍 reaction to the message.",
                    action: "REACT_OPENCHAT_MESSAGE",
                },
            } as any,
        ],
        [
            {
                content: {
                    text: "Add a heart emoji reaction",
                },
            } as any,
            {
                content: {
                    text: "I'll react with ❤️ to the message.",
                    action: "REACT_OPENCHAT_MESSAGE",
                },
            } as any,
        ],
        [
            {
                content: {
                    text: "React to the OpenChat message with 🎉",
                },
            } as any,
            {
                content: {
                    text: "I'll add a 🎉 reaction.",
                    action: "REACT_OPENCHAT_MESSAGE",
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
            "ReactToMessages",
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
            runtime.logger?.error("[OpenChat] Unable to resolve context for reaction");
            return;
        }

        const reaction = (options?.reaction || state?.openchat?.reaction || DEFAULT_REACTION)
            .toString()
            .trim();
        if (!reaction) {
            runtime.logger?.warn("[OpenChat] Reaction text missing");
            return;
        }

        const targetId =
            options?.targetMessageId ||
            state?.openchat?.targetMessageId ||
            context.metadata.messageId;
        let messageId = safeBigInt(targetId);
        if (!messageId) {
            messageId = await fetchLatestMessageId(context, runtime);
        }
        if (!messageId) {
            runtime.logger?.warn("[OpenChat] Could not determine target message id for reaction");
            return;
        }

        const response = await context.client.addReaction(
            messageId,
            reaction,
            context.metadata.threadId,
        );

        if (response.kind !== "success") {
            const errorMessage = response.message ?? response.code?.toString() ?? "Unknown error";
            runtime.logger?.error("[OpenChat] Failed to add reaction", errorMessage);
            if (callback) {
                callback({
                    text: `Failed to react in OpenChat: ${errorMessage}`,
                    content: { error: errorMessage },
                });
            }
            return;
        }

        runtime.logger?.info?.(
            `[OpenChat] Added reaction '${reaction}' in ${context.metadata.chatId}`,
        );

        if (callback) {
            callback({
                text: `Reacted with ${reaction} in OpenChat`,
                content: { success: true },
            });
        }
    },
};

export default reactToMessageAction;
