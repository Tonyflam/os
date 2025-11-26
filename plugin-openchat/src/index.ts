import { Plugin, IAgentRuntime } from "@elizaos/core";
import { OpenChatClientService, REQUIRED_OPENCHAT_ENV_VARS } from "./services/openchatClient.js";
import { actions } from "./actions/index.js";
import { providers } from "./providers/index.js";

/**
 * OpenChat Plugin for ElizaOS
 * 
 * This plugin enables ElizaOS agents to interact with the OpenChat platform (oc.app).
 * It provides both command-based interaction (users can execute bot commands) and
 * autonomous operation (bot can respond to messages and events).
 * 
 * Features:
 * - Command execution via OpenChat interface
 * - Autonomous message handling and responses
 * - Event subscriptions (messages, member joins, etc.)
 * - Multiple installation support (groups, channels, direct messages)
 * - Full ElizaOS action and provider integration
 * 
 * Setup:
 * 1. Generate bot identity: `openssl ecparam -genkey -name secp256k1 -out private_key.pem`
 * 2. Set environment variables (see package.json agentConfig)
 * 3. Register bot on OpenChat using `/register_bot` command
 * 4. Install bot in desired chats/groups/communities
 * 
 * Environment Variables:
 * - OPENCHAT_BOT_IDENTITY_PRIVATE_KEY: Bot's private key (PEM format)
 * - OPENCHAT_PUBLIC_KEY: OpenChat public key for JWT verification
 * - OPENCHAT_IC_HOST: Internet Computer host URL
 * - OPENCHAT_STORAGE_INDEX_CANISTER: Storage index canister ID
 * - OPENCHAT_BOT_PORT: Bot server port (default: 3000)
 */
export const openchatPlugin: Plugin = {
    name: "openchat",
    description: "OpenChat integration for ElizaOS agents",
    
    actions,
    providers,
    evaluators: [],
    services: [OpenChatClientService],

    /**
     * Initialize the OpenChat plugin
     */
    init: async (_config: Record<string, string>, runtime: IAgentRuntime) => {
        runtime.logger?.info("Initializing OpenChat plugin...");

        const missingVars = REQUIRED_OPENCHAT_ENV_VARS.filter(
            (varName) => !runtime.getSetting(varName)
        );

        if (missingVars.length > 0) {
            throw new Error(
                `Missing required environment variables for OpenChat plugin: ${missingVars.join(", ")}` +
                `\n\nPlease set these variables in your .env file or environment. See plugin documentation for setup instructions.`
            );
        }

        runtime.logger?.info("OpenChat environment verified. Service will start with agent runtime.");
    },

};

// Export types for external use
export * from "./types/index.js";
export { OpenChatClientService } from "./services/openchatClient.js";
export { actions } from "./actions/index.js";
export { providers } from "./providers/index.js";

// Default export
export default openchatPlugin;