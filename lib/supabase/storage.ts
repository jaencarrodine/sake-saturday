import { createClient } from "./server";

export const TASTING_IMAGES_BUCKET = "tasting-images";

export async function uploadImageToStorage(
  file: File | Blob,
  path: string
): Promise<{ url: string; error: null } | { url: null; error: string }> {
  try {
    const supabase = await createClient();

    const { data, error } = await supabase.storage
      .from(TASTING_IMAGES_BUCKET)
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });

    if (error) {
      console.error("Storage upload error:", error);
      return { url: null, error: error.message };
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(TASTING_IMAGES_BUCKET).getPublicUrl(data.path);

    return { url: publicUrl, error: null };
  } catch (error) {
    console.error("Upload error:", error);
    return {
      url: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function uploadBase64Image(
  base64Data: string,
  fileName: string
): Promise<{ url: string; error: null } | { url: null; error: string }> {
  try {
    const base64Response = await fetch(base64Data);
    const blob = await base64Response.blob();

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const path = `${timestamp}-${randomStr}-${fileName}`;

    return uploadImageToStorage(blob, path);
  } catch (error) {
    console.error("Base64 upload error:", error);
    return {
      url: null,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function deleteImageFromStorage(
  path: string
): Promise<{ success: boolean; error: null } | { success: false; error: string }> {
  try {
    const supabase = await createClient();

    const { error } = await supabase.storage
      .from(TASTING_IMAGES_BUCKET)
      .remove([path]);

    if (error) {
      console.error("Storage delete error:", error);
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    console.error("Delete error:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export function getPublicUrl(path: string): string {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  return `${supabaseUrl}/storage/v1/object/public/${TASTING_IMAGES_BUCKET}/${path}`;
}
