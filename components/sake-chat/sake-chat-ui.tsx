"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { ImagePlus, Loader2, SendHorizontal, Square, X } from "lucide-react";
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

type PendingFile = {
	id: string;
	file: File;
};

type MessagePart = UIMessage["parts"][number];

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

export default function SakeChatUi() {
	const [inputValue, setInputValue] = useState("");
	const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
	const [uploadError, setUploadError] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const bottomAnchorRef = useRef<HTMLDivElement>(null);

	const { messages, sendMessage, stop, status, error, clearError } = useChat({
		transport: new DefaultChatTransport({ api: "/api/chat" }),
	});

	const isStreaming = status === "submitted" || status === "streaming";
	const isSendDisabled = isStreaming || (!inputValue.trim() && pendingFiles.length === 0);

	useEffect(() => {
		bottomAnchorRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages, status]);

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
					<div className="text-xs uppercase tracking-[0.2em] text-neon-pink">
						{isStreaming ? "Live" : "Ready"}
					</div>
				</div>
			</div>

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
		</Card>
	);
}
