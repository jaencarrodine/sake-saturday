"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type GalleryImage = {
  id: string;
  url: string;
  type: "original" | "bottle_art" | "group_transform";
  isAiGenerated?: boolean;
};

type ImageGalleryProps = {
  images: GalleryImage[];
  className?: string;
};

export default function ImageGallery({ images, className = "" }: ImageGalleryProps) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const openLightbox = (index: number) => {
    setSelectedIndex(index);
  };

  const closeLightbox = () => {
    setSelectedIndex(null);
  };

  const goToPrevious = () => {
    if (selectedIndex !== null && selectedIndex > 0) {
      setSelectedIndex(selectedIndex - 1);
    }
  };

  const goToNext = () => {
    if (selectedIndex !== null && selectedIndex < images.length - 1) {
      setSelectedIndex(selectedIndex + 1);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "bottle_art":
        return "Ukiyo-e Bottle Art";
      case "group_transform":
        return "Japanese Scene";
      case "original":
        return "Original Photo";
      default:
        return "Photo";
    }
  };

  if (images.length === 0) {
    return null;
  }

  return (
    <>
      <div className={`grid grid-cols-2 md:grid-cols-3 gap-4 ${className}`}>
        {images.map((image, index) => (
          <Card
            key={image.id}
            className="relative overflow-hidden cursor-pointer group border-primary hover:border-primary-highlight transition-colors"
            onClick={() => openLightbox(index)}
          >
            <div className="aspect-square bg-black relative">
              <img
                src={image.url}
                alt={getTypeLabel(image.type)}
                className="object-cover w-full h-full transition-transform group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
            </div>
            <div className="absolute top-2 left-2">
              <Badge variant="secondary" className="bg-primary text-white">
                {image.isAiGenerated && "✨ "}
                {getTypeLabel(image.type)}
              </Badge>
            </div>
          </Card>
        ))}
      </div>

      <Dialog open={selectedIndex !== null} onOpenChange={closeLightbox}>
        <DialogContent className="max-w-[90vw] max-h-[90vh] p-0 bg-black border-primary">
          {selectedIndex !== null && (
            <div className="relative">
              <div className="flex items-center justify-center min-h-[400px] max-h-[80vh] bg-black">
                <img
                  src={images[selectedIndex].url}
                  alt={getTypeLabel(images[selectedIndex].type)}
                  className="max-w-full max-h-[80vh] object-contain"
                />
              </div>

              <div className="absolute top-4 right-4 flex gap-2">
                <Badge variant="secondary" className="bg-primary text-white">
                  {images[selectedIndex].isAiGenerated && "✨ "}
                  {getTypeLabel(images[selectedIndex].type)}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={closeLightbox}
                  className="bg-black/50 hover:bg-black/70 text-white border-primary"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {selectedIndex > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goToPrevious}
                  className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white border-primary"
                >
                  <ChevronLeft className="w-6 h-6" />
                </Button>
              )}

              {selectedIndex < images.length - 1 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={goToNext}
                  className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white border-primary"
                >
                  <ChevronRight className="w-6 h-6" />
                </Button>
              )}

              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm border border-primary">
                {selectedIndex + 1} / {images.length}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
