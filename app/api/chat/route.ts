import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { NextRequest, NextResponse } from "next/server";
import type { Twilio } from "twilio";
import { CLAUDE_MODEL, ADMIN_PROMPT_ADDENDUM } from "@/lib/ai/personality";
import { createAdminTools, createTools } from "@/lib/ai/tools";
import { CHAT_ACCESS_COOKIE_NAME, readRoleFromSessionToken } from "@/lib/chat-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

const APP_CHAT_SYSTEM_PROMPT = `You are Sake Sensei, an expert and friendly sake guide inside the Sake Saturday app.

You help users:
- Learn about sake styles, regions, grades, and tasting notes
- Identify likely details from bottle photos (label clues, grade, brewery, region)
- Compare bottles and suggest what to taste next

When users upload a sake image in web chat:
- Describe what you can see clearly and what is uncertain
- Avoid claiming details you cannot verify from the image
- Ask one concise follow-up question if key details are missing

Style:
- Keep responses concise and useful (usually 2-5 short paragraphs or bullets)
- Be warm, slightly playful, and practical
- Use plain language unless the user asks for deeper technical detail

Tools:
- Use tools when users ask to create tastings, save scores, or look up rankings/history
- You can create tasting sessions directly in the database for authenticated users
- In web chat, do not mention WhatsApp-only workflows`;

const APP_CHAT_GENERAL_ROLE_PROMPT = `
Current user access: GENERAL.
- You may use regular tools (including create_tasting and record_scores)
- Do not claim admin powers`;

type ChatRequestBody = {
	messages?: UIMessage[];
};

const createWebChatTools = () => {
	const noOpTwilioClient = {
		messages: {
			create: async () => {
				throw new Error("send_message is unavailable in web chat");
			},
		},
	} as unknown as Twilio;

	const regularTools = createTools({
		twilioClient: noOpTwilioClient,
		fromNumber: "web-chat",
		toNumber: "web-chat",
		currentMediaUrls: [],
	});

	const { send_message, upload_image, ...webTools } = regularTools;
	void send_message;
	void upload_image;

	return webTools;
};

export const POST = async (request: NextRequest) => {
	if (!process.env.ANTHROPIC_API_KEY) {
		return NextResponse.json(
			{ error: "ANTHROPIC_API_KEY is not configured" },
			{ status: 500 },
		);
	}

	const accessToken = request.cookies.get(CHAT_ACCESS_COOKIE_NAME)?.value;
	const accessRole = readRoleFromSessionToken(accessToken);

	if (!accessRole) {
		return NextResponse.json(
			{ error: "Chat access password required" },
			{ status: 401 },
		);
	}

	try {
		const body = (await request.json()) as ChatRequestBody;
		const messages = body.messages;

		if (!Array.isArray(messages) || messages.length === 0) {
			return NextResponse.json(
				{ error: "messages must be a non-empty array" },
				{ status: 400 },
			);
		}

		const modelMessages = await convertToModelMessages(
			messages.map((message) => {
				const { id, ...rest } = message;
				void id;
				return rest;
			}),
		);

		const regularTools = createWebChatTools();
		const tools =
			accessRole === "admin"
				? { ...regularTools, ...createAdminTools() }
				: regularTools;
		const systemPrompt =
			accessRole === "admin"
				? `${APP_CHAT_SYSTEM_PROMPT}\n${ADMIN_PROMPT_ADDENDUM}`
				: `${APP_CHAT_SYSTEM_PROMPT}\n${APP_CHAT_GENERAL_ROLE_PROMPT}`;

		const result = streamText({
			model: anthropic(CLAUDE_MODEL),
			system: systemPrompt,
			messages: modelMessages,
			tools,
			stopWhen: stepCountIs(6),
			temperature: 0.4,
		});

		return result.toUIMessageStreamResponse();
	} catch (error) {
		console.error("Error in POST /api/chat:", error);

		return NextResponse.json(
			{ error: "Failed to process chat request" },
			{ status: 500 },
		);
	}
};
