import Anthropic from '@anthropic-ai/sdk';
import { SAKE_SENSEI_SYSTEM_PROMPT, MAX_MESSAGE_HISTORY, CLAUDE_MODEL } from './personality';
import { TOOL_DEFINITIONS, executeTool } from './tools';
import { processMediaUrls } from './vision';
import { createServiceClient } from '@/lib/supabase/server';

type WhatsAppMessage = {
	id: string;
	direction: string;
	from_number: string;
	to_number: string;
	body: string | null;
	media_urls: string[] | null;
	created_at: string;
};

type ConversationContext = {
	tasting_id?: string;
	sake_id?: string;
	pending_confirmations?: Record<string, unknown>;
	[key: string]: unknown;
};

const anthropic = new Anthropic({
	apiKey: process.env.ANTHROPIC_API_KEY,
});

export const processMessage = async (
	phoneNumber: string,
	messageBody: string | null,
	mediaUrls: string[] | null
): Promise<string> => {
	try {
		const supabase = createServiceClient();

		const conversationHistory = await getConversationHistory(supabase, phoneNumber);
		const context = await getConversationContext(supabase, phoneNumber);

		const messages = await buildClaudeMessages(
			conversationHistory,
			messageBody,
			mediaUrls
		);

		let response = await callClaude(messages, context);

		while (response.stop_reason === 'tool_use') {
			const toolResults = await executeToolCalls(response);
			
			messages.push({
				role: 'assistant',
				content: response.content,
			});

			messages.push({
				role: 'user',
				content: toolResults,
			});

			response = await callClaude(messages, context);
		}

		const textResponse = extractTextResponse(response);

		await updateConversationContext(supabase, phoneNumber, response);

		return textResponse;
	} catch (error) {
		console.error('Error processing message:', error);
		return "Ahh, the sake gods cloud my vision. A technical disturbance in the flow. Try again, perhaps?";
	}
};

const getConversationHistory = async (
	supabase: ReturnType<typeof createServiceClient>,
	phoneNumber: string
): Promise<WhatsAppMessage[]> => {
	const { data, error } = await supabase
		.from('whatsapp_messages')
		.select('*')
		.or(`from_number.eq.${phoneNumber},to_number.eq.${phoneNumber}`)
		.order('created_at', { ascending: false })
		.limit(MAX_MESSAGE_HISTORY);

	if (error) {
		console.error('Error fetching conversation history:', error);
		return [];
	}

	return (data || []).reverse();
};

const getConversationContext = async (
	supabase: ReturnType<typeof createServiceClient>,
	phoneNumber: string
): Promise<ConversationContext> => {
	const { data, error } = await supabase
		.from('conversation_state')
		.select('context')
		.eq('phone_number', phoneNumber)
		.single();

	if (error || !data) {
		return {};
	}

	return (data.context as ConversationContext) || {};
};

const buildClaudeMessages = async (
	history: WhatsAppMessage[],
	currentBody: string | null,
	currentMediaUrls: string[] | null
): Promise<Anthropic.MessageParam[]> => {
	const messages: Anthropic.MessageParam[] = [];

	for (const msg of history) {
		const role = msg.direction === 'inbound' ? 'user' : 'assistant';
		const content: Anthropic.ContentBlock[] = [];

		if (msg.body) {
			content.push({
				type: 'text',
				text: msg.body,
			});
		}

		if (msg.media_urls && msg.media_urls.length > 0 && role === 'user') {
			const mediaContents = await processMediaUrls(msg.media_urls);
			content.push(...mediaContents);
		}

		if (content.length > 0) {
			messages.push({
				role,
				content,
			});
		}
	}

	const currentContent: Anthropic.ContentBlock[] = [];

	if (currentBody) {
		currentContent.push({
			type: 'text',
			text: currentBody,
		});
	}

	if (currentMediaUrls && currentMediaUrls.length > 0) {
		const mediaContents = await processMediaUrls(currentMediaUrls);
		currentContent.push(...mediaContents);
	}

	if (currentContent.length > 0) {
		messages.push({
			role: 'user',
			content: currentContent,
		});
	}

	return messages;
};

const callClaude = async (
	messages: Anthropic.MessageParam[],
	context: ConversationContext
): Promise<Anthropic.Message> => {
	const systemPrompt = SAKE_SENSEI_SYSTEM_PROMPT + (
		context && Object.keys(context).length > 0
			? `\n\nCurrent conversation context: ${JSON.stringify(context, null, 2)}`
			: ''
	);

	return await anthropic.messages.create({
		model: CLAUDE_MODEL,
		max_tokens: 1024,
		system: systemPrompt,
		messages,
		tools: TOOL_DEFINITIONS as Anthropic.Tool[],
	});
};

const executeToolCalls = async (
	response: Anthropic.Message
): Promise<Anthropic.ToolResultBlockParam[]> => {
	const toolResults: Anthropic.ToolResultBlockParam[] = [];

	for (const block of response.content) {
		if (block.type === 'tool_use') {
			try {
				const result = await executeTool(block.name, block.input as Record<string, unknown>);
				toolResults.push({
					type: 'tool_result',
					tool_use_id: block.id,
					content: JSON.stringify(result),
				});
			} catch (error) {
				console.error(`Error executing tool ${block.name}:`, error);
				toolResults.push({
					type: 'tool_result',
					tool_use_id: block.id,
					content: JSON.stringify({
						success: false,
						error: error instanceof Error ? error.message : 'Unknown error',
					}),
					is_error: true,
				});
			}
		}
	}

	return toolResults;
};

const extractTextResponse = (response: Anthropic.Message): string => {
	const textBlocks = response.content.filter(
		(block): block is Anthropic.TextBlock => block.type === 'text'
	);

	if (textBlocks.length === 0) {
		return "The sake speaks, but I cannot hear its words. Try again.";
	}

	return textBlocks.map(block => block.text).join('\n\n');
};

const updateConversationContext = async (
	supabase: ReturnType<typeof createServiceClient>,
	phoneNumber: string,
	response: Anthropic.Message
): Promise<void> => {
	const toolUseBlocks = response.content.filter(
		(block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
	);

	if (toolUseBlocks.length === 0) {
		return;
	}

	const currentContext = await getConversationContext(supabase, phoneNumber);
	const updatedContext = { ...currentContext };

	for (const block of toolUseBlocks) {
		if (block.name === 'identify_sake') {
			const input = block.input as { name?: string };
			if (input.name) {
				updatedContext.last_sake_name = input.name;
			}
		} else if (block.name === 'create_tasting') {
			const input = block.input as { sake_id?: string };
			if (input.sake_id) {
				updatedContext.sake_id = input.sake_id;
			}
		}
	}

	await supabase
		.from('conversation_state')
		.upsert({
			phone_number: phoneNumber,
			context: updatedContext,
			updated_at: new Date().toISOString(),
		});
};
