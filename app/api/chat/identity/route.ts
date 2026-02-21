import { NextRequest, NextResponse } from "next/server";
import {
	CHAT_ACCESS_COOKIE_NAME,
	CHAT_IDENTITY_COOKIE_NAME,
	CHAT_IDENTITY_MAX_AGE_SECONDS,
	normalizeChatPhoneNumber,
	readRoleFromSessionToken,
} from "@/lib/chat-auth";

export const runtime = "nodejs";

type IdentityRequestBody = {
	phoneNumber?: string;
};

const buildCookieOptions = (maxAge: number) => ({
	httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: "lax" as const,
	path: "/",
	maxAge,
});

const clearIdentityCookie = (response: NextResponse): void => {
	response.cookies.set(CHAT_IDENTITY_COOKIE_NAME, "", buildCookieOptions(0));
};

const setIdentityCookie = (
	response: NextResponse,
	normalizedPhoneNumber: string,
): void => {
	response.cookies.set(
		CHAT_IDENTITY_COOKIE_NAME,
		normalizedPhoneNumber,
		buildCookieOptions(CHAT_IDENTITY_MAX_AGE_SECONDS),
	);
};

export const GET = async (request: NextRequest) => {
	const accessToken = request.cookies.get(CHAT_ACCESS_COOKIE_NAME)?.value;
	const accessRole = readRoleFromSessionToken(accessToken);
	if (!accessRole) {
		return NextResponse.json({
			identified: false,
			phoneNumber: null,
		});
	}

	const rawPhoneNumber = request.cookies.get(CHAT_IDENTITY_COOKIE_NAME)?.value;
	const normalizedPhoneNumber = rawPhoneNumber
		? normalizeChatPhoneNumber(rawPhoneNumber)
		: null;

	if (!normalizedPhoneNumber) {
		const response = NextResponse.json({
			identified: false,
			phoneNumber: null,
		});

		if (rawPhoneNumber) clearIdentityCookie(response);
		return response;
	}

	return NextResponse.json({
		identified: true,
		phoneNumber: normalizedPhoneNumber,
	});
};

export const POST = async (request: NextRequest) => {
	const accessToken = request.cookies.get(CHAT_ACCESS_COOKIE_NAME)?.value;
	const accessRole = readRoleFromSessionToken(accessToken);
	if (!accessRole) {
		return NextResponse.json(
			{ error: "Chat access password required before identity setup." },
			{ status: 401 },
		);
	}

	let body: IdentityRequestBody;
	try {
		body = (await request.json()) as IdentityRequestBody;
	} catch {
		return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
	}

	const normalizedPhoneNumber = body.phoneNumber
		? normalizeChatPhoneNumber(body.phoneNumber)
		: null;
	if (!normalizedPhoneNumber) {
		return NextResponse.json(
			{ error: "Please enter a valid phone number." },
			{ status: 400 },
		);
	}

	const response = NextResponse.json({
		identified: true,
		phoneNumber: normalizedPhoneNumber,
	});

	setIdentityCookie(response, normalizedPhoneNumber);
	return response;
};

export const DELETE = async () => {
	// Identity reset is always safe, even when access has already expired.
	const response = NextResponse.json({
		identified: false,
		phoneNumber: null,
	});

	clearIdentityCookie(response);
	return response;
};
