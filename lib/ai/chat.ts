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
	timeout: 30000, // 30 second timeout for API calls
	maxRetries: 2, // Retry failed requests up to 2 times
});

export const processMessage = async (
	phoneNumber: string,
	messageBody: string | null,
	mediaUrls: string[] | null,
	requestId?: string
): Promise<string> => {
	const logId = requestId || `proc_${Date.now()}`;
	const processStart = Date.now();
	
	try {
		console.log(JSON.stringify({
			level: 'info',
			requestId: logId,
			message: 'processMessage started',
			data: {
				phoneNumber,
				hasBody: !!messageBody,
				mediaCount: mediaUrls?.length || 0,
			},
			timestamp: new Date().toISOString(),
		}));
		
		const supabase = createServiceClient();

		// Step 1: Fetch conversation history with timing
		let conversationHistory: WhatsAppMessage[] = [];
		const historyStart = Date.now();
		try {
			conversationHistory = await getConversationHistory(supabase, phoneNumber);
			console.log(JSON.stringify({
				level: 'info',
				requestId: logId,
				message: 'Loaded conversation history',
				data: {
					historyCount: conversationHistory.length,
					durationMs: Date.now() - historyStart,
				},
				timestamp: new Date().toISOString(),
			}));
		} catch (error) {
			console.error(JSON.stringify({
				level: 'error',
				requestId: logId,
				message: 'Failed to load conversation history',
				error: {
					message: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
					name: error instanceof Error ? error.name : 'Unknown',
				},
				durationMs: Date.now() - historyStart,
				timestamp: new Date().toISOString(),
			}));
			// Continue with empty history rather than failing
			conversationHistory = [];
		}
		
		// Step 2: Fetch conversation context with timing
		let context: ConversationContext = {};
		const contextStart = Date.now();
		try {
			context = await getConversationContext(supabase, phoneNumber);
			console.log(JSON.stringify({
				level: 'info',
				requestId: logId,
				message: 'Loaded conversation context',
				data: {
					hasContext: Object.keys(context).length > 0,
					contextKeys: Object.keys(context),
					durationMs: Date.now() - contextStart,
				},
				timestamp: new Date().toISOString(),
			}));
		} catch (error) {
			console.error(JSON.stringify({
				level: 'error',
				requestId: logId,
				message: 'Failed to load conversation context',
				error: {
					message: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
					name: error instanceof Error ? error.name : 'Unknown',
				},
				durationMs: Date.now() - contextStart,
				timestamp: new Date().toISOString(),
			}));
			// Continue with empty context rather than failing
			context = {};
		}

		// Step 3: Build Claude messages with timing
		let messages: Anthropic.MessageParam[] = [];
		const buildStart = Date.now();
		try {
			messages = await buildClaudeMessages(
				conversationHistory,
				messageBody,
				mediaUrls
			);
			
			console.log(JSON.stringify({
				level: 'info',
				requestId: logId,
				message: 'Built Claude messages',
				data: {
					messageCount: messages.length,
					roles: messages.map(m => m.role),
					hasMedia: messages.some(m => 
						Array.isArray(m.content) && 
						m.content.some(c => c.type === 'image')
					),
					durationMs: Date.now() - buildStart,
				},
				timestamp: new Date().toISOString(),
			}));
		} catch (error) {
			console.error(JSON.stringify({
				level: 'error',
				requestId: logId,
				message: 'Failed to build Claude messages',
				error: {
					message: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
					name: error instanceof Error ? error.name : 'Unknown',
				},
				durationMs: Date.now() - buildStart,
				timestamp: new Date().toISOString(),
			}));
			throw error; // This is critical, can't proceed without messages
		}

		if (messages.length === 0) {
			console.log(JSON.stringify({
				level: 'warn',
				requestId: logId,
				message: 'No messages to send to Claude',
				timestamp: new Date().toISOString(),
			}));
			return "The sake speaks through silence... but perhaps you could speak louder?";
		}

		// Step 4: Call Claude API with timing
		console.log(JSON.stringify({
			level: 'info',
			requestId: logId,
			message: 'Calling Claude API',
			data: {
				messageCount: messages.length,
				model: CLAUDE_MODEL,
			},
			timestamp: new Date().toISOString(),
		}));

		const claudeStart = Date.now();
		let response = await callClaude(messages, context, logId);
		console.log(JSON.stringify({
			level: 'info',
			requestId: logId,
			message: 'Initial Claude response received',
			data: {
				stopReason: response.stop_reason,
				contentBlocks: response.content.length,
				contentTypes: response.content.map(c => c.type),
				durationMs: Date.now() - claudeStart,
			},
			timestamp: new Date().toISOString(),
		}));

		let toolUseIterations = 0;
		const maxToolUseIterations = 10;

		while (response.stop_reason === 'tool_use' && toolUseIterations < maxToolUseIterations) {
			toolUseIterations++;
			console.log(JSON.stringify({
				level: 'info',
				requestId: logId,
				message: 'Tool use iteration',
				data: {
					iteration: toolUseIterations,
					toolsUsed: response.content
						.filter(c => c.type === 'tool_use')
						.map(c => c.type === 'tool_use' ? c.name : null),
				},
				timestamp: new Date().toISOString(),
			}));
			
			const toolResults = await executeToolCalls(response, logId);
			
			messages.push({
				role: 'assistant',
				content: response.content,
			});

			messages.push({
				role: 'user',
				content: toolResults,
			});

			response = await callClaude(messages, context, logId);
			console.log(JSON.stringify({
				level: 'info',
				requestId: logId,
				message: 'Claude response after tool use',
				data: {
					stopReason: response.stop_reason,
					iteration: toolUseIterations,
				},
				timestamp: new Date().toISOString(),
			}));
		}

		if (toolUseIterations >= maxToolUseIterations) {
			console.log(JSON.stringify({
				level: 'warn',
				requestId: logId,
				message: 'Max tool use iterations reached',
				data: {
					maxIterations: maxToolUseIterations,
				},
				timestamp: new Date().toISOString(),
			}));
		}

		const textResponse = extractTextResponse(response);
		console.log(JSON.stringify({
			level: 'info',
			requestId: logId,
			message: 'Extracted text response',
			data: {
				length: textResponse.length,
				preview: textResponse.substring(0, 150),
			},
			timestamp: new Date().toISOString(),
		}));

		// Step 5: Update conversation context (non-critical, don't fail if it errors)
		const updateStart = Date.now();
		try {
			await updateConversationContext(supabase, phoneNumber, response);
			console.log(JSON.stringify({
				level: 'info',
				requestId: logId,
				message: 'Conversation context updated',
				durationMs: Date.now() - updateStart,
				timestamp: new Date().toISOString(),
			}));
		} catch (error) {
			console.error(JSON.stringify({
				level: 'error',
				requestId: logId,
				message: 'Failed to update conversation context (non-critical)',
				error: {
					message: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
					name: error instanceof Error ? error.name : 'Unknown',
				},
				durationMs: Date.now() - updateStart,
				timestamp: new Date().toISOString(),
			}));
			// Don't throw, this is not critical
		}

		console.log(JSON.stringify({
			level: 'info',
			requestId: logId,
			message: 'processMessage completed successfully',
			totalDurationMs: Date.now() - processStart,
			timestamp: new Date().toISOString(),
		}));

		return textResponse;
	} catch (error) {
		console.error(JSON.stringify({
			level: 'error',
			requestId: logId,
			message: 'processMessage failed',
			error: {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				name: error instanceof Error ? error.name : 'Unknown',
			},
			data: {
				phoneNumber,
				messageBodyPreview: messageBody?.substring(0, 100),
			},
			totalDurationMs: Date.now() - processStart,
			timestamp: new Date().toISOString(),
		}));
		throw error;
	}
};

