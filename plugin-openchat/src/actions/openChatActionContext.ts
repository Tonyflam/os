import { IAgentRuntime, Memory, State } from "@elizaos/core";
import { BotClient } from "@open-ic/openchat-botclient-ts";
import { OpenChatClientService } from "../services/openchatClient.js";
import { OpenChatInstallation, OpenChatMessageMetadata } from "../types/index.js";

export interface OpenChatResolvedContext {
    service: OpenChatClientService;
    metadata: OpenChatMessageMetadata;
    installation: OpenChatInstallation;
    client: BotClient;
}

function extractMetadata(
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
): OpenChatMessageMetadata | undefined {
    const candidates: Array<OpenChatMessageMetadata | undefined> = [];

    const optionMeta = options as any;
    if (optionMeta?.openchatMetadata) {
        candidates.push(optionMeta.openchatMetadata as OpenChatMessageMetadata);
    } else if (optionMeta?.metadata?.openchat) {
        candidates.push(optionMeta.metadata.openchat as OpenChatMessageMetadata);
    }

    const stateMeta = state as any;
    if (stateMeta?.openchat?.metadata) {
        candidates.push(stateMeta.openchat.metadata as OpenChatMessageMetadata);
    }

    const messageMeta = (message.metadata as any)?.openchat as OpenChatMessageMetadata | undefined;
    candidates.push(messageMeta);

    return candidates.find((candidate) => Boolean(candidate?.locationKey));
}

export function resolveOpenChatContext(
    runtime: IAgentRuntime,
    message: Memory,
    state?: State,
    options?: Record<string, unknown>,
): OpenChatResolvedContext | undefined {
    const service = (runtime as any).getService?.("openchat") as OpenChatClientService | undefined;
    if (!service) {
        return undefined;
    }

    const installations = service.getInstallations();
    if (installations.size === 0) {
        return undefined;
    }

    let metadata = extractMetadata(message, state, options);
    let installation: OpenChatInstallation | undefined;
    let locationKey: string | undefined;

    if (metadata?.locationKey) {
        const existing = installations.get(metadata.locationKey);
        if (existing) {
            installation = existing;
            locationKey = metadata.locationKey;
        }
    }

    if (!installation || !locationKey) {
        const preferredKey =
            (options as any)?.openchat?.locationKey ??
            (state as any)?.openchat?.locationKey;

        if (preferredKey && installations.has(preferredKey)) {
            installation = installations.get(preferredKey);
            locationKey = preferredKey;
        }
    }

    if (!installation || !locationKey) {
        const iterator = installations.entries().next();
        if (!iterator.done) {
            locationKey = iterator.value[0];
            installation = iterator.value[1];
        }
    }

    if (!installation || !locationKey) {
        return undefined;
    }

    if (!metadata) {
        metadata = service.buildMetadataFromInstallation(locationKey, installation);
    } else if (!metadata.locationKey) {
        metadata = {
            ...metadata,
            ...service.buildMetadataFromInstallation(locationKey, installation, metadata),
            locationKey,
        };
    }

    const client = service.createClientForScope(
        installation.scope,
        installation.record.apiGateway,
        installation.record.grantedAutonomousPermissions,
    );

    return { service, metadata, installation, client };
}
