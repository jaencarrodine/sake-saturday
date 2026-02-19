"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useRouter } from "next/navigation";
import ImageUpload from "@/components/ImageUpload";
import GenerateArtButton from "@/components/GenerateArtButton";

type SakeFormData = {
  name: string;
  brewery: string;
  prefecture: string;
  grade: string;
  type: string;
  alc_pct: string;
  smv: string;
  rice: string;
  polishing_ratio: string;
  opacity: string;
  profile: string;
  serving_temp: string;
};

type TasterData = {
  id?: string;
  name: string;
  email: string;
  score: number;
  notes: string;
};

type AdditionalImage = {
  id: string;
  originalUrl: string;
  generatedUrl?: string;
  type: "bottle_art" | "group_transform";
};

export default function NewTasting() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [frontImage, setFrontImage] = useState<string>("");
  const [backImage, setBackImage] = useState<string>("");
  const [frontImageGenerated, setFrontImageGenerated] = useState<string>("");
  const [additionalImages, setAdditionalImages] = useState<AdditionalImage[]>([]);
  const [sakeMode, setSakeMode] = useState<"new" | "existing">("new");
  const [selectedSakeId, setSelectedSakeId] = useState<string>("");
  const [sakeData, setSakeData] = useState<SakeFormData>({
    name: "",
    brewery: "",
    prefecture: "",
    grade: "",
    type: "",
    alc_pct: "",
    smv: "",
    rice: "",
    polishing_ratio: "",
    opacity: "",
    profile: "",
    serving_temp: "",
  });
  const [myScore, setMyScore] = useState(0);
  const [myNotes, setMyNotes] = useState("");
  const [tasters, setTasters] = useState<TasterData[]>([]);
  const [currentTaster, setCurrentTaster] = useState<TasterData>({
    name: "",
    email: "",
    score: 0,
    notes: "",
  });
  const [location, setLocation] = useState("");
  const [tastingNotes, setTastingNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tempTastingId, setTempTastingId] = useState<string>("");

  const handleImageUpload = (type: "front" | "back", e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === "front") {
          setFrontImage(reader.result as string);
        } else {
          setBackImage(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const addTaster = () => {
    if (currentTaster.name) {
      setTasters([...tasters, { ...currentTaster }]);
      setCurrentTaster({ name: "", email: "", score: 0, notes: "" });
    }
  };

  const removeTaster = (index: number) => {
    setTasters(tasters.filter((_, i) => i !== index));
  };

  const addAdditionalImage = (imageData: string, type: "bottle_art" | "group_transform") => {
    const newImage: AdditionalImage = {
      id: `img-${Date.now()}-${Math.random()}`,
      originalUrl: imageData,
      type,
    };
    setAdditionalImages([...additionalImages, newImage]);
  };

  const removeAdditionalImage = (id: string) => {
    setAdditionalImages(additionalImages.filter((img) => img.id !== id));
  };

  const handleImageGenerated = (imageId: string, generatedUrl: string) => {
    setAdditionalImages(
      additionalImages.map((img) =>
        img.id === imageId ? { ...img, generatedUrl } : img
      )
    );
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      // First, create or get the sake
      let sakeId = selectedSakeId;
      
      if (sakeMode === "new") {
        const sakeResponse = await fetch("/api/sakes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...sakeData,
            front_image_url: frontImage,
            back_image_url: backImage,
          }),
        });
        const sakeResult = await sakeResponse.json();
        sakeId = sakeResult.id;
      }

      // Create tasters (or get existing ones)
      const tasterIds = await Promise.all(
        tasters.map(async (taster) => {
          const response = await fetch("/api/tasters", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: taster.name,
              email: taster.email,
            }),
          });
          const result = await response.json();
          return { id: result.id, score: taster.score, notes: taster.notes };
        })
      );

      // Create the tasting
      const tastingResponse = await fetch("/api/tastings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sake_id: sakeId,
          location_name: location,
          notes: tastingNotes,
          my_score: myScore,
          my_notes: myNotes,
          tasters: tasterIds,
        }),
      });

      const tastingResult = await tastingResponse.json();
      
      if (tastingResult.id) {
        router.push(`/tasting/${tastingResult.id}`);
      }
    } catch (error) {
      console.error("Error submitting tasting:", error);
      alert("Error creating tasting. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">New Tasting</h1>
        <p className="text-muted-foreground">Create a new sake tasting experience</p>
      </div>

      {/* Progress indicator */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full ${
                s <= step ? "bg-primary" : "bg-muted"
              }`}
            />
          ))}
        </div>
        <p className="text-sm text-muted-foreground">
          Step {step} of 6
        </p>
      </div>

      {/* Step 1: Upload Images */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Upload Sake Bottle Images</CardTitle>
            <CardDescription>
              Upload photos of the front and back of the sake bottle
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label htmlFor="front-image">Front Image</Label>
              <Input
                id="front-image"
                type="file"
                accept="image/*"
                onChange={(e) => handleImageUpload("front", e)}
                className="mt-2"
              />
              {frontImage && (
                <div className="mt-4 space-y-4">
                  <div className="relative w-full h-64 bg-muted rounded-md overflow-hidden">
                    <img src={frontImage} alt="Front" className="object-contain w-full h-full" />
                  </div>
                  {frontImageGenerated && (
                    <div className="relative w-full h-64 bg-muted rounded-md overflow-hidden border-2 border-primary">
                      <Badge className="absolute top-2 left-2">✨ Ukiyo-e Style</Badge>
                      <img src={frontImageGenerated} alt="AI Generated" className="object-contain w-full h-full" />
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="back-image">Back Image</Label>
              <Input
                id="back-image"
                type="file"
                accept="image/*"
                onChange={(e) => handleImageUpload("back", e)}
                className="mt-2"
              />
              {backImage && (
                <div className="mt-4 relative w-full h-64 bg-muted rounded-md overflow-hidden">
                  <img src={backImage} alt="Back" className="object-contain w-full h-full" />
                </div>
              )}
            </div>
            <Button onClick={() => setStep(2)} className="w-full">
              Next: Sake Details
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Sake Details */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Sake Details</CardTitle>
            <CardDescription>
              Enter information about the sake you're tasting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <Tabs value={sakeMode} onValueChange={(v) => setSakeMode(v as "new" | "existing")}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="new">New Sake</TabsTrigger>
                <TabsTrigger value="existing">Select Existing</TabsTrigger>
              </TabsList>
              <TabsContent value="new" className="space-y-4 mt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="col-span-2">
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={sakeData.name}
                      onChange={(e) => setSakeData({ ...sakeData, name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="brewery">Brewery</Label>
                    <Input
                      id="brewery"
                      value={sakeData.brewery}
                      onChange={(e) => setSakeData({ ...sakeData, brewery: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="prefecture">Prefecture</Label>
                    <Input
                      id="prefecture"
                      value={sakeData.prefecture}
                      onChange={(e) => setSakeData({ ...sakeData, prefecture: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="grade">Grade</Label>
                    <Input
                      id="grade"
                      value={sakeData.grade}
                      onChange={(e) => setSakeData({ ...sakeData, grade: e.target.value })}
                      placeholder="e.g., Junmai, Ginjo"
                    />
                  </div>
                  <div>
                    <Label htmlFor="type">Type</Label>
                    <Input
                      id="type"
                      value={sakeData.type}
                      onChange={(e) => setSakeData({ ...sakeData, type: e.target.value })}
                      placeholder="e.g., Dry, Sweet"
                    />
                  </div>
                  <div>
                    <Label htmlFor="alc">Alcohol %</Label>
                    <Input
                      id="alc"
                      type="number"
                      step="0.1"
                      value={sakeData.alc_pct}
                      onChange={(e) => setSakeData({ ...sakeData, alc_pct: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="smv">SMV</Label>
                    <Input
                      id="smv"
                      type="number"
                      step="0.1"
                      value={sakeData.smv}
                      onChange={(e) => setSakeData({ ...sakeData, smv: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="rice">Rice</Label>
                    <Input
                      id="rice"
                      value={sakeData.rice}
                      onChange={(e) => setSakeData({ ...sakeData, rice: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="polishing">Polishing Ratio %</Label>
                    <Input
                      id="polishing"
                      type="number"
                      step="0.1"
                      value={sakeData.polishing_ratio}
                      onChange={(e) => setSakeData({ ...sakeData, polishing_ratio: e.target.value })}
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="profile">Profile</Label>
                    <Textarea
                      id="profile"
                      value={sakeData.profile}
                      onChange={(e) => setSakeData({ ...sakeData, profile: e.target.value })}
                      placeholder="Tasting notes, characteristics..."
                    />
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="existing">
                <p className="text-sm text-muted-foreground">
                  Select existing sake feature coming soon...
                </p>
              </TabsContent>
            </Tabs>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                Back
              </Button>
              <Button 
                onClick={() => setStep(3)} 
                className="flex-1"
                disabled={sakeMode === "new" && !sakeData.name}
              >
                Next: Your Rating
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: My Score */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>Your Rating</CardTitle>
            <CardDescription>
              Rate this sake and add your tasting notes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label>Your Score (1-5 stars)</Label>
              <div className="flex gap-2 mt-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setMyScore(star)}
                    className={`text-4xl transition-colors ${
                      star <= myScore ? "text-yellow-500" : "text-muted"
                    }`}
                  >
                    ★
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="my-notes">Your Notes</Label>
              <Textarea
                id="my-notes"
                value={myNotes}
                onChange={(e) => setMyNotes(e.target.value)}
                placeholder="What did you think? Flavor notes, pairing suggestions..."
                className="mt-2"
                rows={4}
              />
            </div>
            <div>
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="Where did you taste this sake?"
                className="mt-2"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(2)} className="flex-1">
                Back
              </Button>
              <Button onClick={() => setStep(4)} className="flex-1" disabled={myScore === 0}>
                Next: Add Tasters
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 4: Add Tasters */}
      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle>Add Tasters</CardTitle>
            <CardDescription>
              Who else is tasting this sake with you?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="taster-name">Taster Name</Label>
                <Input
                  id="taster-name"
                  value={currentTaster.name}
                  onChange={(e) => setCurrentTaster({ ...currentTaster, name: e.target.value })}
                  placeholder="Enter name"
                />
              </div>
              <div>
                <Label htmlFor="taster-email">Email (optional)</Label>
                <Input
                  id="taster-email"
                  type="email"
                  value={currentTaster.email}
                  onChange={(e) => setCurrentTaster({ ...currentTaster, email: e.target.value })}
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <Label>Their Score (1-5 stars)</Label>
                <div className="flex gap-2 mt-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setCurrentTaster({ ...currentTaster, score: star })}
                      className={`text-4xl transition-colors ${
                        star <= currentTaster.score ? "text-yellow-500" : "text-muted"
                      }`}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="taster-notes">Their Notes</Label>
                <Textarea
                  id="taster-notes"
                  value={currentTaster.notes}
                  onChange={(e) => setCurrentTaster({ ...currentTaster, notes: e.target.value })}
                  placeholder="Their tasting notes..."
                  rows={3}
                />
              </div>
              <Button
                onClick={addTaster}
                disabled={!currentTaster.name || currentTaster.score === 0}
                className="w-full"
              >
                Add Taster
              </Button>
            </div>

            {tasters.length > 0 && (
              <div className="space-y-2">
                <Label>Added Tasters ({tasters.length})</Label>
                {tasters.map((taster, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 border rounded-lg"
                  >
                    <div>
                      <p className="font-medium">{taster.name}</p>
                      <p className="text-sm text-muted-foreground">
                        Score: {taster.score}/5 ★
                      </p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => removeTaster(index)}
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(3)} className="flex-1">
                Back
              </Button>
              <Button onClick={() => setStep(5)} className="flex-1">
                Next: Additional Images
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 5: Additional Images */}
      {step === 5 && (
        <Card>
          <CardHeader>
            <CardTitle>Additional Images (Optional)</CardTitle>
            <CardDescription>
              Add group photos or additional bottle shots. Generate AI-transformed images!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-4">
              <div>
                <Label className="mb-2 block">Upload Group Photo</Label>
                <ImageUpload
                  onImageSelect={(imageData) => addAdditionalImage(imageData, "group_transform")}
                  label="Upload a group photo to transform"
                />
              </div>

              <div>
                <Label className="mb-2 block">Upload Additional Bottle Photo</Label>
                <ImageUpload
                  onImageSelect={(imageData) => addAdditionalImage(imageData, "bottle_art")}
                  label="Upload another bottle photo for ukiyo-e art"
                />
              </div>
            </div>

            {additionalImages.length > 0 && (
              <div className="space-y-4">
                <Label>Uploaded Images ({additionalImages.length})</Label>
                {additionalImages.map((img) => (
                  <div key={img.id} className="border rounded-lg p-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline">
                        {img.type === "bottle_art" ? "Bottle Photo" : "Group Photo"}
                      </Badge>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => removeAdditionalImage(img.id)}
                      >
                        Remove
                      </Button>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs text-muted-foreground mb-2">Original</p>
                        <div className="relative aspect-square bg-muted rounded-md overflow-hidden">
                          <img
                            src={img.originalUrl}
                            alt="Original"
                            className="object-cover w-full h-full"
                          />
                        </div>
                      </div>
                      {img.generatedUrl ? (
                        <div>
                          <p className="text-xs text-muted-foreground mb-2">✨ AI Generated</p>
                          <div className="relative aspect-square bg-muted rounded-md overflow-hidden border-2 border-primary">
                            <img
                              src={img.generatedUrl}
                              alt="AI Generated"
                              className="object-cover w-full h-full"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center">
                          {tempTastingId ? (
                            <GenerateArtButton
                              imageUrl={img.originalUrl}
                              imageType={img.type}
                              tastingId={tempTastingId}
                              onGenerated={(url) => handleImageGenerated(img.id, url)}
                              onError={(error) => alert(error)}
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground text-center px-4">
                              Complete tasting submission to generate AI art
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(4)} className="flex-1">
                Back
              </Button>
              <Button onClick={() => setStep(6)} className="flex-1">
                Next: Review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 6: Review and Submit */}
      {step === 6 && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Submit</CardTitle>
            <CardDescription>
              Review your tasting details before submitting
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">Sake Details</h3>
              <div className="space-y-1 text-sm">
                <p><span className="text-muted-foreground">Name:</span> {sakeData.name}</p>
                {sakeData.brewery && <p><span className="text-muted-foreground">Brewery:</span> {sakeData.brewery}</p>}
                {sakeData.type && <p><span className="text-muted-foreground">Type:</span> {sakeData.type}</p>}
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Your Rating</h3>
              <div className="flex items-center gap-2">
                <span className="text-2xl">{myScore} / 5</span>
                <span className="text-yellow-500">★</span>
              </div>
              {myNotes && <p className="text-sm mt-2">{myNotes}</p>}
            </div>

            {tasters.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2">Tasters ({tasters.length})</h3>
                <div className="space-y-2">
                  {tasters.map((taster, index) => (
                    <div key={index} className="text-sm">
                      <p className="font-medium">{taster.name} - {taster.score}/5 ★</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(5)} className="flex-1">
                Back
              </Button>
              <Button
                onClick={handleSubmit}
                className="flex-1"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Creating..." : "Create Tasting"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
