import { IAgentRuntime, Service } from "@elizaos/core";
import {
    ActionScope,
    BotClientFactory,
    BotClient,
    ChatActionScope,
    CommunityActionScope,
    InstallationLocation,
    InstallationRecord,
    Permissions,
    chatIdentifierToInstallationLocation,
    ChatIdentifier,
    CommunityIdentifier,
    GroupChatIdentifier,
    DirectChatIdentifier,
    ChannelIdentifier,
} from "@open-ic/openchat-botclient-ts";
import express, { Express, Request, Response } from "express";
import cors from "cors";
import {
    OpenChatBotConfig,
    OpenChatInstallation,
    OpenChatMessageMetadata,
} from "../types/index.js";
import { createCommandChatClient } from "../bot/middleware/botclient.js";
import { executeCommand } from "../bot/handlers/executeCommand.js";
import { notifyHandler } from "../bot/handlers/notify.js";
import { schemaHandler } from "../bot/handlers/schema.js";
import { OpenChatMessageManager } from "./openchatMessageManager.js";

export const REQUIRED_OPENCHAT_ENV_VARS = [
    "OPENCHAT_BOT_IDENTITY_PRIVATE_KEY",
    "OPENCHAT_PUBLIC_KEY",
    "OPENCHAT_IC_HOST",
    "OPENCHAT_STORAGE_INDEX_CANISTER",
];

/**
 * OpenChat Client Service
 * Manages the OpenChat bot server and integration with ElizaOS runtime
 */
export class OpenChatClientService extends Service {
    static serviceType = "openchat";
    capabilityDescription = "Enables OpenChat command + autonomous messaging support";
    private factory!: BotClientFactory;
    private app!: Express;
    private server: any;
    public override config: OpenChatBotConfig = {} as OpenChatBotConfig;
    private installations: Map<string, OpenChatInstallation> = new Map();
    private messageManager: OpenChatMessageManager;

    constructor(runtime?: IAgentRuntime) {
        super(runtime);
        if (!runtime) {
            throw new Error("OpenChatClientService requires an agent runtime");
        }
        this.messageManager = new OpenChatMessageManager(runtime);
    }

    private initialize(config: OpenChatBotConfig): void {
        this.config = config;

        this.factory = new BotClientFactory({
            openchatPublicKey: config.openchatPublicKey,
            icHost: config.icHost,
            identityPrivateKey: config.identityPrivateKey,
            openStorageCanisterId: config.openStorageCanisterId,
        });

        this.app = express();
        this.setupRoutes();

        this.runtime.logger.info("OpenChat Client Service initialized");
    }

    static async start(runtime: IAgentRuntime): Promise<OpenChatClientService> {
        const config = this.buildConfig(runtime);
        const service = new OpenChatClientService(runtime);
        service.initialize(config);
        await service.startServer();
        service.logReadyBanner();
        return service;
    }

    static async stop(runtime: IAgentRuntime): Promise<void> {
        const service = runtime.getService<OpenChatClientService>(this.serviceType);
        if (service) {
            await service.stop();
        }
    }

    private static buildConfig(runtime: IAgentRuntime): OpenChatBotConfig {
        const missingVars = REQUIRED_OPENCHAT_ENV_VARS.filter((varName) => {
            const value = runtime.getSetting(varName);
            return typeof value !== "string" || value.length === 0;
        });

        if (missingVars.length > 0) {
            throw new Error(
                `Missing required environment variables for OpenChat plugin: ${missingVars.join(", ")}` +
                    "\n\nPlease set these variables in your .env file or environment."
            );
        }

        return {
            identityPrivateKey: runtime.getSetting("OPENCHAT_BOT_IDENTITY_PRIVATE_KEY") as string,
            openchatPublicKey: runtime.getSetting("OPENCHAT_PUBLIC_KEY") as string,
            icHost: runtime.getSetting("OPENCHAT_IC_HOST") as string,
            openStorageCanisterId: runtime.getSetting("OPENCHAT_STORAGE_INDEX_CANISTER") as string,
            port: parseInt((runtime.getSetting("OPENCHAT_BOT_PORT") as string) || "3000", 10),
        };
    }

