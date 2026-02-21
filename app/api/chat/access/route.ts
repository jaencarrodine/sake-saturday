import { NextRequest, NextResponse } from "next/server";
import {
	CHAT_ACCESS_COOKIE_NAME,
	CHAT_ACCESS_SESSION_MAX_AGE_SECONDS,
	createChatSessionToken,
	getChatAuthConfigStatus,
	readRoleFromSessionToken,
	resolveRoleFromPassword,
} from "@/lib/chat-auth";

export const runtime = "nodejs";

type AccessRequestBody = {
	password?: string;
};

const buildCookieOptions = (maxAge: number) => ({
	httpOnly: true,
	secure: process.env.NODE_ENV === "production",
	sameSite: "lax" as const,
	path: "/",
	maxAge,
});

const clearAccessCookie = (response: NextResponse): void => {
	response.cookies.set(CHAT_ACCESS_COOKIE_NAME, "", buildCookieOptions(0));
};

const setAccessCookie = (response: NextResponse, token: string): void => {
	response.cookies.set(
		CHAT_ACCESS_COOKIE_NAME,
		token,
		buildCookieOptions(CHAT_ACCESS_SESSION_MAX_AGE_SECONDS),
	);
};

export const GET = async (request: NextRequest) => {
	const token = request.cookies.get(CHAT_ACCESS_COOKIE_NAME)?.value;
	const role = readRoleFromSessionToken(token);

	if (!role) {
		const response = NextResponse.json({
			authenticated: false,
			role: null,
		});

		if (token) clearAccessCookie(response);
		return response;
	}

	return NextResponse.json({
		authenticated: true,
		role,
	});
};

export const POST = async (request: NextRequest) => {
	const { hasGeneralPassword, hasAdminPassword } = getChatAuthConfigStatus();

	if (!hasGeneralPassword || !hasAdminPassword) {
		return NextResponse.json(
			{
				error:
					"CHAT_UI_GENERAL_PASSWORD and CHAT_UI_ADMIN_PASSWORD must both be configured.",
			},
			{ status: 500 },
		);
	}

	let body: AccessRequestBody;
	try {
		body = (await request.json()) as AccessRequestBody;
	} catch {
		return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
	}

	const password = body.password;
	if (!password || password.length === 0) {
		return NextResponse.json({ error: "Password is required" }, { status: 400 });
	}

	const role = resolveRoleFromPassword(password);
	if (!role) {
		return NextResponse.json({ error: "Invalid password" }, { status: 401 });
	}

	const sessionToken = createChatSessionToken(role);
	if (!sessionToken) {
		return NextResponse.json(
			{
				error:
					"Chat session secret is not configured. Set CHAT_UI_SESSION_SECRET (or NEXTAUTH_SECRET).",
			},
			{ status: 500 },
		);
	}

	const response = NextResponse.json({
		authenticated: true,
		role,
	});

	setAccessCookie(response, sessionToken);
	return response;
};

export const DELETE = async () => {
	const response = NextResponse.json({
		authenticated: false,
		role: null,
	});

	clearAccessCookie(response);
	return response;
};
