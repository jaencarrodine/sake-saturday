import { normalizeImageBuffer } from '@/lib/images/normalize-image';

export const downloadTwilioMedia = async (
	mediaUrl: string
): Promise<{ type: 'image'; image: string } | null> => {
	try {
		const accountSid = process.env.TWILIO_ACCOUNT_SID;
		const authToken = process.env.TWILIO_AUTH_TOKEN;

		if (!accountSid || !authToken) {
			console.error('Missing Twilio credentials');
			return null;
		}

		const basicAuth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');

		const response = await fetch(mediaUrl, {
			headers: {
				Authorization: `Basic ${basicAuth}`,
			},
		});

		if (!response.ok) {
			console.error('Failed to download media:', response.statusText);
			return null;
		}

		const rawBuffer = Buffer.from(await response.arrayBuffer());
		const normalizedImage = await normalizeImageBuffer({
			buffer: rawBuffer,
			contentType: response.headers.get('content-type'),
			fileNameOrUrl: mediaUrl,
		});
		const base64 = normalizedImage.buffer.toString('base64');
		const contentType = normalizedImage.contentType || response.headers.get('content-type') || 'image/jpeg';
		
		const dataUrl = `data:${contentType};base64,${base64}`;

		return {
			type: 'image',
			image: dataUrl,
		};
	} catch (error) {
		console.error('Error downloading Twilio media:', error);
		return null;
	}
};

export const processMediaUrls = async (
	mediaUrls: string[] | null
): Promise<Array<{ type: 'image'; image: string }>> => {
	if (!mediaUrls || mediaUrls.length === 0) {
		return [];
	}

	const mediaContents = await Promise.all(
		mediaUrls.map(url => downloadTwilioMedia(url))
	);

	return mediaContents.filter((content): content is { type: 'image'; image: string } => content !== null);
};