    /**
     * Setup Express routes for OpenChat bot endpoints
     */
    private setupRoutes(): void {
        this.app.use(cors());

        // Command execution endpoint
        this.app.post(
            "/execute_command",
            express.text(),
            createCommandChatClient(this.factory),
            (req: Request, res: Response) => executeCommand(req, res, this.runtime)
        );

        // Notification endpoint for autonomous events
        this.app.post(
            "/notify",
            express.raw({ type: "application/msgpack" }),
            (req: Request, res: Response) => notifyHandler(req, res, this.runtime, this)
        );

        // Bot definition schema endpoint
        this.app.get("/bot_definition", (req: Request, res: Response) => 
            schemaHandler(req, res, this.runtime)
        );

        // Root endpoint (alias for bot_definition)
        this.app.get("/", (req: Request, res: Response) => 
            schemaHandler(req, res, this.runtime)
        );

        this.runtime.logger.debug("OpenChat bot routes configured");
    }

    /**
     * Start the OpenChat bot server
     */
    public async startServer(): Promise<void> {
        const port = this.config.port || 3000;

        return new Promise((resolve) => {
            this.server = this.app.listen(port, () => {
                this.runtime.logger.success(
                    `OpenChat bot server running on port ${port}`
                );
                this.runtime.logger.info(
                    `Bot definition available at: http://localhost:${port}/bot_definition`
                );
                resolve();
            });
        });
    }

    private logReadyBanner(): void {
        const port = this.config.port ?? 3000;
        const paddedPort = port.toString().padEnd(4, " ");
        this.runtime.logger?.info?.(
            `\n` +
                `╔════════════════════════════════════════════════════════════╗\n` +
                `║                  OpenChat Bot Ready                       ║\n` +
                `╠════════════════════════════════════════════════════════════╣\n` +
                `║  Bot server running on port ${paddedPort}                       ║\n` +
                `║  Bot definition: http://localhost:${port}/bot_definition  ║\n` +
                `║                                                            ║\n` +
                `║  Next steps:                                               ║\n` +
                `║  1. Register bot on OpenChat using /register_bot          ║\n` +
                `║  2. Install bot in desired chats/groups                   ║\n` +
                `║  3. Users can interact via /chat command                  ║\n` +
                `╚════════════════════════════════════════════════════════════╝\n`
        );
    }

    /**
     * Stop the OpenChat bot server
     */
    public async stop(): Promise<void> {
        if (this.server) {
            return new Promise((resolve) => {
                this.server.close(() => {
                    this.runtime.logger.info("OpenChat bot server stopped");
                    resolve();
                });
            });
        }
    }

    /**
     * Create a bot client for command context
     */
    public createClientFromJwt(jwt: string): BotClient {
        return this.factory.createClientFromCommandJwt(jwt);
    }

    /**
     * Create a bot client for autonomous context
     */
    public createClientForScope(
        scope: ActionScope,
        apiGatewayUrl: string,
        permissions?: Permissions,
    ): BotClient {
        return this.factory.createClientInAutonomouseContext(scope, apiGatewayUrl, permissions);
    }

    /**
     * Record bot installation
     */
    public recordInstallation(location: InstallationLocation, record: InstallationRecord): void {
        const scope = this.scopeFromLocation(location);
        const key = this.getLocationKey(location);
        this.installations.set(key, { location, scope, record });
        this.runtime.logger.info(
            `Bot installed in ${location.kind}: ${key} (messagePermMask=${
                record.grantedAutonomousPermissions?.rawPermissions?.message ?? 0
            })`,
        );
    }

    /**
     * Record bot uninstallation
     */
    public recordUninstallation(location: InstallationLocation): void {
        const key = this.getLocationKey(location);
        this.installations.delete(key);
        this.runtime.logger.info(`Bot uninstalled from scope: ${key}`);
    }

    /**
     * Get all installations
     */
    public getInstallations(): Map<string, OpenChatInstallation> {
        return this.installations;
    }