const getConversationHistory = async (
	supabase: ReturnType<typeof createServiceClient>,
	phoneNumber: string
): Promise<WhatsAppMessage[]> => {
	const start = Date.now();
	try {
		console.log(JSON.stringify({ 
			level: 'debug', 
			message: 'Fetching conversation history', 
			phoneNumber,
			timestamp: new Date().toISOString(),
		}));
		
		// Split into two separate queries to avoid PostgREST .or() issues with special characters
		const [fromResult, toResult] = await Promise.all([
			supabase
				.from('whatsapp_messages')
				.select('*')
				.eq('from_number', phoneNumber)
				.order('created_at', { ascending: false })
				.limit(MAX_MESSAGE_HISTORY),
			supabase
				.from('whatsapp_messages')
				.select('*')
				.eq('to_number', phoneNumber)
				.order('created_at', { ascending: false })
				.limit(MAX_MESSAGE_HISTORY)
		]);

		if (fromResult.error) {
			console.error(JSON.stringify({ 
				level: 'error', 
				message: 'Error fetching from_number messages', 
				error: {
					message: fromResult.error.message,
					code: fromResult.error.code,
					details: fromResult.error.details,
				},
				durationMs: Date.now() - start,
				timestamp: new Date().toISOString(),
			}));
		}

		if (toResult.error) {
			console.error(JSON.stringify({ 
				level: 'error', 
				message: 'Error fetching to_number messages', 
				error: {
					message: toResult.error.message,
					code: toResult.error.code,
					details: toResult.error.details,
				},
				durationMs: Date.now() - start,
				timestamp: new Date().toISOString(),
			}));
		}

		// Merge and sort by created_at
		const allMessages = [
			...(fromResult.data || []),
			...(toResult.data || [])
		];

		// Remove duplicates (messages might appear in both queries)
		const uniqueMessages = Array.from(
			new Map(allMessages.map(msg => [msg.id, msg])).values()
		);

		// Sort by created_at descending and take the latest MAX_MESSAGE_HISTORY
		const sortedMessages = uniqueMessages
			.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
			.slice(0, MAX_MESSAGE_HISTORY);

		console.log(JSON.stringify({ 
			level: 'debug', 
			message: 'Conversation history fetched successfully', 
			count: sortedMessages.length,
			durationMs: Date.now() - start,
			timestamp: new Date().toISOString(),
		}));

		// Reverse to chronological order (oldest first)
		return sortedMessages.reverse();
	} catch (error) {
		console.error(JSON.stringify({ 
			level: 'error', 
			message: 'Exception in getConversationHistory', 
			error: {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				name: error instanceof Error ? error.name : 'Unknown',
			},
			phoneNumber,
			durationMs: Date.now() - start,
			timestamp: new Date().toISOString(),
		}));
		return [];
	}
};

