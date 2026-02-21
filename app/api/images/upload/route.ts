import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { withApiAuth } from '@/lib/api/auth';
import { SAKE_IMAGES_BUCKET } from '@/lib/supabase/storage';

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
		const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'];
		if (!validTypes.includes(file.type)) {
			return NextResponse.json(
				{ error: 'Invalid file type. Only JPEG, PNG, WEBP, and GIF are allowed' },
				{ status: 400 }
			);
		}

		// Validate file size (max 10MB)
		const maxSize = 10 * 1024 * 1024; // 10MB
		if (file.size > maxSize) {
			return NextResponse.json(
				{ error: 'File size must be less than 10MB' },
				{ status: 400 }
			);
		}

		const supabase = createServiceClient();

		// Generate unique filename
		const timestamp = Date.now();
		const randomStr = Math.random().toString(36).substring(7);
		const fileExt = file.name.split('.').pop();
		const fileName = `${folder}/${timestamp}-${randomStr}.${fileExt}`;

		// Convert File to ArrayBuffer
		const arrayBuffer = await file.arrayBuffer();
		const buffer = Buffer.from(arrayBuffer);

		// Upload to Supabase Storage
		const { data, error } = await supabase.storage
			.from(SAKE_IMAGES_BUCKET)
			.upload(fileName, buffer, {
				contentType: file.type,
				cacheControl: '3600',
				upsert: false,
			});

		if (error) {
			console.error('Error uploading image:', error);
			return NextResponse.json(
				{ error: 'Failed to upload image', details: error.message },
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
