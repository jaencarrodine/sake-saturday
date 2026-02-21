import { generateText, UserContent, AssistantContent, stepCountIs } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { SAKE_SENSEI_SYSTEM_PROMPT, ADMIN_PROMPT_ADDENDUM, MAX_MESSAGE_HISTORY, CLAUDE_MODEL } from './personality';
import { createTools, createAdminTools } from './tools';
import { processMediaUrls } from './vision';
import { createServiceClient } from '@/lib/supabase/server';
import type { Twilio } from 'twilio';

type Message = 
	| { role: 'user'; content: UserContent }
	| { role: 'assistant'; content: AssistantContent };

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

export const processMessage = async (
	phoneNumber: string,
	toNumber: string,
	messageBody: string | null,
	mediaUrls: string[] | null,
	requestId?: string,
	isAdmin: boolean = false,
	twilioClient?: Twilio
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
			conversationHistory = [];
		}

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
			context = {};
		}

		const buildStart = Date.now();
		let messages: Message[];
		try {
			messages = await buildMessages(
				conversationHistory,
				messageBody,
				mediaUrls
			);

			console.log(JSON.stringify({
				level: 'info',
				requestId: logId,
				message: 'Built messages for AI',
				data: {
					messageCount: messages.length,
					roles: messages.map(m => m.role),
					hasMedia: messages.some(m =>
						Array.isArray(m.content) &&
						m.content.some(c => typeof c === 'object' && 'image' in c)
					),
					durationMs: Date.now() - buildStart,
				},
				timestamp: new Date().toISOString(),
			}));
		} catch (error) {
			console.error(JSON.stringify({
				level: 'error',
				requestId: logId,
				message: 'Failed to build messages',
				error: {
					message: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
					name: error instanceof Error ? error.name : 'Unknown',
				},
				durationMs: Date.now() - buildStart,
				timestamp: new Date().toISOString(),
			}));
			throw error;
		}

		if (messages.length === 0) {
			console.log(JSON.stringify({
				level: 'warn',
				requestId: logId,
				message: 'No messages to send to AI',
				timestamp: new Date().toISOString(),
			}));
			return "The sake speaks through silence... but perhaps you could speak louder?";
		}

		let systemPrompt = SAKE_SENSEI_SYSTEM_PROMPT + (
			context && Object.keys(context).length > 0
				? `\n\nCurrent conversation context: ${JSON.stringify(context, null, 2)}`
				: ''
		);
		
		if (isAdmin) {
			systemPrompt += ADMIN_PROMPT_ADDENDUM;
		}

		const toolContext = {
			twilioClient: twilioClient!,
			fromNumber: toNumber,
			toNumber: phoneNumber,
		};
		
		const regularTools = createTools(toolContext);
		const allTools = isAdmin ? { ...regularTools, ...createAdminTools() } : regularTools;

		console.log(JSON.stringify({
			level: 'info',
			requestId: logId,
			message: 'Calling Vercel AI SDK generateText',
			data: {
				messageCount: messages.length,
				model: CLAUDE_MODEL,
				toolCount: Object.keys(allTools).length,
				isAdmin,
			},
			timestamp: new Date().toISOString(),
		}));

	const aiStart = Date.now();
	const result = await generateText({
		model: anthropic(CLAUDE_MODEL),
		system: systemPrompt,
		messages,
		tools: allTools,
		stopWhen: stepCountIs(10),
	});

		console.log(JSON.stringify({
			level: 'info',
			requestId: logId,
			message: 'AI response generated',
			data: {
				finishReason: result.finishReason,
				steps: result.steps?.length || 0,
				responseLength: result.text.length,
				responsePreview: result.text.substring(0, 150),
				durationMs: Date.now() - aiStart,
				usage: result.usage,
			},
			timestamp: new Date().toISOString(),
		}));

		const updateStart = Date.now();
		try {
			await updateConversationContext(supabase, phoneNumber, result);
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
		}

		console.log(JSON.stringify({
			level: 'info',
			requestId: logId,
			message: 'processMessage completed successfully',
			totalDurationMs: Date.now() - processStart,
			timestamp: new Date().toISOString(),
		}));

		return result.text || "The sake speaks, but I cannot hear its words. Try again.";
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

		const allMessages = [
			...(fromResult.data || []),
			...(toResult.data || [])
		];

		const uniqueMessages = Array.from(
			new Map(allMessages.map(msg => [msg.id, msg])).values()
		);

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

