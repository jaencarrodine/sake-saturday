"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";

type GenerateArtButtonProps = {
  imageUrl: string;
  imageType: "bottle_art" | "group_transform";
  tastingId: string;
  onGenerated: (generatedImageUrl: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
};

export default function GenerateArtButton({
  imageUrl,
  imageType,
  tastingId,
  onGenerated,
  onError,
  disabled = false,
  className = "",
}: GenerateArtButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleGenerate = async () => {
    if (!imageUrl || !tastingId) {
      if (onError) {
        onError("Missing image or tasting ID");
      }
      return;
    }

    setIsGenerating(true);

    try {
      const response = await fetch("/api/images/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          imageUrl,
          type: imageType,
          tastingId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate image");
      }

      if (data.generatedImageUrl) {
        onGenerated(data.generatedImageUrl);
      } else {
        throw new Error("No generated image URL in response");
      }
    } catch (error) {
      console.error("Error generating image:", error);
      if (onError) {
        onError(error instanceof Error ? error.message : "Failed to generate image");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const buttonText = imageType === "bottle_art" 
    ? "Generate Ukiyo-e Bottle Art" 
    : "Transform to Japanese Scene";

  return (
    <Button
      onClick={handleGenerate}
      disabled={disabled || isGenerating}
      className={className}
      variant="secondary"
    >
      {isGenerating ? (
        <>
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          Generating...
        </>
      ) : (
        <>
          <Sparkles className="w-4 h-4 mr-2" />
          {buttonText}
        </>
      )}
    </Button>
  );
}
