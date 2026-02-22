import {
	createUIMessageStream,
	createUIMessageStreamResponse,
	type UIMessage,
} from "ai";
import { NextRequest, NextResponse } from "next/server";
import type { Twilio } from "twilio";
import { processMessage } from "@/lib/ai/chat";
import { normalizeImageBuffer } from "@/lib/images/normalize-image";
import { createServiceClient } from "@/lib/supabase/server";
import { SAKE_IMAGES_BUCKET } from "@/lib/supabase/storage";
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
const INLINE_IMAGE_DATA_URL_PATTERN = /^data:image\/[a-z0-9.+-]+;base64,/i;
const PARSE_DATA_IMAGE_URL_PATTERN = /^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i;

type WebChatTwilioClientConfig = {
	onMessageCreated?: (messageBody: string) => void | Promise<void>;
};

const createWebChatTwilioClient = (
	config: WebChatTwilioClientConfig = {},
): Twilio => {
	const { onMessageCreated } = config;
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
			create: async (payload?: { body?: string }) => {
				const messageBody = payload?.body?.trim();
				if (messageBody)
					await onMessageCreated?.(messageBody);

				return {
					sid: `webchat_${Date.now()}`,
					status: "sent",
				};
			},
		},
	);

	return {
		messages: messagesApi,
	} as unknown as Twilio;
};

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

const isInlineImageDataUrl = (url: string): boolean =>
	INLINE_IMAGE_DATA_URL_PATTERN.test(url);

const uploadInlineImageDataUrl = async (params: {
	supabase: ReturnType<typeof createServiceClient>;
	requestId: string;
	mediaUrl: string;
	mediaIndex: number;
}): Promise<string | null> => {
	const { supabase, requestId, mediaUrl, mediaIndex } = params;
	const parsedDataUrl = mediaUrl.match(PARSE_DATA_IMAGE_URL_PATTERN);
	if (!parsedDataUrl)
		return null;

	const [, contentType, base64Payload] = parsedDataUrl;
	const imageBuffer = Buffer.from(base64Payload, "base64");
	if (imageBuffer.length === 0)
		return null;

	const normalizedImage = await normalizeImageBuffer({
		buffer: imageBuffer,
		contentType,
		fileNameOrUrl: `webchat-inline-${mediaIndex + 1}.${contentType.split("/")[1] || "jpg"}`,
	});
	const fileName =
		`webchat-inline/${requestId}-${mediaIndex + 1}-${Math.random().toString(36).slice(2, 10)}.` +
		normalizedImage.extension;
	const { data, error } = await supabase.storage
		.from(SAKE_IMAGES_BUCKET)
		.upload(fileName, normalizedImage.buffer, {
			contentType: normalizedImage.contentType,
			cacheControl: "3600",
			upsert: false,
		});

	if (error || !data)
		throw new Error(`Failed to upload inline media: ${error?.message || "Unknown upload error"}`);

	const { data: publicUrlData } = supabase.storage
		.from(SAKE_IMAGES_BUCKET)
		.getPublicUrl(data.path);

	return publicUrlData.publicUrl;
};

const resolveLatestUserMediaUrls = async (params: {
	requestId: string;
	mediaUrls: string[] | null;
}): Promise<string[] | null> => {
	const { requestId, mediaUrls } = params;
	if (!mediaUrls || mediaUrls.length === 0)
		return null;

	if (!mediaUrls.some(isInlineImageDataUrl))
		return mediaUrls;

	const supabase = createServiceClient();
	const resolvedMediaUrls: string[] = [];

	for (const [index, mediaUrl] of mediaUrls.entries()) {
		if (!isInlineImageDataUrl(mediaUrl)) {
			resolvedMediaUrls.push(mediaUrl);
			continue;
		}

		try {
			const uploadedUrl = await uploadInlineImageDataUrl({
				supabase,
				requestId,
				mediaUrl,
				mediaIndex: index,
			});

			if (uploadedUrl) {
				resolvedMediaUrls.push(uploadedUrl);
				continue;
			}
		} catch (error) {
			console.error("Failed to resolve inline image media URL:", {
				requestId,
				mediaIndex: index,
				error: error instanceof Error ? error.message : String(error),
			});
		}

		resolvedMediaUrls.push(mediaUrl);
	}

	return resolvedMediaUrls.length > 0 ? resolvedMediaUrls : null;
};

