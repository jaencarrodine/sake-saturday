import { createHmac, timingSafeEqual } from "node:crypto";

export const CHAT_ACCESS_COOKIE_NAME = "sake-chat-access";
export const CHAT_ACCESS_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
export const CHAT_IDENTITY_COOKIE_NAME = "sake-chat-phone";
export const CHAT_IDENTITY_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export type ChatAccessRole = "general" | "admin";

type ChatSessionPayload = {
	role: ChatAccessRole;
	expiresAt: number;
};

type ChatPasswordConfig = {
	generalPassword: string | null;
	adminPassword: string | null;
};

const getChatPasswordConfig = (): ChatPasswordConfig => ({
	generalPassword: process.env.CHAT_UI_GENERAL_PASSWORD?.trim() || null,
	adminPassword: process.env.CHAT_UI_ADMIN_PASSWORD?.trim() || null,
});

export const getChatAuthConfigStatus = () => {
	const { generalPassword, adminPassword } = getChatPasswordConfig();

	return {
		hasGeneralPassword: Boolean(generalPassword),
		hasAdminPassword: Boolean(adminPassword),
	};
};

const getSessionSecret = (): string | null => {
	const candidateSecret =
		process.env.CHAT_UI_SESSION_SECRET ||
		process.env.NEXTAUTH_SECRET ||
		process.env.SUPABASE_SERVICE_ROLE_KEY ||
		null;

	if (!candidateSecret || candidateSecret.length < 16) return null;
	return candidateSecret;
};

const encodeBase64Url = (value: string): string =>
	Buffer.from(value, "utf8").toString("base64url");

const decodeBase64Url = (value: string): string =>
	Buffer.from(value, "base64url").toString("utf8");

const signPayload = (payload: string, secret: string): string =>
	createHmac("sha256", secret).update(payload).digest("base64url");

const isMatchingSecret = (value: string, secret: string): boolean => {
	const valueBuffer = Buffer.from(value);
	const secretBuffer = Buffer.from(secret);

	if (valueBuffer.length !== secretBuffer.length) return false;
	return timingSafeEqual(valueBuffer, secretBuffer);
};

export const resolveRoleFromPassword = (
	password: string,
): ChatAccessRole | null => {
	const { generalPassword, adminPassword } = getChatPasswordConfig();

	if (adminPassword && isMatchingSecret(password, adminPassword)) return "admin";
	if (generalPassword && isMatchingSecret(password, generalPassword))
		return "general";

	return null;
};

export const createChatSessionToken = (
	role: ChatAccessRole,
): string | null => {
	const sessionSecret = getSessionSecret();
	if (!sessionSecret) return null;

	const payload: ChatSessionPayload = {
		role,
		expiresAt: Date.now() + CHAT_ACCESS_SESSION_MAX_AGE_SECONDS * 1000,
	};

	const encodedPayload = encodeBase64Url(JSON.stringify(payload));
	const signature = signPayload(encodedPayload, sessionSecret);

	return `${encodedPayload}.${signature}`;
};

export const readRoleFromSessionToken = (
	sessionToken: string | null | undefined,
): ChatAccessRole | null => {
	if (!sessionToken) return null;

	const sessionSecret = getSessionSecret();
	if (!sessionSecret) return null;

	const [encodedPayload, providedSignature] = sessionToken.split(".");
	if (!encodedPayload || !providedSignature) return null;

	const expectedSignature = signPayload(encodedPayload, sessionSecret);
	if (!isMatchingSecret(providedSignature, expectedSignature)) return null;

	try {
		const decodedPayload = decodeBase64Url(encodedPayload);
		const payload = JSON.parse(decodedPayload) as Partial<ChatSessionPayload>;

		if (
			payload.role !== "general" &&
			payload.role !== "admin"
		)
			return null;
		if (typeof payload.expiresAt !== "number") return null;
		if (Date.now() >= payload.expiresAt) return null;

		return payload.role;
	} catch {
		return null;
	}
};

export const normalizeChatPhoneNumber = (value: string): string | null => {
	const trimmedValue = value.trim();
	if (trimmedValue.length === 0) return null;

	const digitsOnly = trimmedValue.replace(/\D/g, "");
	if (digitsOnly.length < 7 || digitsOnly.length > 15) return null;

	return `+${digitsOnly}`;
};