const getConversationContext = async (
	supabase: ReturnType<typeof createServiceClient>,
	phoneNumber: string
): Promise<ConversationContext> => {
	const start = Date.now();
	try {
		console.log(JSON.stringify({ 
			level: 'debug', 
			message: 'Fetching conversation context', 
			phoneNumber,
			timestamp: new Date().toISOString(),
		}));

		const { data, error } = await supabase
			.from('conversation_state')
			.select('context')
			.eq('phone_number', phoneNumber)
			.single();

		if (error) {
			// Not found is normal for new conversations
			if (error.code === 'PGRST116') {
				console.log(JSON.stringify({ 
					level: 'debug', 
					message: 'No conversation context found (new conversation)', 
					phoneNumber,
					durationMs: Date.now() - start,
					timestamp: new Date().toISOString(),
				}));
			} else {
				console.error(JSON.stringify({ 
					level: 'error', 
					message: 'Error fetching conversation context', 
					error: {
						message: error.message,
						code: error.code,
						details: error.details,
					},
					phoneNumber,
					durationMs: Date.now() - start,
					timestamp: new Date().toISOString(),
				}));
			}
			return {};
		}

		if (!data) {
			console.log(JSON.stringify({ 
				level: 'debug', 
				message: 'No conversation context data', 
				phoneNumber,
				durationMs: Date.now() - start,
				timestamp: new Date().toISOString(),
			}));
			return {};
		}

		console.log(JSON.stringify({ 
			level: 'debug', 
			message: 'Conversation context fetched successfully', 
			phoneNumber,
			contextKeys: Object.keys((data.context as ConversationContext) || {}),
			durationMs: Date.now() - start,
			timestamp: new Date().toISOString(),
		}));

		return (data.context as ConversationContext) || {};
	} catch (error) {
		console.error(JSON.stringify({ 
			level: 'error', 
			message: 'Exception in getConversationContext', 
			error: {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				name: error instanceof Error ? error.name : 'Unknown',
			},
			phoneNumber,
			durationMs: Date.now() - start,
			timestamp: new Date().toISOString(),
		}));
		return {};
	}
};