    public buildMetadataFromInstallation(
        locationKey: string,
        installation: OpenChatInstallation,
        overrides?: Partial<OpenChatMessageMetadata>,
    ): OpenChatMessageMetadata {
        const metadata: OpenChatMessageMetadata = {
            chatKind: this.getChatKindFromLocation(installation.location),
            chatId: this.describeLocation(installation.location),
            locationKey,
            roomKey: this.getRoomKeyFromLocation(installation.location, overrides?.threadId),
            messageId: overrides?.messageId ?? "",
            apiGateway: overrides?.apiGateway ?? installation.record.apiGateway,
            threadId: overrides?.threadId,
            replyToMessageId: overrides?.replyToMessageId,
        };
        return metadata;
    }

    /**
     * Get factory instance
     */
    public getFactory(): BotClientFactory {
        return this.factory;
    }

    /**
     * Get runtime instance
     */
    public getRuntime(): IAgentRuntime {
        return this.runtime;
    }

    public getMessageManager(): OpenChatMessageManager {
        return this.messageManager;
    }

    public getInstallationByChatId(chatId: ChatIdentifier): OpenChatInstallation | undefined {
        const location = chatIdentifierToInstallationLocation(chatId);
        return this.installations.get(this.getLocationKey(location));
    }

    public createClientForLocation(location: InstallationLocation): BotClient | undefined {
        const installation = this.installations.get(this.getLocationKey(location));
        if (!installation) {
            return undefined;
        }
        return this.factory.createClientInAutonomouseContext(
            installation.scope,
            installation.record.apiGateway,
            installation.record.grantedAutonomousPermissions,
        );
    }

    public buildMessageMetadata(
        chatId: ChatIdentifier,
        messageId: bigint,
        apiGateway: string,
        thread?: number,
    ): OpenChatMessageMetadata {
        const location = chatIdentifierToInstallationLocation(chatId);
        const locationKey = this.getLocationKey(location);
        const roomKey = this.getRoomKey(chatId, thread);
        return {
            chatKind: this.getChatKind(chatId),
            chatId: this.describeChat(chatId),
            locationKey,
            roomKey,
            messageId: messageId.toString(),
            threadId: thread,
            apiGateway,
        };
    }

    public getLocationKey(location: InstallationLocation): string {
        if (location instanceof CommunityIdentifier) {
            return `community:${location.communityId}`;
        }
        if (location instanceof GroupChatIdentifier) {
            return `group:${location.groupId}`;
        }
        return `direct:${(location as DirectChatIdentifier).userId}`;
    }

    private scopeFromLocation(location: InstallationLocation): ActionScope {
        if ((location as any).kind === "community") {
            return new CommunityActionScope(location as any);
        }
        return new ChatActionScope(location as any);
    }

    private getChatKind(chatId: ChatIdentifier): "direct" | "group" | "channel" {
        switch (chatId.kind) {
            case "direct_chat":
                return "direct";
            case "group_chat":
                return "group";
            default:
                return "channel";
        }
    }

    private describeChat(chatId: ChatIdentifier): string {
        if (chatId instanceof ChannelIdentifier) {
            return `${chatId.communityId}-${chatId.channelId.toString()}`;
        }
        if (chatId instanceof GroupChatIdentifier) {
            return chatId.groupId;
        }
        if (chatId instanceof DirectChatIdentifier) {
            return chatId.userId;
        }
        return chatId.toString();
    }

    private getRoomKey(chatId: ChatIdentifier, thread?: number): string {
        const base = this.describeChat(chatId);
        return thread !== undefined ? `${base}:${thread}` : base;
    }

    private getChatKindFromLocation(location: InstallationLocation): "direct" | "group" | "channel" {
        switch ((location as any).kind) {
            case "direct_chat":
                return "direct";
            case "group_chat":
                return "group";
            default:
                return "channel";
        }
    }

    private describeLocation(location: InstallationLocation): string {
        if (location instanceof CommunityIdentifier) {
            return location.communityId;
        }
        if (location instanceof GroupChatIdentifier) {
            return location.groupId;
        }
        if (location instanceof DirectChatIdentifier) {
            return location.userId;
        }
        return "unknown";
    }

    private getRoomKeyFromLocation(location: InstallationLocation, thread?: number): string {
        const base = this.describeLocation(location);
        return thread !== undefined ? `${base}:${thread}` : base;
    }
}

export default OpenChatClientService;