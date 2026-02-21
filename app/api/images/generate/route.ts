import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { SAKE_IMAGES_BUCKET } from "@/lib/supabase/storage";

type ImageType = "bottle_art" | "group_transform" | "profile_pic" | "rank_portrait";
type GeminiResponsePart = {
  text?: string;
  inlineData?: {
    data?: string;
    mimeType?: string;
  };
  inline_data?: {
    data?: string;
    mime_type?: string;
    mimeType?: string;
  };
};

const GEMINI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent";
const SUPABASE_STORAGE_PATH_PREFIX = "/storage/v1/object/";

export const maxDuration = 300;

const BASE_STYLE_PREFIX = `Pixel art, cyberpunk Edo period fusion, neon glow on traditional Japanese elements, dark background with digital rain and glitch effects, 8-bit meets vaporwave, cherry blossom glitch particles, neon kanji accents, cyan and magenta color palette`;

const RANK_SCENES: Record<string, string> = {
  murabito: `humble rice farmer in a neon-lit village, simple clothes with faint circuit patterns, lantern glow, rain puddles reflecting neon signs`,
  ashigaru: `foot soldier with bamboo spear and light cyber-armor, training grounds with holographic targets, green neon accents`,
  ronin: `lone wandering swordsman in rain, tattered cloak with glowing seams, neon-tinted puddle reflections, misty cyberpunk alley`,
  samurai: `full cyber-armored samurai warrior, holographic katana drawn, cherry blossom glitch storm, castle silhouette with neon windows`,
  daimyo: `noble lord in ornate robes with circuit-thread embroidery, seated in grand hall with holographic maps, gold and cyan neon`,
  shogun: `commanding warlord in mech-enhanced yoroi armor, war room with floating tactical displays, red and cyan neon, imposing presence`,
  tenno: `divine emperor figure on golden throne, radiant with holographic divine light, floating neon kanji orbit, ultimate power, purple and gold neon`,
};

const VARIATION_WEATHER = [
  "heavy rain with neon reflections",
  "light snow with pixel flakes",
  "thick fog with cyan glow bleeding through",
  "clear night with pixel stars and a glitch moon",
  "storm with lightning illuminating the scene",
  "sakura petal storm (glitched)",
];

const VARIATION_LIGHTING = [
  "single neon sign casting hard shadows",
  "dual-tone lighting (cyan left, magenta right)",
  "backlit silhouette with rim glow",
  "overhead fluorescent flicker",
  "fire/lantern light mixed with neon",
  "holographic light scatter",
];

const VARIATION_DETAILS = [
  "pixel birds/cranes in the background",
  "floating kanji characters",
  "holographic wanted posters",
  "steam rising from a ramen stand",
  "a pixel cat sitting nearby",
  "sake bottles lined up on a shelf",
  "glitch artifacts at the edges",
];

const getRandomVariations = (count: number = 3): string => {
  const allVariations = [
    ...VARIATION_WEATHER,
    ...VARIATION_LIGHTING,
    ...VARIATION_DETAILS,
  ];
  
  const shuffled = allVariations.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).join(", ");
};

const PROMPTS = {
  bottle_art: `${BASE_STYLE_PREFIX}, sake bottle portrait, dramatic lighting, the bottle rendered as a glowing artifact with neon label, circuit-pattern condensation, cyberpunk bar counter setting, ${getRandomVariations()}. Portrait orientation, 3:4 aspect ratio, vertical composition`,

  group_transform: `${BASE_STYLE_PREFIX}, group portrait reimagined as cyberpunk Edo warriors, each person in rank-appropriate cyber-armor, neon dojo or izakaya setting, sake cups glowing with neon liquid, team portrait composition, ${getRandomVariations()}. Landscape orientation, 16:9 aspect ratio, wide composition`,
};

const getProfilePicPrompt = (rankKey: string): string => {
  const rankScene = RANK_SCENES[rankKey] || RANK_SCENES.murabito;
  return `${BASE_STYLE_PREFIX}, ${rankScene}, ${getRandomVariations()}. Portrait orientation, 3:4 aspect ratio, vertical composition, centered character`;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getGeneratedImageFromGemini = (
  geminiData: unknown
): { data: string; mimeType: string } | null => {
  if (!isRecord(geminiData)) return null;

  const candidates = Array.isArray(geminiData.candidates)
    ? geminiData.candidates
    : [];

  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    const content = candidate.content;
    if (!isRecord(content)) continue;
    const parts = Array.isArray(content.parts) ? content.parts : [];

    for (const rawPart of parts) {
      if (!isRecord(rawPart)) continue;

      const part = rawPart as GeminiResponsePart;
      const inlineData = isRecord(part.inlineData)
        ? part.inlineData
        : isRecord(part.inline_data)
          ? part.inline_data
          : null;

      if (!inlineData || typeof inlineData.data !== "string") continue;

      const mimeTypeFromSnakeCase =
        "mime_type" in inlineData && typeof inlineData.mime_type === "string"
          ? inlineData.mime_type
          : undefined;

      const mimeTypeFromInlineData =
        inlineData.mimeType ||
        mimeTypeFromSnakeCase ||
        "image/jpeg";

      const cleanedData = inlineData.data.replace(/^data:[^;]+;base64,/, "");
      return { data: cleanedData, mimeType: mimeTypeFromInlineData };
    }
  }

  return null;
};