const buildClaudeMessages = async (
	history: WhatsAppMessage[],
	currentBody: string | null,
	currentMediaUrls: string[] | null
): Promise<Anthropic.MessageParam[]> => {
	const start = Date.now();
	try {
		console.log(JSON.stringify({ 
			level: 'debug', 
			message: 'Building Claude messages', 
			historyCount: history.length,
			hasCurrentBody: !!currentBody,
			currentMediaCount: currentMediaUrls?.length || 0,
			timestamp: new Date().toISOString(),
		}));

		const messages: Anthropic.MessageParam[] = [];

		// Process history messages
		for (let i = 0; i < history.length; i++) {
			const msg = history[i];
			const msgStart = Date.now();
			const role = msg.direction === 'inbound' ? 'user' : 'assistant';
			const content: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];

			if (msg.body) {
				content.push({
					type: 'text',
					text: msg.body,
				} as Anthropic.TextBlockParam);
			}

			if (msg.media_urls && msg.media_urls.length > 0 && role === 'user') {
				try {
					console.log(JSON.stringify({ 
						level: 'debug', 
						message: 'Processing media URLs for history message', 
						messageIndex: i,
						mediaCount: msg.media_urls.length,
						timestamp: new Date().toISOString(),
					}));

					const mediaContents = await processMediaUrls(msg.media_urls);
					content.push(...(mediaContents as Anthropic.ImageBlockParam[]));
					
					console.log(JSON.stringify({ 
						level: 'debug', 
						message: 'Media URLs processed for history message', 
						messageIndex: i,
						mediaProcessed: mediaContents.length,
						durationMs: Date.now() - msgStart,
						timestamp: new Date().toISOString(),
					}));
				} catch (error) {
					console.error(JSON.stringify({ 
						level: 'error', 
						message: 'Failed to process media URLs for history message', 
						messageIndex: i,
						error: {
							message: error instanceof Error ? error.message : String(error),
							stack: error instanceof Error ? error.stack : undefined,
						},
						durationMs: Date.now() - msgStart,
						timestamp: new Date().toISOString(),
					}));
					// Continue without media rather than failing completely
				}
			}

			if (content.length > 0) {
				messages.push({
					role,
					content,
				});
			}
		}

		// Process current message
		const currentContent: Array<Anthropic.TextBlockParam | Anthropic.ImageBlockParam> = [];

		if (currentBody) {
			currentContent.push({
				type: 'text',
				text: currentBody,
			} as Anthropic.TextBlockParam);
		}

		if (currentMediaUrls && currentMediaUrls.length > 0) {
			try {
				const mediaStart = Date.now();
				console.log(JSON.stringify({ 
					level: 'debug', 
					message: 'Processing media URLs for current message', 
					mediaCount: currentMediaUrls.length,
					timestamp: new Date().toISOString(),
				}));

				const mediaContents = await processMediaUrls(currentMediaUrls);
				currentContent.push(...(mediaContents as Anthropic.ImageBlockParam[]));
				
				console.log(JSON.stringify({ 
					level: 'debug', 
					message: 'Media URLs processed for current message', 
					mediaProcessed: mediaContents.length,
					durationMs: Date.now() - mediaStart,
					timestamp: new Date().toISOString(),
				}));
			} catch (error) {
				console.error(JSON.stringify({ 
					level: 'error', 
					message: 'Failed to process media URLs for current message', 
					error: {
						message: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
					},
					timestamp: new Date().toISOString(),
				}));
				// Continue without media rather than failing completely
			}
		}

		if (currentContent.length > 0) {
			messages.push({
				role: 'user',
				content: currentContent,
			});
		}

		const merged = mergeConsecutiveMessages(messages);
		
		console.log(JSON.stringify({ 
			level: 'debug', 
			message: 'Claude messages built successfully', 
			totalMessages: merged.length,
			durationMs: Date.now() - start,
			timestamp: new Date().toISOString(),
		}));

		return merged;
	} catch (error) {
		console.error(JSON.stringify({ 
			level: 'error', 
			message: 'Exception in buildClaudeMessages', 
			error: {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				name: error instanceof Error ? error.name : 'Unknown',
			},
			durationMs: Date.now() - start,
			timestamp: new Date().toISOString(),
		}));
		throw error;
	}
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
	context: ConversationContext,
	requestId: string
): Promise<Anthropic.Message> => {
	const systemPrompt = SAKE_SENSEI_SYSTEM_PROMPT + (
		context && Object.keys(context).length > 0
			? `\n\nCurrent conversation context: ${JSON.stringify(context, null, 2)}`
			: ''
	);

	try {
		const response = await anthropic.messages.create({
			model: CLAUDE_MODEL,
			max_tokens: 1024,
			system: systemPrompt,
			messages,
			tools: TOOL_DEFINITIONS as Anthropic.Tool[],
		});
		
		console.log(JSON.stringify({
			level: 'info',
			requestId,
			message: 'Claude API call successful',
			data: {
				model: CLAUDE_MODEL,
				stopReason: response.stop_reason,
				usage: response.usage,
			},
			timestamp: new Date().toISOString(),
		}));
		
		return response;
	} catch (error) {
		console.error(JSON.stringify({
			level: 'error',
			requestId,
			message: 'Claude API call failed',
			error: {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				name: error instanceof Error ? error.name : 'Unknown',
			},
			data: {
				model: CLAUDE_MODEL,
				messageCount: messages.length,
				messageRoles: messages.map(m => m.role),
			},
			timestamp: new Date().toISOString(),
		}));
		throw error;
	}
};

