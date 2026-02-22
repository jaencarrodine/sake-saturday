import { NextRequest, NextResponse } from "next/server";
import {
	CHAT_ACCESS_COOKIE_NAME,
	CHAT_IDENTITY_COOKIE_NAME,
	normalizeChatPhoneNumber,
	readRoleFromSessionToken,
} from "@/lib/chat-auth";
import { normalizeImageBuffer } from "@/lib/images/normalize-image";
import { createServiceClient } from "@/lib/supabase/server";
import { SAKE_IMAGES_BUCKET } from "@/lib/supabase/storage";

export const runtime = "nodejs";

const IMAGE_FILE_EXTENSION_PATTERN =
	/\.(jpg|jpeg|png|webp|gif|avif|heic|heif)$/i;

const SUPPORTED_IMAGE_TYPES = new Set([
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/webp",
	"image/gif",
	"image/heic",
	"image/heif",
	"image/heic-sequence",
	"image/heif-sequence",
]);

const sanitizeFolderName = (folderName: string | null): string => {
	if (!folderName)
		return "webchat";

	const normalizedFolder = folderName
		.trim()
		.replace(/[^a-zA-Z0-9/_-]/g, "")
		.replace(/^\/+|\/+$/g, "");

	return normalizedFolder.length > 0 ? normalizedFolder : "webchat";
};

export const POST = async (request: NextRequest) => {
	const accessToken = request.cookies.get(CHAT_ACCESS_COOKIE_NAME)?.value;
	const accessRole = readRoleFromSessionToken(accessToken);
	if (!accessRole) {
		return NextResponse.json(
			{ error: "Chat access password required" },
			{ status: 401 },
		);
	}

	const rawPhoneNumber = request.cookies.get(CHAT_IDENTITY_COOKIE_NAME)?.value;
	const phoneNumber = rawPhoneNumber
		? normalizeChatPhoneNumber(rawPhoneNumber)
		: null;
	if (!phoneNumber) {
		return NextResponse.json(
			{ error: "Phone number required. Identify yourself first." },
			{ status: 400 },
		);
	}

	try {
		const formData = await request.formData();
		const fileValue = formData.get("file");
		const folderValue = formData.get("folder");
		const folderName = sanitizeFolderName(
			typeof folderValue === "string" ? folderValue : null,
		);

		if (!(fileValue instanceof File)) {
			return NextResponse.json(
				{ error: "File is required" },
				{ status: 400 },
			);
		}

		const normalizedType = fileValue.type.toLowerCase();
		const hasSupportedMimeType =
			normalizedType.length > 0 && SUPPORTED_IMAGE_TYPES.has(normalizedType);
		const hasSupportedExtension = IMAGE_FILE_EXTENSION_PATTERN.test(fileValue.name);
		if (!hasSupportedMimeType && !hasSupportedExtension) {
			return NextResponse.json(
				{ error: "Invalid file type. Supported: JPEG, PNG, WEBP, GIF, HEIC, HEIF" },
				{ status: 400 },
			);
		}

		const sourceBuffer = Buffer.from(await fileValue.arrayBuffer());
		const normalizedImage = await normalizeImageBuffer({
			buffer: sourceBuffer,
			contentType: fileValue.type,
			fileNameOrUrl: fileValue.name,
		});

		const timestamp = Date.now();
		const randomPart = Math.random().toString(36).slice(2, 10);
		const fileName =
			`${folderName}/${timestamp}-${randomPart}.${normalizedImage.extension}`;

		const supabase = createServiceClient();
		const { data: uploadedFile, error: uploadError } = await supabase.storage
			.from(SAKE_IMAGES_BUCKET)
			.upload(fileName, normalizedImage.buffer, {
				contentType: normalizedImage.contentType,
				cacheControl: "3600",
				upsert: false,
			});

		if (uploadError || !uploadedFile) {
			console.error("Failed to upload chat image:", uploadError);
			return NextResponse.json(
				{ error: "Failed to upload image", details: uploadError?.message || "Unknown upload error" },
				{ status: 500 },
			);
		}

		const { data: publicUrlData } = supabase.storage
			.from(SAKE_IMAGES_BUCKET)
			.getPublicUrl(uploadedFile.path);

		return NextResponse.json({
			url: publicUrlData.publicUrl,
			path: uploadedFile.path,
			mediaType: normalizedImage.contentType,
			converted_from_heic: normalizedImage.wasHeicConverted,
		});
	} catch (error) {
		console.error("Error in POST /api/chat/upload:", error);
		return NextResponse.json(
			{ error: "Failed to upload image" },
			{ status: 500 },
		);
	}
};
