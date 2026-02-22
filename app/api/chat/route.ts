import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	type UIMessage,
} from "ai";
import { NextRequest, NextResponse } from "next/server";
import type { Twilio } from "twilio";
import { processMessage } from "@/lib/ai/chat";
import { createServiceClient } from "@/lib/supabase/server";
import {
	CHAT_ACCESS_COOKIE_NAME,
	CHAT_IDENTITY_COOKIE_NAME,
	normalizeChatPhoneNumber,
	readRoleFromSessionToken,
} from "@/lib/chat-auth";

export const runtime = "nodejs";
export const maxDuration = 60;

type ChatRequestBody = {
	messages?: UIMessage[];
};

const WEB_CHAT_NUMBER = "web-chat";
const IMAGE_URL_EXTENSION_PATTERN =
	/\.(jpg|jpeg|png|webp|gif|avif|heic|heif)(?:$|[?#])/i;

const webChatTwilioClient = (() => {
	const messagesLookup = (messageSid: string) => ({
		media: (mediaSid: string) => ({
			fetch: async () => ({
				uri: `/2010-04-01/Accounts/AC_WEBCHAT/Messages/${messageSid}/Media/${mediaSid}.json`,
			}),
		}),
	});

	const messagesApi = Object.assign(
		messagesLookup,
		{
			create: async () => ({
				sid: `webchat_${Date.now()}`,
				status: "sent",
			}),
		},
	);

	return {
		messages: messagesApi,
	} as unknown as Twilio;
})();

const extractLatestUserTurn = (
	messages: UIMessage[],
): { body: string | null; mediaUrls: string[] | null } | null => {
	const latestUserMessage = [...messages]
		.reverse()
		.find((message) => message.role === "user");
	if (!latestUserMessage) return null;

	const textParts: string[] = [];
	const mediaUrls: string[] = [];

	for (const part of latestUserMessage.parts ?? []) {
		if (
			part.type === "text" &&
			typeof part.text === "string" &&
			part.text.trim().length > 0
		) {
			textParts.push(part.text.trim());
		}

		if (part.type !== "file" || typeof part.url !== "string")
			continue;

		const mediaType = typeof part.mediaType === "string" ? part.mediaType : "";
		const isImagePart =
			mediaType.startsWith("image/") ||
			part.url.startsWith("data:image/") ||
			IMAGE_URL_EXTENSION_PATTERN.test(part.url);

		if (isImagePart)
			mediaUrls.push(part.url);
	}

	const body = textParts.join("\n").trim() || null;
	if (!body && mediaUrls.length === 0) return null;

	return {
		body,
		mediaUrls: mediaUrls.length > 0 ? mediaUrls : null,
	};
};

const persistWebChatTurn = async (params: {
	phoneNumber: string;
	requestId: string;
	userBody: string | null;
	userMediaUrls: string[] | null;
	assistantBody: string;
}) => {
	const { phoneNumber, requestId, userBody, userMediaUrls, assistantBody } = params;
	const supabase = createServiceClient();
	const timestamp = new Date().toISOString();

	const insertRows = [
		{
			direction: "inbound",
			from_number: phoneNumber,
			to_number: WEB_CHAT_NUMBER,
			body: userBody,
			media_urls: userMediaUrls,
			twilio_sid: `${requestId}_inbound`,
			processed: true,
			processed_at: timestamp,
		},
		{
			direction: "outbound",
			from_number: WEB_CHAT_NUMBER,
			to_number: phoneNumber,
			body: assistantBody,
			media_urls: null,
			twilio_sid: `${requestId}_outbound`,
			processed: true,
			processed_at: timestamp,
		},
	];

	const { error } = await supabase.from("whatsapp_messages").insert(insertRows);
	if (!error) return;

	console.error("Error persisting web chat messages:", {
		code: error.code,
		message: error.message,
		details: error.details,
	});
};

const createSingleMessageStreamResponse = (
	messages: UIMessage[],
	assistantMessage: string,
) => {
	const stream = createUIMessageStream({
		originalMessages: messages,
		execute: ({ writer }) => {
			const textPartId = "text-1";
			writer.write({ type: "start" });
			writer.write({ type: "start-step" });
			writer.write({ type: "text-start", id: textPartId });
			writer.write({ type: "text-delta", id: textPartId, delta: assistantMessage });
			writer.write({ type: "text-end", id: textPartId });
			writer.write({ type: "finish-step" });
			writer.write({ type: "finish", finishReason: "stop" });
		},
	});

	return createUIMessageStreamResponse({ stream });
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
	const rawPhoneNumber = request.cookies.get(CHAT_IDENTITY_COOKIE_NAME)?.value;
	const phoneNumber = rawPhoneNumber
		? normalizeChatPhoneNumber(rawPhoneNumber)
		: null;

	if (!accessRole) {
		return NextResponse.json(
			{ error: "Chat access password required" },
			{ status: 401 },
		);
	}

	if (!phoneNumber) {
		return NextResponse.json(
			{ error: "Phone number required. Identify yourself first." },
			{ status: 400 },
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

		const latestUserTurn = extractLatestUserTurn(messages);
		if (!latestUserTurn) {
			return NextResponse.json(
				{ error: "Could not parse latest user message." },
				{ status: 400 },
			);
		}

		const requestId = `webchat_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
		const isAdmin = accessRole === "admin";
		const assistantMessage = await processMessage(
			phoneNumber,
			WEB_CHAT_NUMBER,
			latestUserTurn.body,
			latestUserTurn.mediaUrls,
			requestId,
			isAdmin,
			webChatTwilioClient,
		);

		await persistWebChatTurn({
			phoneNumber,
			requestId,
			userBody: latestUserTurn.body,
			userMediaUrls: latestUserTurn.mediaUrls,
			assistantBody: assistantMessage,
		});

		return createSingleMessageStreamResponse(messages, assistantMessage);
	} catch (error) {
		console.error("Error in POST /api/chat:", error);

		return NextResponse.json(
			{ error: "Failed to process chat request" },
			{ status: 500 },
		);
	}
};