const executeToolCalls = async (
	response: Anthropic.Message,
	requestId: string
): Promise<Anthropic.ToolResultBlockParam[]> => {
	const toolResults: Anthropic.ToolResultBlockParam[] = [];

	for (const block of response.content) {
		if (block.type === 'tool_use') {
			try {
				console.log(JSON.stringify({
					level: 'info',
					requestId,
					message: 'Executing tool',
					data: {
						toolName: block.name,
						toolId: block.id,
						input: block.input,
					},
					timestamp: new Date().toISOString(),
				}));
				
				const result = await executeTool(block.name, block.input as Record<string, unknown>, requestId);
				
				console.log(JSON.stringify({
					level: 'info',
					requestId,
					message: 'Tool executed successfully',
					data: {
						toolName: block.name,
						toolId: block.id,
						resultPreview: JSON.stringify(result).substring(0, 200),
					},
					timestamp: new Date().toISOString(),
				}));
				
				toolResults.push({
					type: 'tool_result',
					tool_use_id: block.id,
					content: JSON.stringify(result),
				});
			} catch (error) {
				console.error(JSON.stringify({
					level: 'error',
					requestId,
					message: 'Tool execution failed',
					error: {
						message: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
					},
					data: {
						toolName: block.name,
						toolId: block.id,
					},
					timestamp: new Date().toISOString(),
				}));
				
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
	const start = Date.now();
	try {
		const toolUseBlocks = response.content.filter(
			(block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
		);

		if (toolUseBlocks.length === 0) {
			console.log(JSON.stringify({ 
				level: 'debug', 
				message: 'No tool use blocks to update context', 
				timestamp: new Date().toISOString(),
			}));
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

		const { error } = await supabase
			.from('conversation_state')
			.upsert({
				phone_number: phoneNumber,
				context: updatedContext as any,
				updated_at: new Date().toISOString(),
			});

		if (error) {
			console.error(JSON.stringify({ 
				level: 'error', 
				message: 'Error upserting conversation context', 
				error: {
					message: error.message,
					code: error.code,
					details: error.details,
				},
				durationMs: Date.now() - start,
				timestamp: new Date().toISOString(),
			}));
			throw error;
		}

		console.log(JSON.stringify({ 
			level: 'debug', 
			message: 'Conversation context updated successfully', 
			updatedKeys: Object.keys(updatedContext),
			durationMs: Date.now() - start,
			timestamp: new Date().toISOString(),
		}));
	} catch (error) {
		console.error(JSON.stringify({ 
			level: 'error', 
			message: 'Exception in updateConversationContext', 
			error: {
				message: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
				name: error instanceof Error ? error.name : 'Unknown',
			},
			phoneNumber,
			durationMs: Date.now() - start,
			timestamp: new Date().toISOString(),
		}));
		throw error;
	}
};