const buildMessages = async (
	history: WhatsAppMessage[],
	currentBody: string | null,
	currentMediaUrls: string[] | null
): Promise<Message[]> => {
	const start = Date.now();
	try {
		console.log(JSON.stringify({
			level: 'debug',
			message: 'Building messages',
			historyCount: history.length,
			hasCurrentBody: !!currentBody,
			currentMediaCount: currentMediaUrls?.length || 0,
			timestamp: new Date().toISOString(),
		}));

		const messages: Message[] = [];

		for (const msg of history) {
			const isUser = msg.direction === 'inbound';

			if (isUser) {
				const content: Array<{ type: 'text'; text: string } | { type: 'image'; image: string | Uint8Array }> = [];

				if (msg.body) {
					content.push({
						type: 'text',
						text: msg.body,
					});
				}

				if (msg.media_urls && msg.media_urls.length > 0) {
					try {
						const mediaContents = await processMediaUrls(msg.media_urls);
						content.push(...mediaContents);
					} catch (error) {
						console.error(JSON.stringify({
							level: 'error',
							message: 'Failed to process media URLs for history message',
							error: {
								message: error instanceof Error ? error.message : String(error),
								stack: error instanceof Error ? error.stack : undefined,
							},
							timestamp: new Date().toISOString(),
						}));
					}
				}

				if (content.length > 0) {
					messages.push({
						role: 'user' as const,
						content: content.length === 1 && content[0].type === 'text' ? content[0].text : content,
					});
				}
			} else {
				if (msg.body) {
					messages.push({
						role: 'assistant' as const,
						content: msg.body,
					});
				}
			}
		}

		const currentContent: Array<{ type: 'text'; text: string } | { type: 'image'; image: string | Uint8Array }> = [];

		if (currentBody) {
			currentContent.push({
				type: 'text',
				text: currentBody,
			});
		}

		if (currentMediaUrls && currentMediaUrls.length > 0) {
			try {
				const mediaContents = await processMediaUrls(currentMediaUrls);
				currentContent.push(...mediaContents);
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
			}
		}

		if (currentContent.length > 0) {
			messages.push({
				role: 'user' as const,
				content: currentContent.length === 1 && currentContent[0].type === 'text' ? currentContent[0].text : currentContent,
			});
		}

		const merged = mergeConsecutiveMessages(messages);

		console.log(JSON.stringify({
			level: 'debug',
			message: 'Messages built successfully',
			totalMessages: merged.length,
			durationMs: Date.now() - start,
			timestamp: new Date().toISOString(),
		}));

		return merged;
	} catch (error) {
		console.error(JSON.stringify({
			level: 'error',
			message: 'Exception in buildMessages',
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

const mergeConsecutiveMessages = (messages: Message[]): Message[] => {
	if (messages.length === 0) return messages;

	const merged: Message[] = [];
	let currentMessage = messages[0];

	for (let i = 1; i < messages.length; i++) {
		const nextMessage = messages[i];

		if (currentMessage.role === nextMessage.role) {
			const currentContent = typeof currentMessage.content === 'string'
				? [{ type: 'text' as const, text: currentMessage.content }]
				: Array.isArray(currentMessage.content)
					? currentMessage.content
					: [{ type: 'text' as const, text: String(currentMessage.content) }];

			const nextContent = typeof nextMessage.content === 'string'
				? [{ type: 'text' as const, text: nextMessage.content }]
				: Array.isArray(nextMessage.content)
					? nextMessage.content
					: [{ type: 'text' as const, text: String(nextMessage.content) }];

			const mergedContent: any = [...currentContent, ...nextContent];
			
			if (currentMessage.role === 'user') {
				currentMessage = {
					role: 'user' as const,
					content: mergedContent,
				};
			} else {
				currentMessage = {
					role: 'assistant' as const,
					content: mergedContent,
				};
			}
		} else {
			merged.push(currentMessage);
			currentMessage = nextMessage;
		}
	}

	merged.push(currentMessage);

	if (merged.length > 0 && merged[0].role === 'assistant') {
		console.warn('[buildMessages] First message is assistant role, removing it');
		merged.shift();
	}

	return merged;
};

const updateConversationContext = async (
	supabase: ReturnType<typeof createServiceClient>,
	phoneNumber: string,
	result: any
): Promise<void> => {
	const start = Date.now();
	try {
		if (!result.steps || result.steps.length === 0) {
			console.log(JSON.stringify({
				level: 'debug',
				message: 'No steps to update context',
				timestamp: new Date().toISOString(),
			}));
			return;
		}

		const currentContext = await getConversationContext(supabase, phoneNumber);
		const updatedContext = { ...currentContext };

		for (const step of result.steps) {
			if (step.toolCalls) {
				for (const toolCall of step.toolCalls) {
					if (toolCall.toolName === 'identify_sake') {
						const args = toolCall.args as { name?: string };
						if (args.name) {
							updatedContext.last_sake_name = args.name;
						}
					} else if (toolCall.toolName === 'create_tasting') {
						const args = toolCall.args as { sake_id?: string };
						if (args.sake_id) {
							updatedContext.sake_id = args.sake_id;
						}
					}
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
