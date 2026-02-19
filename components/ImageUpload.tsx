"use client";

import { useState, useRef, type DragEvent, type ChangeEvent } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, X } from "lucide-react";

type ImageUploadProps = {
  onImageSelect: (imageData: string) => void;
  onImageRemove?: () => void;
  currentImage?: string;
  label?: string;
  accept?: string;
  className?: string;
};

export default function ImageUpload({
  onImageSelect,
  onImageRemove,
  currentImage,
  label = "Upload Image",
  accept = "image/*",
  className = "",
}: ImageUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      handleFile(files[0]);
    }
  };

  const handleFile = (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      onImageSelect(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  const handleRemove = () => {
    if (onImageRemove) {
      onImageRemove();
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className={className}>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        onChange={handleFileInput}
        className="hidden"
      />

      {currentImage ? (
        <Card className="relative overflow-hidden">
          <div className="relative aspect-video bg-muted">
            <img
              src={currentImage}
              alt="Uploaded"
              className="object-contain w-full h-full"
            />
          </div>
          <Button
            variant="destructive"
            size="sm"
            className="absolute top-2 right-2"
            onClick={handleRemove}
          >
            <X className="w-4 h-4" />
          </Button>
        </Card>
      ) : (
        <Card
          className={`border-2 border-dashed cursor-pointer transition-colors ${
            isDragging
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25 hover:border-primary/50"
          }`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleClick}
        >
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <Upload className="w-12 h-12 mb-4 text-muted-foreground" />
            <p className="text-sm font-medium mb-1">{label}</p>
            <p className="text-xs text-muted-foreground">
              Drag and drop or click to browse
            </p>
          </div>
        </Card>
      )}
    </div>
  );
}
