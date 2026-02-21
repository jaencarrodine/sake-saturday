import heicConvert from 'heic-convert';

const HEIC_MIME_TYPES = new Set([
	'image/heic',
	'image/heif',
	'image/heic-sequence',
	'image/heif-sequence',
]);

const MIME_TO_EXTENSION: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/jpg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'image/gif': 'gif',
	'image/avif': 'avif',
	'image/heic': 'heic',
	'image/heif': 'heif',
};

const EXTENSION_TO_MIME: Record<string, string> = {
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
	gif: 'image/gif',
	avif: 'image/avif',
	heic: 'image/heic',
	heif: 'image/heif',
};

const normalizeMimeType = (mimeType: string | null | undefined): string =>
	(mimeType || '').trim().toLowerCase();

const extractPathExtension = (value: string | null | undefined): string | null => {
	if (!value)
		return null;

	const trimmedValue = value.trim();
	if (!trimmedValue)
		return null;

	try {
		const parsedUrl = new URL(trimmedValue);
		const fileName = parsedUrl.pathname.split('/').pop() || '';
		const extension = fileName.includes('.') ? fileName.split('.').pop() : null;
		return extension ? extension.toLowerCase() : null;
	} catch {
		const fileName = trimmedValue.split('/').pop() || '';
		const extension = fileName.includes('.') ? fileName.split('.').pop() : null;
		return extension ? extension.toLowerCase() : null;
	}
};

const isHeic = (mimeType: string, extension: string | null): boolean =>
	HEIC_MIME_TYPES.has(mimeType) || extension === 'heic' || extension === 'heif';

export type NormalizedImageResult = {
	buffer: Buffer;
	contentType: string;
	extension: string;
	wasHeicConverted: boolean;
};

export const normalizeImageBuffer = async (input: {
	buffer: Buffer;
	contentType?: string | null;
	fileNameOrUrl?: string | null;
}): Promise<NormalizedImageResult> => {
	const { buffer, contentType, fileNameOrUrl } = input;
	const normalizedMimeType = normalizeMimeType(contentType);
	const extensionFromName = extractPathExtension(fileNameOrUrl);

	if (isHeic(normalizedMimeType, extensionFromName)) {
		const converted = await heicConvert({
			buffer,
			format: 'JPEG',
			quality: 0.9,
		});

		const convertedBuffer = Buffer.isBuffer(converted)
			? converted
			: Buffer.from(converted as Uint8Array);

		return {
			buffer: convertedBuffer,
			contentType: 'image/jpeg',
			extension: 'jpg',
			wasHeicConverted: true,
		};
	}

	const resolvedContentType =
		normalizedMimeType ||
		(extensionFromName ? EXTENSION_TO_MIME[extensionFromName] : undefined) ||
		'image/jpeg';
	const extensionFromMimeType = MIME_TO_EXTENSION[resolvedContentType] || null;
	const resolvedExtension = extensionFromMimeType || extensionFromName || 'jpg';

	return {
		buffer,
		contentType: resolvedContentType,
		extension: resolvedExtension,
		wasHeicConverted: false,
	};
};