const sanitizePersistedMediaUrls = (mediaUrls: string[] | null): string[] | null => {
	if (!mediaUrls || mediaUrls.length === 0)
		return null;

	const persistedUrls = mediaUrls.filter((mediaUrl) => !isInlineImageDataUrl(mediaUrl));
	return persistedUrls.length > 0 ? persistedUrls : null;
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

const createStreamingMessageWriter = (writer: {
	write: (chunk: {
		type:
			| "text-start"
			| "text-delta"
			| "text-end"
			| "start"
			| "start-step"
			| "finish-step"
			| "finish";
		id?: string;
		delta?: string;
		finishReason?: "stop" | "length" | "content-filter" | "tool-calls" | "error" | "other";
	}) => void;
}) => {
	let textPartIndex = 0;

	return (assistantMessage: string) => {
		const trimmedMessage = assistantMessage.trim();
		if (!trimmedMessage)
			return;

		textPartIndex += 1;
		const textPartId = `text-${textPartIndex}`;
		writer.write({ type: "text-start", id: textPartId });
		writer.write({ type: "text-delta", id: textPartId, delta: trimmedMessage });
		writer.write({ type: "text-end", id: textPartId });
	};
};

const createStreamingChatResponse = (params: {
	messages: UIMessage[];
	phoneNumber: string;
	requestId: string;
	userBody: string | null;
	userMediaUrls: string[] | null;
	resolvedMediaUrls: string[] | null;
	isAdmin: boolean;
}) => {
	const {
		messages,
		phoneNumber,
		requestId,
		userBody,
		userMediaUrls,
		resolvedMediaUrls,
		isAdmin,
	} = params;
	const stream = createUIMessageStream({
		originalMessages: messages,
		execute: async ({ writer }) => {
			const writeAssistantMessage = createStreamingMessageWriter(writer);
			writer.write({ type: "start" });
			writer.write({ type: "start-step" });

			try {
				const webChatTwilioClient = createWebChatTwilioClient({
					onMessageCreated: (messageBody) => {
						writeAssistantMessage(messageBody);
					},
				});
				const assistantMessage = await processMessage(
					phoneNumber,
					WEB_CHAT_NUMBER,
					userBody,
					resolvedMediaUrls,
					requestId,
					isAdmin,
					webChatTwilioClient,
				);

				await persistWebChatTurn({
					phoneNumber,
					requestId,
					userBody,
					userMediaUrls,
					assistantBody: assistantMessage,
				});

				writeAssistantMessage(assistantMessage);
				writer.write({ type: "finish-step" });
				writer.write({ type: "finish", finishReason: "stop" });
			} catch (error) {
				console.error("Error while streaming web chat response:", error);
				writeAssistantMessage(
					"The sake gods cloud my vision. A technical disturbance in the flow. Try again, perhaps?",
				);
				writer.write({ type: "finish-step" });
				writer.write({ type: "finish", finishReason: "error" });
			}
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
		const resolvedMediaUrls = await resolveLatestUserMediaUrls({
			requestId,
			mediaUrls: latestUserTurn.mediaUrls,
		});
		const persistedMediaUrls = sanitizePersistedMediaUrls(resolvedMediaUrls);
		const isAdmin = accessRole === "admin";
		return createStreamingChatResponse({
			messages,
			phoneNumber,
			requestId,
			userBody: latestUserTurn.body,
			userMediaUrls: persistedMediaUrls,
			resolvedMediaUrls,
			isAdmin,
		});
	} catch (error) {
		console.error("Error in POST /api/chat:", error);

		return NextResponse.json(
			{ error: "Failed to process chat request" },
			{ status: 500 },
		);
	}
};
