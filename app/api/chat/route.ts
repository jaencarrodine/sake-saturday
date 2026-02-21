import { anthropic } from "@ai-sdk/anthropic";
import { convertToModelMessages, streamText, type UIMessage } from "ai";
import { NextResponse } from "next/server";
import { CLAUDE_MODEL } from "@/lib/ai/personality";

export const runtime = "nodejs";
export const maxDuration = 60;

const APP_CHAT_SYSTEM_PROMPT = `You are Sake Sensei, an expert and friendly sake guide inside the Sake Saturday app.

You help users:
- Learn about sake styles, regions, grades, and tasting notes
- Identify likely details from bottle photos (label clues, grade, brewery, region)
- Compare bottles and suggest what to taste next

When users upload a sake image:
- Describe what you can see clearly and what is uncertain
- Avoid claiming details you cannot verify from the image
- Ask one concise follow-up question if key details are missing

Style:
- Keep responses concise and useful (usually 2-5 short paragraphs or bullets)
- Be warm, slightly playful, and practical
- Use plain language unless the user asks for deeper technical detail`;

type ChatRequestBody = {
	messages?: UIMessage[];
};

export const POST = async (request: Request) => {
	if (!process.env.ANTHROPIC_API_KEY) {
		return NextResponse.json(
			{ error: "ANTHROPIC_API_KEY is not configured" },
			{ status: 500 },
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

		const result = streamText({
			model: anthropic(CLAUDE_MODEL),
			system: APP_CHAT_SYSTEM_PROMPT,
			messages: modelMessages,
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
