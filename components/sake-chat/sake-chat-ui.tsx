"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
	ImagePlus,
	Loader2,
	LogOut,
	LockKeyhole,
	SendHorizontal,
	ShieldCheck,
	Square,
	X,
} from "lucide-react";
import {
	useEffect,
	useRef,
	useState,
	type ChangeEvent,
	type FormEvent,
} from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const MAX_FILES_PER_MESSAGE = 4;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_STORED_MESSAGES = 60;
const CHAT_STORAGE_PREFIX = "sake-chat-ui-messages-v1";

type PendingFile = {
	id: string;
	file: File;
};

type MessagePart = UIMessage["parts"][number];
type ChatAccessRole = "general" | "admin";
type AccessResponse = {
	authenticated?: boolean;
	role?: ChatAccessRole | null;
	error?: string;
};
type IdentityResponse = {
	identified?: boolean;
	phoneNumber?: string | null;
	error?: string;
};

const isTextPart = (
	part: MessagePart,
): part is Extract<MessagePart, { type: "text" }> => part.type === "text";

const isFilePart = (
	part: MessagePart,
): part is Extract<MessagePart, { type: "file" }> => part.type === "file";

const formatFileSize = (bytes: number): string => {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const toFileList = (files: File[]): FileList => {
	const dataTransfer = new DataTransfer();

	files.forEach((file) => {
		dataTransfer.items.add(file);
	});

	return dataTransfer.files;
};

const getMessageStorageKey = (
	role: ChatAccessRole,
	phoneNumber: string,
): string => `${CHAT_STORAGE_PREFIX}:${role}:${phoneNumber}`;

const parseStoredMessages = (storedValue: string | null): UIMessage[] => {
	if (!storedValue) return [];

	try {
		const parsedValue = JSON.parse(storedValue) as unknown;
		if (!Array.isArray(parsedValue)) return [];
		return parsedValue as UIMessage[];
	} catch {
		return [];
	}
};

const readStoredMessages = (
	role: ChatAccessRole,
	phoneNumber: string,
): UIMessage[] => {
	const storageKey = getMessageStorageKey(role, phoneNumber);

	try {
		return parseStoredMessages(window.localStorage.getItem(storageKey));
	} catch {
		return [];
	}
};

const persistMessages = (
	role: ChatAccessRole,
	phoneNumber: string,
	messages: UIMessage[],
): void => {
	const storageKey = getMessageStorageKey(role, phoneNumber);
	const messagesToStore = messages.slice(-MAX_STORED_MESSAGES);

	try {
		window.localStorage.setItem(storageKey, JSON.stringify(messagesToStore));
	} catch {
		// Ignore storage quota or private mode errors.
	}
};

export default function SakeChatUi() {
	const [inputValue, setInputValue] = useState("");
	const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const [passwordValue, setPasswordValue] = useState("");
	const [authError, setAuthError] = useState<string | null>(null);
	const [accessRole, setAccessRole] = useState<ChatAccessRole | null>(null);
	const [isCheckingAccess, setIsCheckingAccess] = useState(true);
	const [isCheckingIdentity, setIsCheckingIdentity] = useState(false);
	const [phoneNumberValue, setPhoneNumberValue] = useState("");
	const [identityPhoneNumber, setIdentityPhoneNumber] = useState<string | null>(null);
	const [identityError, setIdentityError] = useState<string | null>(null);
	const [isSavingIdentity, setIsSavingIdentity] = useState(false);
	const [isUnlocking, setIsUnlocking] = useState(false);
	const [isLoggingOut, setIsLoggingOut] = useState(false);
	const [hydratedConversationKey, setHydratedConversationKey] = useState<
		string | null
	>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const bottomAnchorRef = useRef<HTMLDivElement>(null);

	const {
		messages,
		setMessages,
		sendMessage,
		stop,
		status,
		error,
		clearError,
	} = useChat({
		id: "sake-chat-ui",
		transport: new DefaultChatTransport({ api: "/api/chat" }),
	});

	const isStreaming = status === "submitted" || status === "streaming";
	const hasAccess = accessRole !== null;
	const hasIdentity = identityPhoneNumber !== null;
	const activeConversationKey =
		hasAccess && hasIdentity ? `${accessRole}:${identityPhoneNumber}` : null;
	const isSendDisabled =
		!hasAccess ||
		!hasIdentity ||
		isStreaming ||
		(!inputValue.trim() && pendingFiles.length === 0);
	const roleLabel = accessRole === "admin" ? "Admin" : "General";

	const loadAccessState = async () => {
		setIsCheckingAccess(true);
		setAuthError(null);

		try {
			const response = await fetch("/api/chat/access", {
				method: "GET",
				cache: "no-store",
			});

			if (!response.ok) {
				setAccessRole(null);
				return;
			}

			const payload = (await response.json()) as AccessResponse;
			const role = payload.authenticated ? payload.role ?? null : null;
			setAccessRole(role);
		} catch {
			setAccessRole(null);
		} finally {
			setIsCheckingAccess(false);
		}
	};

	const loadIdentityState = async () => {
		setIsCheckingIdentity(true);
		setIdentityError(null);

		try {
			const response = await fetch("/api/chat/identity", {
				method: "GET",
				cache: "no-store",
			});

			if (!response.ok) {
				setIdentityPhoneNumber(null);
				return;
			}

			const payload = (await response.json()) as IdentityResponse;
			const phoneNumber = payload.identified ? payload.phoneNumber ?? null : null;
			setIdentityPhoneNumber(phoneNumber);
		} catch {
			setIdentityPhoneNumber(null);
		} finally {
			setIsCheckingIdentity(false);
		}
	};

	useEffect(() => {
		bottomAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, status]);

	useEffect(() => {
		void loadAccessState();
	}, []);

	useEffect(() => {
		if (!accessRole) {
			setIdentityPhoneNumber(null);
			setIdentityError(null);
			setIsCheckingIdentity(false);
			setHydratedConversationKey(null);
			setMessages([]);
			return;
		}

		void loadIdentityState();
	}, [accessRole, setMessages]);

	useEffect(() => {
		if (!accessRole || !identityPhoneNumber) {
			setHydratedConversationKey(null);
			setMessages([]);
			return;
		}

		const restoredMessages = readStoredMessages(accessRole, identityPhoneNumber);
		setMessages(restoredMessages);
		setHydratedConversationKey(`${accessRole}:${identityPhoneNumber}`);
	}, [accessRole, identityPhoneNumber, setMessages]);

	useEffect(() => {
		if (
			!accessRole ||
			!identityPhoneNumber ||
			!activeConversationKey ||
			hydratedConversationKey !== activeConversationKey ||
			messages.length === 0
		)
			return;

		persistMessages(accessRole, identityPhoneNumber, messages);
	}, [
		accessRole,
		identityPhoneNumber,
		activeConversationKey,
		hydratedConversationKey,
		messages,
	]);

	const removePendingFile = (fileId: string) => {
		setPendingFiles((currentFiles) =>
			currentFiles.filter(({ id }) => id !== fileId),
		);
	};

	const handleFileSelect = (event: ChangeEvent<HTMLInputElement>) => {
		const selectedFiles = Array.from(event.target.files ?? []);

		if (selectedFiles.length === 0) return;

		setUploadError(null);
		const remainingSlots = MAX_FILES_PER_MESSAGE - pendingFiles.length;

		if (remainingSlots <= 0) {
			setUploadError(`You can attach up to ${MAX_FILES_PER_MESSAGE} photos per message.`);
			event.target.value = "";
			return;
		}

		const candidateFiles = selectedFiles.slice(0, remainingSlots);
		const validFiles = candidateFiles.filter(
			(file) =>
				file.type.startsWith("image/") && file.size <= MAX_FILE_SIZE_BYTES,
		);
		const skippedCount = selectedFiles.length - validFiles.length;

		if (skippedCount > 0) {
			setUploadError(
				"Some files were skipped. Only image files up to 10MB are supported.",
			);
		}

		setPendingFiles((currentFiles) => [
			...currentFiles,
			...validFiles.map((file) => ({
				id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
				file,
			})),
		]);

		event.target.value = "";
	};

	const handleSendMessage = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (isSendDisabled) return;

		setUploadError(null);
		clearError();
		const text = inputValue.trim();
		const files = pendingFiles.map(({ file }) => file);

		try {
			if (files.length > 0 && text.length > 0) {
				await sendMessage({ text, files: toFileList(files) });
			} else if (files.length > 0) {
				await sendMessage({ files: toFileList(files) });
			} else {
				await sendMessage({ text });
			}

			setInputValue("");
			setPendingFiles([]);
		} catch {
			setUploadError("Unable to send message right now. Please try again.");
		}
	};

	const handleUnlockChat = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!passwordValue) {
			setAuthError("Enter a password to unlock chat.");
			return;
		}

		setIsUnlocking(true);
		setAuthError(null);

		try {
			const response = await fetch("/api/chat/access", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ password: passwordValue }),
			});
			const payload = (await response.json()) as AccessResponse;

			if (!response.ok) {
				setAuthError(payload.error || "Invalid password.");
				return;
			}

			if (!payload.role) {
				setAuthError("Could not resolve access role.");
				return;
			}

			setPasswordValue("");
			setUploadError(null);
			clearError();
			setAccessRole(payload.role);
		} catch {
			setAuthError("Unable to verify password. Please try again.");
		} finally {
			setIsUnlocking(false);
		}
	};

	const handleSavePhoneIdentity = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!phoneNumberValue.trim()) {
			setIdentityError("Enter your phone number to continue.");
			return;
		}

		setIsSavingIdentity(true);
		setIdentityError(null);

		try {
			const response = await fetch("/api/chat/identity", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ phoneNumber: phoneNumberValue }),
			});
			const payload = (await response.json()) as IdentityResponse;

			if (!response.ok) {
				setIdentityError(payload.error || "Could not verify phone number.");
				return;
			}

			if (!payload.phoneNumber) {
				setIdentityError("Could not save phone number.");
				return;
			}

			setPhoneNumberValue("");
			setUploadError(null);
			clearError();
			setIdentityPhoneNumber(payload.phoneNumber);
		} catch {
			setIdentityError("Unable to save phone number. Please try again.");
		} finally {
			setIsSavingIdentity(false);
		}
	};

	const handleLogout = async () => {
		if (isStreaming) void stop();

		setIsLoggingOut(true);
		try {
			await Promise.all([
				fetch("/api/chat/access", { method: "DELETE" }),
				fetch("/api/chat/identity", { method: "DELETE" }),
			]);
		} finally {
			setAccessRole(null);
			setIdentityPhoneNumber(null);
			setPhoneNumberValue("");
			setIdentityError(null);
			setPasswordValue("");
			setInputValue("");
			setPendingFiles([]);
			setUploadError(null);
			clearError();
			setIsLoggingOut(false);
		}
	};

	return (
		<Card className="panel gap-0 border-divider p-0">
			<div className="border-b border-divider px-4 py-3">
				<div className="flex items-center justify-between gap-3">
					<div>
						<h2 className="panel-title mb-2">AI CHAT TERMINAL</h2>
						<p className="text-sm text-muted">
							Chat directly with Sake Sensei and upload bottle photos for analysis.
						</p>
					</div>
					<div className="flex items-center gap-2">
						{hasAccess && (
							<div className="inline-flex items-center gap-1 rounded border border-neon-cyan/40 bg-neon-cyan/10 px-2 py-1 text-xs uppercase tracking-[0.18em] text-neon-cyan">
								<ShieldCheck className="h-3 w-3" />
								{roleLabel}
							</div>
						)}
						{hasIdentity && (
							<div className="rounded border border-divider bg-black/40 px-2 py-1 text-xs text-muted">
								{identityPhoneNumber}
							</div>
						)}
						{hasAccess && (
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onClick={() => void handleLogout()}
								disabled={isLoggingOut}
							>
								{isLoggingOut ? (
									<Loader2 className="h-4 w-4 animate-spin" />
								) : (
									<LogOut className="h-4 w-4" />
								)}
								Lock
							</Button>
						)}
						<div className="text-xs uppercase tracking-[0.2em] text-neon-pink">
							{isStreaming
								? "Live"
								: !hasAccess
									? "Locked"
									: !hasIdentity
										? "Identify"
										: "Ready"}
						</div>
					</div>
				</div>
			</div>

			{isCheckingAccess ? (
				<div className="flex h-[55vh] items-center justify-center px-4 py-4 text-sm text-muted">
					<div className="flex items-center gap-2">
						<Loader2 className="h-4 w-4 animate-spin" />
						Checking chat access...
					</div>
				</div>
			) : hasAccess && isCheckingIdentity ? (
				<div className="flex h-[55vh] items-center justify-center px-4 py-4 text-sm text-muted">
					<div className="flex items-center gap-2">
						<Loader2 className="h-4 w-4 animate-spin" />
						Checking phone identity...
					</div>
				</div>
			) : !hasAccess ? (
				<div className="space-y-4 px-4 py-6">
					<div className="rounded-lg border border-divider bg-black/30 p-4 text-sm text-muted">
						<p className="mb-2 text-white">This chat is password protected.</p>
						<p>
							Use the general password to chat and create tastings. Use the admin
							password for the same elevated privileges as Jaen&apos;s number.
						</p>
					</div>

					<form onSubmit={handleUnlockChat} className="space-y-3">
						<input
							type="password"
							value={passwordValue}
							onChange={(event) => setPasswordValue(event.target.value)}
							placeholder="Enter access password..."
							className="h-11 w-full rounded-md border border-divider bg-black/30 px-3 text-sm text-white placeholder:text-muted focus:border-neon-cyan focus:outline-none"
						/>
						<Button type="submit" size="sm" disabled={isUnlocking}>
							{isUnlocking ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<LockKeyhole className="h-4 w-4" />
							)}
							Unlock Chat
						</Button>
					</form>

					{authError && <p className="text-sm text-red">{authError}</p>}
				</div>
			) : !hasIdentity ? (
				<div className="space-y-4 px-4 py-6">
					<div className="rounded-lg border border-divider bg-black/30 p-4 text-sm text-muted">
						<p className="mb-2 text-white">First step: identify with your phone number.</p>
						<p>
							This web chat now uses the same Sake Sensei agent pipeline as WhatsApp.
							Your phone number links your identity and conversation context.
						</p>
					</div>

					<form onSubmit={handleSavePhoneIdentity} className="space-y-3">
						<input
							type="tel"
							value={phoneNumberValue}
							onChange={(event) => setPhoneNumberValue(event.target.value)}
							placeholder="Enter your phone number (e.g. +1 555 555 5555)"
							className="h-11 w-full rounded-md border border-divider bg-black/30 px-3 text-sm text-white placeholder:text-muted focus:border-neon-cyan focus:outline-none"
						/>
						<Button type="submit" size="sm" disabled={isSavingIdentity}>
							{isSavingIdentity ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								<ShieldCheck className="h-4 w-4" />
							)}
							Continue to Chat
						</Button>
					</form>

					{identityError && <p className="text-sm text-red">{identityError}</p>}
				</div>
			) : (
				<>
					<div className="h-[55vh] space-y-4 overflow-y-auto px-4 py-4">
						{messages.length === 0 ? (
							<div className="rounded-lg border border-divider bg-black/30 p-4 text-sm text-muted">
								Ask about sake, tasting notes, pairings, or upload a bottle photo to
								get label-level insights.
							</div>
						) : (
							messages.map((message) => {
								if (message.role === "system") return null;

								const textParts = message.parts
									.filter(isTextPart)
									.map((part) => part.text)
									.filter((text) => text.trim().length > 0);
								const fileParts = message.parts.filter(isFilePart);

								if (textParts.length === 0 && fileParts.length === 0) return null;

								const isAssistant = message.role === "assistant";

								return (
									<div
										key={message.id}
										className={`flex ${isAssistant ? "justify-start" : "justify-end"}`}
									>
										<div
											className={`max-w-[88%] rounded-lg border px-3 py-3 ${
												isAssistant
													? "border-neon-cyan/40 bg-black/40 text-white"
													: "border-neon-pink/40 bg-neon-pink/10 text-white"
											}`}
										>
											{fileParts.map((part, index) => {
												const isImage = part.mediaType.startsWith("image/");

												if (!isImage) {
													return (
														<a
															key={`${part.url}-${index}`}
															href={part.url}
															target="_blank"
															rel="noreferrer"
															className="mb-2 block text-sm text-neon-cyan underline"
														>
															{part.filename || "Attached file"}
														</a>
													);
												}

												return (
													// Using native img to support dynamic data URLs from chat uploads.
													// eslint-disable-next-line @next/next/no-img-element
													<img
														key={`${part.url}-${index}`}
														src={part.url}
														alt={part.filename || "Uploaded sake photo"}
														className="mb-2 max-h-72 w-full rounded-md border border-divider object-contain"
													/>
												);
											})}

											{textParts.map((text, index) => (
												<p
													key={`${message.id}-text-${index}`}
													className="whitespace-pre-wrap text-sm leading-relaxed"
												>
													{text}
												</p>
											))}
										</div>
									</div>
								);
							})
						)}

						{isStreaming && (
							<div className="flex items-center gap-2 text-sm text-neon-cyan">
								<Loader2 className="h-4 w-4 animate-spin" />
								Sake Sensei is typing...
							</div>
						)}

						<div ref={bottomAnchorRef} />
					</div>

					<div className="border-t border-divider px-4 py-4">
						{pendingFiles.length > 0 && (
							<div className="mb-3 flex flex-wrap gap-2">
								{pendingFiles.map(({ id, file }) => (
									<div
										key={id}
										className="flex items-center gap-2 rounded-md border border-divider bg-black/50 px-2 py-1 text-xs"
									>
										<span className="max-w-[180px] truncate">{file.name}</span>
										<span className="text-muted">{formatFileSize(file.size)}</span>
										<button
											type="button"
											onClick={() => removePendingFile(id)}
											className="text-muted transition-colors hover:text-white"
											aria-label={`Remove ${file.name}`}
										>
											<X className="h-3 w-3" />
										</button>
									</div>
								))}
							</div>
						)}

						{uploadError && <p className="mb-3 text-sm text-red">{uploadError}</p>}
						{error && (
							<p className="mb-3 text-sm text-red">
								{error.message || "A chat error occurred. Please retry."}
							</p>
						)}

						<form onSubmit={handleSendMessage} className="space-y-3">
							<textarea
								value={inputValue}
								onChange={(event) => setInputValue(event.target.value)}
								placeholder="Ask about a sake, tasting notes, or upload a bottle photo..."
								className="min-h-24 w-full resize-y rounded-md border border-divider bg-black/30 px-3 py-2 text-sm text-white placeholder:text-muted focus:border-neon-cyan focus:outline-none"
							/>

							<div className="flex flex-wrap items-center justify-between gap-2">
								<div className="flex items-center gap-2">
									<input
										ref={fileInputRef}
										type="file"
										accept="image/*"
										multiple
										className="hidden"
										onChange={handleFileSelect}
									/>

									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => fileInputRef.current?.click()}
										disabled={isStreaming}
									>
										<ImagePlus className="h-4 w-4" />
										Upload sake photo
									</Button>
								</div>

								<div className="flex items-center gap-2">
									{isStreaming && (
										<Button
											type="button"
											variant="secondary"
											size="sm"
											onClick={() => void stop()}
										>
											<Square className="h-4 w-4" />
											Stop
										</Button>
									)}

									<Button type="submit" size="sm" disabled={isSendDisabled}>
										{isStreaming ? (
											<Loader2 className="h-4 w-4 animate-spin" />
										) : (
											<SendHorizontal className="h-4 w-4" />
										)}
										Send
									</Button>
								</div>
							</div>
						</form>
					</div>
				</>
			)}
		</Card>
	);
}
