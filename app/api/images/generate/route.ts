import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type ImageType = "bottle_art" | "group_transform" | "profile_pic" | "rank_portrait";

const GEMINI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent";

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
  bottle_art: `${BASE_STYLE_PREFIX}, sake bottle portrait, dramatic lighting, the bottle rendered as a glowing artifact with neon label, circuit-pattern condensation, cyberpunk bar counter setting, ${getRandomVariations()}`,

  group_transform: `${BASE_STYLE_PREFIX}, group portrait reimagined as cyberpunk Edo warriors, each person in rank-appropriate cyber-armor, neon dojo or izakaya setting, sake cups glowing with neon liquid, team portrait composition, ${getRandomVariations()}`,
};

const getProfilePicPrompt = (rankKey: string): string => {
  const rankScene = RANK_SCENES[rankKey] || RANK_SCENES.murabito;
  return `${BASE_STYLE_PREFIX}, ${rankScene}, ${getRandomVariations()}`;
};

export async function POST(request: Request) {
  try {
    const { imageUrl, type, tastingId, tasterId, rankKey } = await request.json();

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

    if ((imageType === "bottle_art" || imageType === "group_transform") && !tastingId) {
      return NextResponse.json(
        { error: "tastingId is required for bottle_art and group_transform types" },
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
        const response = await fetch(imageUrl);
        
        if (!response.ok) {
          return NextResponse.json(
            { error: `Failed to fetch image from URL: ${response.statusText}` },
            { status: 400 }
          );
        }

        const contentType = response.headers.get("content-type");
        if (contentType) {
          mimeType = contentType;
        }

        const blob = await response.blob();
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

    const parts: Array<{ text?: string; inline_data?: { mime_type: string; data: string } }> = [
      { text: prompt },
    ];

    if (imageData) {
      parts.push({
        inline_data: {
          mime_type: mimeType,
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

    const geminiData = await geminiResponse.json();
    
    console.log("Gemini API response received:", {
      hasCandidates: !!geminiData.candidates,
      candidatesCount: geminiData.candidates?.length || 0,
      hasContent: !!geminiData.candidates?.[0]?.content,
      partsCount: geminiData.candidates?.[0]?.content?.parts?.length || 0,
    });

    let generatedImageData: string | null = null;
    if (
      geminiData.candidates &&
      geminiData.candidates[0]?.content?.parts
    ) {
      for (const part of geminiData.candidates[0].content.parts) {
        if (part.inline_data?.data) {
          generatedImageData = part.inline_data.data;
          break;
        }
      }
    }

    if (!generatedImageData) {
      console.error("No image data in Gemini response:", {
        fullResponse: JSON.stringify(geminiData, null, 2),
        candidates: geminiData.candidates,
        promptFeedback: geminiData.promptFeedback,
      });
      return NextResponse.json(
        { error: "No image generated by Gemini", details: geminiData },
        { status: 500 }
      );
    }

    const base64Image = `data:image/jpeg;base64,${generatedImageData}`;

    const supabase = await createClient();
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 15);
    const fileName = `${imageType}-${timestamp}-${randomStr}.jpg`;

    const blob = await fetch(base64Image).then((r) => r.blob());
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("tasting-images")
      .upload(fileName, blob, {
        contentType: "image/jpeg",
        cacheControl: "3600",
      });

    if (uploadError || !uploadData) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { generatedImageUrl: base64Image, warning: "Could not upload to storage, returning base64" }
      );
    }

    const {
      data: { publicUrl },
    } = supabase.storage.from("tasting-images").getPublicUrl(uploadData.path);

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
    } else {
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
    }
  } catch (error) {
    console.error("Error in image generation:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
