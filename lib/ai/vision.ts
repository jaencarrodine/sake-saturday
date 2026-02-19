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

		const buffer = await response.arrayBuffer();
		const base64 = Buffer.from(buffer).toString('base64');
		const contentType = response.headers.get('content-type') || '';
		
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
