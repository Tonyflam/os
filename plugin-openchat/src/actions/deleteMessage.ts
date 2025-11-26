import {
    Action,
    HandlerCallback,
    IAgentRuntime,
    Memory,
    State,
} from "@elizaos/core";
import { resolveOpenChatContext } from "./openChatActionContext.js";

function normalizeIds(input: any): Array<string | number | bigint> {
    if (!input) {
        return [];
    }
    if (Array.isArray(input)) {
        return input;
    }
    return [input];
}

function parseMessageIds(values: Array<string | number | bigint>): bigint[] {
    const ids: bigint[] = [];
    for (const value of values) {
        try {
            ids.push(typeof value === "bigint" ? value : BigInt(value));
        } catch {
            // Skip invalid entries
        }
    }
    return ids;
}

export const deleteMessageAction: Action = {
    name: "DELETE_OPENCHAT_MESSAGE",
    description: "Delete one or more OpenChat messages if the bot has permission",
    similes: [
        "OPENCHAT_DELETE",
        "DELETE_MESSAGE_OPENCHAT",
        "REMOVE_OPENCHAT_MESSAGE",
    ],
    examples: [
        [
            {
                content: {
                    text: "Delete that message from OpenChat",
                },
            } as any,
            {
                content: {
                    text: "I'll delete the message from OpenChat.",
                    action: "DELETE_OPENCHAT_MESSAGE",
                },
            } as any,
        ],
        [
            {
                content: {
                    text: "Remove the inappropriate message",
                },
            } as any,
            {
                content: {
                    text: "I'll remove the message from the OpenChat group.",
                    action: "DELETE_OPENCHAT_MESSAGE",
                },
            } as any,
        ],
        [
            {
                content: {
                    text: "Delete messages 123 and 456 from the chat",
                },
            } as any,
            {
                content: {
                    text: "I'll delete those messages from OpenChat.",
                    action: "DELETE_OPENCHAT_MESSAGE",
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
            "DeleteMessages",
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
            runtime.logger?.error("[OpenChat] Unable to resolve context for delete action");
            return;
        }

        const providedIds = [
            ...normalizeIds(options?.messageIds),
            ...normalizeIds(state?.openchat?.messageIds),
        ];

        if (providedIds.length === 0) {
            providedIds.push(options?.targetMessageId || state?.openchat?.targetMessageId);
        }

        if (providedIds.length === 0 || providedIds.every((value) => value === undefined)) {
            providedIds.push(context.metadata.messageId);
        }

        const messageIds = parseMessageIds(providedIds);
        if (messageIds.length === 0) {
            runtime.logger?.warn("[OpenChat] No valid message IDs supplied for deletion");
            return;
        }

        const response = await context.client.deleteMessages(messageIds, context.metadata.threadId);
        if (response.kind !== "success") {
            const errorMessage = response.message ?? response.code?.toString() ?? "Unknown error";
            runtime.logger?.error("[OpenChat] Failed to delete messages", errorMessage);
            if (callback) {
                callback({
                    text: `Failed to delete OpenChat messages: ${errorMessage}`,
                    content: { error: errorMessage },
                });
            }
            return;
        }

        runtime.logger?.info?.(
            `[OpenChat] Deleted ${messageIds.length} message(s) in ${context.metadata.chatId}`,
        );

        if (callback) {
            callback({
                text: `Deleted ${messageIds.length} message(s) in OpenChat`,
                content: { success: true },
            });
        }
    },
};

export default deleteMessageAction;
