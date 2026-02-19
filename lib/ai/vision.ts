import type Anthropic from '@anthropic-ai/sdk';

export const downloadTwilioMedia = async (
	mediaUrl: string
): Promise<Anthropic.ImageBlockParam | null> => {
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

		const contentType = response.headers.get('content-type') || '';
		const mediaType = getMediaType(contentType);

		if (!mediaType) {
			console.error('Unsupported media type:', contentType);
			return null;
		}

		const buffer = await response.arrayBuffer();
		const base64 = Buffer.from(buffer).toString('base64');

		return {
			type: 'image',
			source: {
				type: 'base64',
				media_type: mediaType,
				data: base64,
			},
		};
	} catch (error) {
		console.error('Error downloading Twilio media:', error);
		return null;
	}
};

const getMediaType = (
	contentType: string
): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | null => {
	if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'image/jpeg';
	if (contentType.includes('png')) return 'image/png';
	if (contentType.includes('gif')) return 'image/gif';
	if (contentType.includes('webp')) return 'image/webp';
	return null;
};

export const processMediaUrls = async (
	mediaUrls: string[] | null
): Promise<Anthropic.ImageBlockParam[]> => {
	if (!mediaUrls || mediaUrls.length === 0) {
		return [];
	}

	const mediaContents = await Promise.all(
		mediaUrls.map(url => downloadTwilioMedia(url))
	);

	return mediaContents.filter((content): content is Anthropic.ImageBlockParam => content !== null);
};
