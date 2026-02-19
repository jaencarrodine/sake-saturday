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
		console.log('[processMessage] Starting for:', { phoneNumber, hasBody: !!messageBody, mediaUrls: mediaUrls?.length || 0 });
		
		const supabase = createServiceClient();

		const conversationHistory = await getConversationHistory(supabase, phoneNumber);
		console.log('[processMessage] Loaded conversation history:', conversationHistory.length, 'messages');
		
		const context = await getConversationContext(supabase, phoneNumber);

		const messages = await buildClaudeMessages(
			conversationHistory,
			messageBody,
			mediaUrls
		);
		
		console.log('[processMessage] Built Claude messages:', messages.length, 'messages');
		console.log('[processMessage] Message roles:', messages.map(m => m.role).join(', '));

		if (messages.length === 0) {
			console.warn('[processMessage] No messages to send to Claude');
			return "The sake speaks through silence... but perhaps you could speak louder?";
		}

		let response = await callClaude(messages, context);
		console.log('[processMessage] Initial Claude response, stop_reason:', response.stop_reason);

		let toolUseIterations = 0;
		const maxToolUseIterations = 10;

		while (response.stop_reason === 'tool_use' && toolUseIterations < maxToolUseIterations) {
			toolUseIterations++;
			console.log('[processMessage] Tool use iteration:', toolUseIterations);
			
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
			console.log('[processMessage] Claude response after tool use, stop_reason:', response.stop_reason);
		}

		if (toolUseIterations >= maxToolUseIterations) {
			console.warn('[processMessage] Max tool use iterations reached');
		}

		const textResponse = extractTextResponse(response);
		console.log('[processMessage] Extracted text response, length:', textResponse.length);

		await updateConversationContext(supabase, phoneNumber, response);

		return textResponse;
	} catch (error) {
		console.error('[processMessage] Error:', {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			phoneNumber,
			messageBody,
		});
		throw error;
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
		const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];

		if (msg.body) {
			content.push({
				type: 'text',
				text: msg.body,
			} as Anthropic.TextBlockParam);
		}

		if (msg.media_urls && msg.media_urls.length > 0 && role === 'user') {
			const mediaContents = await processMediaUrls(msg.media_urls);
			content.push(...(mediaContents as Anthropic.ImageBlockParam[]));
		}

		if (content.length > 0) {
			messages.push({
				role,
				content,
			});
		}
	}

	const currentContent: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];

	if (currentBody) {
		currentContent.push({
			type: 'text',
			text: currentBody,
		} as Anthropic.TextBlockParam);
	}

	if (currentMediaUrls && currentMediaUrls.length > 0) {
		const mediaContents = await processMediaUrls(currentMediaUrls);
		currentContent.push(...(mediaContents as Anthropic.ImageBlockParam[]));
	}

	if (currentContent.length > 0) {
		messages.push({
			role: 'user',
			content: currentContent,
		});
	}

	return mergeConsecutiveMessages(messages);
};

const mergeConsecutiveMessages = (
	messages: Anthropic.MessageParam[]
): Anthropic.MessageParam[] => {
	if (messages.length === 0) return messages;

	const merged: Anthropic.MessageParam[] = [];
	let currentMessage = messages[0];

	for (let i = 1; i < messages.length; i++) {
		const nextMessage = messages[i];

		if (currentMessage.role === nextMessage.role) {
			const currentContent = Array.isArray(currentMessage.content)
				? currentMessage.content
				: [{ type: 'text' as const, text: currentMessage.content }];
			const nextContent = Array.isArray(nextMessage.content)
				? nextMessage.content
				: [{ type: 'text' as const, text: nextMessage.content }];

			currentMessage = {
				role: currentMessage.role,
				content: [...currentContent, ...nextContent],
			};
		} else {
			merged.push(currentMessage);
			currentMessage = nextMessage;
		}
	}

	merged.push(currentMessage);

	if (merged.length > 0 && merged[0].role === 'assistant') {
		console.warn('[buildClaudeMessages] First message is assistant role, removing it');
		merged.shift();
	}

	return merged;
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

	try {
		return await anthropic.messages.create({
			model: CLAUDE_MODEL,
			max_tokens: 1024,
			system: systemPrompt,
			messages,
			tools: TOOL_DEFINITIONS as Anthropic.Tool[],
		});
	} catch (error) {
		console.error('[callClaude] Claude API error:', {
			error: error instanceof Error ? error.message : String(error),
			model: CLAUDE_MODEL,
			messageCount: messages.length,
			messageRoles: messages.map(m => m.role).join(', '),
		});
		throw error;
	}
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
			context: updatedContext as any,
			updated_at: new Date().toISOString(),
		});
};
