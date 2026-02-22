import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { withApiAuth } from '@/lib/api/auth';
import { SAKE_IMAGES_BUCKET } from '@/lib/supabase/storage';
import { normalizeImageBuffer } from '@/lib/images/normalize-image';

const IMAGE_FILE_EXTENSION_PATTERN =
	/\.(jpg|jpeg|png|webp|gif|avif|heic|heif)$/i;

// POST /api/images/upload - Upload image to Supabase Storage
const postHandler = async (req: NextRequest) => {
	try {
		const formData = await req.formData();
		const file = formData.get('file') as File;
		const folder = formData.get('folder') as string || 'general';

		if (!file) {
			return NextResponse.json(
				{ error: 'File is required' },
				{ status: 400 }
			);
		}

		// Validate file type
		const validTypes = [
			'image/jpeg',
			'image/jpg',
			'image/png',
			'image/webp',
			'image/gif',
			'image/heic',
			'image/heif',
			'image/heic-sequence',
			'image/heif-sequence',
		];
		const normalizedType = file.type.toLowerCase();
		const isSupportedImageType =
			validTypes.includes(normalizedType) ||
			(!normalizedType && IMAGE_FILE_EXTENSION_PATTERN.test(file.name));

		if (!isSupportedImageType) {
			return NextResponse.json(
				{ error: 'Invalid file type. Supported: JPEG, PNG, WEBP, GIF, HEIC, HEIF' },
				{ status: 400 }
			);
		}

		const supabase = createServiceClient();

		// Generate unique filename
		const timestamp = Date.now();
		const randomStr = Math.random().toString(36).substring(7);
		
		// Convert File to Buffer and normalize image format.
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);
		const normalizedImage = await normalizeImageBuffer({
			buffer,
			contentType: file.type,
			fileNameOrUrl: file.name,
		});
		const fileName = `${folder}/${timestamp}-${randomStr}.${normalizedImage.extension}`;

		// Upload to Supabase Storage
		const { data: uploadData, error } = await supabase.storage
			.from(SAKE_IMAGES_BUCKET)
			.upload(fileName, normalizedImage.buffer, {
				contentType: normalizedImage.contentType,
				cacheControl: '3600',
				upsert: false,
			});

		if (error || !uploadData) {
			console.error('Error uploading image:', error);
			return NextResponse.json(
				{ error: 'Failed to upload image', details: error?.message || 'Unknown upload error' },
				{ status: 500 }
			);
		}

		// Get public URL
		const { data: publicUrlData } = supabase.storage
			.from(SAKE_IMAGES_BUCKET)
			.getPublicUrl(fileName);

		return NextResponse.json({
			url: publicUrlData.publicUrl,
			path: fileName,
			converted_from_heic: normalizedImage.wasHeicConverted,
		}, { status: 201 });
	} catch (error) {
		console.error('Error in POST /api/images/upload:', error);
		return NextResponse.json(
			{ error: 'Internal server error' },
			{ status: 500 }
		);
	}
};

// POST requires authentication
export const POST = withApiAuth(postHandler);