const getFileExtensionForMimeType = (mimeType: string): string => {
  if (mimeType.includes("png")) return "png";
  if (mimeType.includes("webp")) return "webp";
  if (mimeType.includes("gif")) return "gif";
  return "jpg";
};

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : "Unknown error";

const getSupabaseUrlFromEnv = (): string | null =>
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || null;

const parseUrl = (value: string): URL | null => {
  try {
    return new URL(value);
  } catch {
    return null;
  }
};

const getSupabaseStorageHostFallbackUrl = (sourceUrl: string): string | null => {
  const source = parseUrl(sourceUrl);
  const configuredSupabaseUrl = getSupabaseUrlFromEnv();
  const configured = configuredSupabaseUrl ? parseUrl(configuredSupabaseUrl) : null;

  if (!source || !configured) return null;
  if (!source.hostname.endsWith(".supabase.co")) return null;
  if (source.hostname === configured.hostname) return null;
  if (!source.pathname.startsWith(SUPABASE_STORAGE_PATH_PREFIX)) return null;

  return `${configured.origin}${source.pathname}${source.search}`;
};

const getFetchErrorCode = (error: unknown): string | null => {
  if (!(error instanceof Error) || !("cause" in error)) return null;
  const cause = (error as Error & { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object" || !("code" in cause)) return null;
  const code = (cause as { code?: unknown }).code;
  return typeof code === "string" ? code : null;
};

const getFetchErrorHostname = (error: unknown): string | null => {
  if (!(error instanceof Error) || !("cause" in error)) return null;
  const cause = (error as Error & { cause?: unknown }).cause;
  if (!cause || typeof cause !== "object" || !("hostname" in cause)) return null;
  const hostname = (cause as { hostname?: unknown }).hostname;
  return typeof hostname === "string" ? hostname : null;
};

const fetchSourceImage = async (
  sourceUrl: string
): Promise<{ response: Response; resolvedUrl: string }> => {
  try {
    const response = await fetch(sourceUrl);
    return { response, resolvedUrl: sourceUrl };
  } catch (error) {
    const fallbackUrl = getSupabaseStorageHostFallbackUrl(sourceUrl);
    if (!fallbackUrl) throw error;

    const errorCode = getFetchErrorCode(error);
    const failedHostname = getFetchErrorHostname(error);
    console.warn("Source image fetch failed, retrying with configured Supabase host", {
      sourceUrl,
      fallbackUrl,
      errorCode,
      failedHostname,
    });

    const fallbackResponse = await fetch(fallbackUrl);
    return { response: fallbackResponse, resolvedUrl: fallbackUrl };
  }
};

export async function POST(request: Request) {
  try {
    const { imageUrl, type, tastingId, sakeId, tasterId, rankKey } = await request.json();

    if (!type) {
      return NextResponse.json(
        { error: "Missing required field: type" },
        { status: 400 }
      );
    }

    const imageType = type as ImageType;
    
    if ((imageType === "profile_pic" || imageType === "rank_portrait") && !tasterId) {
      return NextResponse.json(
        { error: "tasterId is required for profile_pic and rank_portrait types" },
        { status: 400 }
      );
    }

    if (imageType === "group_transform" && !tastingId) {
      return NextResponse.json(
        { error: "tastingId is required for group_transform type" },
        { status: 400 }
      );
    }

    if (imageType === "bottle_art" && !sakeId && !tastingId) {
      return NextResponse.json(
        { error: "sakeId or tastingId is required for bottle_art type" },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GOOGLE_API_KEY not configured" },
        { status: 500 }
      );
    }

    let prompt: string;
    if (imageType === "profile_pic" || imageType === "rank_portrait") {
      const resolvedRankKey = rankKey || "murabito";
      prompt = getProfilePicPrompt(resolvedRankKey);
    } else {
      prompt = PROMPTS[imageType];
      if (!prompt) {
        return NextResponse.json(
          { error: "Invalid image type. Must be bottle_art, group_transform, profile_pic, or rank_portrait" },
          { status: 400 }
        );
      }
    }

    let imageData: string | null = null;
    let mimeType: string = "image/jpeg";
    
    if (imageUrl) {
      if (imageUrl.startsWith("data:")) {
        imageData = imageUrl.split(",")[1];
        const mimeMatch = imageUrl.match(/^data:([^;]+);/);
        if (mimeMatch) {
          mimeType = mimeMatch[1];
        }
      } else {
        let sourceImageResponse: Response;
        let resolvedImageUrl = imageUrl;
        try {
          const fetchResult = await fetchSourceImage(imageUrl);
          sourceImageResponse = fetchResult.response;
          resolvedImageUrl = fetchResult.resolvedUrl;
        } catch (error) {
          const errorCode = getFetchErrorCode(error);
          const failedHostname = getFetchErrorHostname(error);

          console.error("Failed to fetch source image", {
            imageUrl,
            errorCode,
            failedHostname,
            error: getErrorMessage(error),
          });

          const dnsErrorHint =
            errorCode === "ENOTFOUND"
              ? " The source hostname could not be resolved. If this image URL points to an old Supabase project, re-upload the image or update the URL."
              : "";

          return NextResponse.json(
            {
              error: `Failed to fetch source image URL.${dnsErrorHint}`,
              details: getErrorMessage(error),
            },
            { status: 400 }
          );
        }

        if (!sourceImageResponse.ok) {
          return NextResponse.json(
            {
              error: `Failed to fetch image from URL: ${sourceImageResponse.statusText}`,
              status: sourceImageResponse.status,
              resolvedImageUrl,
            },
            { status: 400 }
          );
        }

        const contentType = sourceImageResponse.headers.get("content-type");
        if (contentType) {
          mimeType = contentType;
        }

        const blob = await sourceImageResponse.blob();
        const buffer = await blob.arrayBuffer();
        
        const sizeInMB = buffer.byteLength / (1024 * 1024);
        if (sizeInMB > 20) {
          return NextResponse.json(
            { error: `Image too large: ${sizeInMB.toFixed(2)}MB. Maximum size is 20MB.` },
            { status: 400 }
          );
        }

        imageData = Buffer.from(buffer).toString("base64");
      }
    }

    const parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> = [
      { text: prompt },
    ];

    if (imageData) {
      parts.push({
        inlineData: {
          mimeType,
          data: imageData,
        },
      });
    }

    const requestBody = {
      contents: [
        {
          parts,
        },
      ],
      generationConfig: {
        responseModalities: ["TEXT", "IMAGE"],
        temperature: 1.0,
      },
    };

    const geminiResponse = await fetch(`${GEMINI_API_ENDPOINT}?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", {
        status: geminiResponse.status,
        statusText: geminiResponse.statusText,
        headers: Object.fromEntries(geminiResponse.headers.entries()),
        body: errorText,
      });
      return NextResponse.json(
        { error: "Failed to generate image from Gemini API", details: errorText },
        { status: geminiResponse.status }
      );
    }

    const geminiData: unknown = await geminiResponse.json();
    const responseRecord = isRecord(geminiData) ? geminiData : {};
    const candidates = Array.isArray(responseRecord.candidates)
      ? responseRecord.candidates
      : [];
    const firstCandidate = candidates[0];
    const firstCandidateContent = isRecord(firstCandidate) ? firstCandidate.content : null;
    const firstParts = isRecord(firstCandidateContent) && Array.isArray(firstCandidateContent.parts)
      ? firstCandidateContent.parts
      : [];
    
    console.log("Gemini API response received:", {
      hasCandidates: candidates.length > 0,
      candidatesCount: candidates.length,
      hasContent: !!firstCandidateContent,
      partsCount: firstParts.length,
    });

    const generatedImage = getGeneratedImageFromGemini(geminiData);
    const generatedImageData = generatedImage?.data || null;
    const generatedImageMimeType = generatedImage?.mimeType || "image/jpeg";

    if (!generatedImageData) {
      const firstPart = firstParts[0];
      const firstPartKeys = isRecord(firstPart) ? Object.keys(firstPart) : [];
      const textPartPreview = isRecord(firstPart) && typeof firstPart.text === "string"
        ? firstPart.text.substring(0, 200)
        : null;

      console.error("No image data in Gemini response:", {
        candidatesCount: candidates.length,
        firstPartKeys,
        textPartPreview,
        promptFeedback: responseRecord.promptFeedback ?? null,
      });
      return NextResponse.json(
        { error: "No image generated by Gemini", details: geminiData },
        { status: 500 }
      );
    }

    const base64Image = `data:${generatedImageMimeType};base64,${generatedImageData}`;

    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const extension = getFileExtensionForMimeType(generatedImageMimeType);
    const fileName = `${imageType}-${timestamp}-${randomStr}.${extension}`;

    const blob = await fetch(base64Image).then((r) => r.blob());
    const supabase = createServiceClient();
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(SAKE_IMAGES_BUCKET)
      .upload(fileName, blob, {
        contentType: generatedImageMimeType,
        cacheControl: "3600",
      });

    if (uploadError || !uploadData) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: "Failed to upload image to storage", details: uploadError },
        { status: 500 }
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from(SAKE_IMAGES_BUCKET).getPublicUrl(uploadData.path);

    try {
      if ((imageType === "profile_pic" || imageType === "rank_portrait") && tasterId) {
        const { data: tasterRecord, error: tasterUpdateError } = await supabase
          .from("tasters")
          .update({
            ai_profile_image_url: publicUrl,
            rank_at_generation: rankKey || "murabito",
          })
          .eq("id", tasterId)
          .select()
          .single();

        if (tasterUpdateError) {
          console.error("Taster update error:", tasterUpdateError);
          return NextResponse.json(
            { generatedImageUrl: publicUrl, warning: "Image generated but taster profile not updated" }
          );
        }

        return NextResponse.json({
          generatedImageUrl: publicUrl,
          tasterRecord,
        });
      }

      if (imageType === "bottle_art") {
        const warnings: string[] = [];
        let resolvedSakeId = typeof sakeId === "string" && sakeId.length > 0 ? sakeId : null;

        if (!resolvedSakeId && tastingId) {
          const { data: tasting, error: tastingLookupError } = await supabase
            .from("tastings")
            .select("sake_id")
            .eq("id", tastingId)
            .maybeSingle();

          if (tastingLookupError) {
            console.error("Tasting lookup error while resolving bottle_art sake:", tastingLookupError);
            warnings.push("Image generated, but could not resolve sake from tasting.");
          } else if (tasting?.sake_id) {
            resolvedSakeId = tasting.sake_id;
          }
        }

        let sakeRecord: unknown = null;
        if (resolvedSakeId) {
          const { data: updatedSake, error: sakeUpdateError } = await supabase
            .from("sakes")
            .update({ ai_bottle_image_url: publicUrl })
            .eq("id", resolvedSakeId)
            .select()
            .maybeSingle();

          if (sakeUpdateError) {
            console.error("Sake update error:", sakeUpdateError);
            warnings.push("Image generated, but sake record was not updated.");
          } else {
            sakeRecord = updatedSake;
          }
        } else {
          warnings.push("Image generated, but no sake ID was available for persistence.");
        }

        let imageRecord: unknown = null;
        if (tastingId) {
          const { data: tastingImageRecord, error: imageRecordError } = await supabase
            .from("tasting_images")
            .insert({
              tasting_id: tastingId,
              original_image_url: imageUrl && !imageUrl.startsWith("data:") ? imageUrl : null,
              generated_image_url: publicUrl,
              image_type: imageType,
              prompt_used: prompt,
            })
            .select()
            .single();

          if (imageRecordError) {
            console.error("Database insert error:", imageRecordError);
            warnings.push("Image generated, but tasting_images record was not saved.");
          } else {
            imageRecord = tastingImageRecord;
          }
        }

        return NextResponse.json({
          generatedImageUrl: publicUrl,
          sakeRecord,
          imageRecord,
          warning: warnings.length > 0 ? warnings.join(" ") : undefined,
        });
      }

      const { data: imageRecord, error: dbError } = await supabase
        .from("tasting_images")
        .insert({
          tasting_id: tastingId,
          original_image_url: imageUrl && !imageUrl.startsWith("data:") ? imageUrl : null,
          generated_image_url: publicUrl,
          image_type: imageType,
          prompt_used: prompt,
        })
        .select()
        .single();

      if (dbError) {
        console.error("Database insert error:", dbError);
        return NextResponse.json(
          { generatedImageUrl: publicUrl, warning: "Image generated but not saved to database" }
        );
      }

      return NextResponse.json({
        generatedImageUrl: publicUrl,
        imageRecord,
      });
    } catch (error) {
      console.error("Database persistence exception:", {
        error: getErrorMessage(error),
        errorCode: getFetchErrorCode(error),
      });
      return NextResponse.json({
        generatedImageUrl: publicUrl,
        warning: "Image generated but database persistence failed.",
      });
    }
  } catch (error) {
    console.error("Error in image generation:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
