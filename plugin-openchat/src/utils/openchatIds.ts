import { v4 as uuidv4, v5 as uuidv5 } from "uuid";
import type { UUID } from "@elizaos/core";

/**
 * Shared namespace used to derive deterministic UUIDs for OpenChat entities.
 * Matches IETF namespace 6ba7b810-9dad-11d1-80b4-00c04fd430c8.
 */
export const OPENCHAT_UUID_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

/**
 * Generate a deterministic UUID for an OpenChat room based on the chat kind and identifier.
 */
export function makeRoomUuid(chatKind: string, identifier: string): UUID {
    return uuidv5(`openchat-room-${chatKind}-${identifier}`, OPENCHAT_UUID_NAMESPACE) as UUID;
}

/**
 * Generate a deterministic UUID for an OpenChat user identifier.
 */
export function makeUserUuid(identifier: string): UUID {
    return uuidv5(`openchat-user-${identifier}`, OPENCHAT_UUID_NAMESPACE) as UUID;
}

/**
 * Generate a deterministic UUID for an OpenChat message identifier (per room scope).
 */
export function makeMessageUuid(identifier: string): UUID {
    return uuidv5(`openchat-message-${identifier}`, OPENCHAT_UUID_NAMESPACE) as UUID;
}

/**
 * Fallback helper for random UUIDs when no deterministic input exists.
 */
export function makeRandomUuid(): UUID {
    return uuidv4() as UUID;
}
