export { sendMessageAction } from "./sendMessage.js";
export { reactToMessageAction } from "./reactToMessage.js";
export { deleteMessageAction } from "./deleteMessage.js";
export { readChatHistoryAction } from "./readChatHistory.js";

// Export all actions as array for plugin registration
import { sendMessageAction } from "./sendMessage.js";
import { reactToMessageAction } from "./reactToMessage.js";
import { deleteMessageAction } from "./deleteMessage.js";
import { readChatHistoryAction } from "./readChatHistory.js";

export const actions = [
	sendMessageAction,
	reactToMessageAction,
	deleteMessageAction,
	readChatHistoryAction,
];

export default actions;
