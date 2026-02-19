import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Database } from "@/types/supabase/databaseTypes";

type Props = {
  params: Promise<{ id: string }>;
};

type SakeRow = Database["public"]["Tables"]["sakes"]["Row"];

export default async function SakePage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch sake details
  const { data: sake, error: sakeError } = await supabase
    .from("sakes")
    .select("*")
    .eq("id", id)
    .single();

  if (sakeError || !sake) {
    notFound();
  }

  const sakeRow = sake as SakeRow;

  // Fetch all tastings for this sake with scores
  const { data: tastings } = await supabase
    .from("tastings")
    .select(`
      *,
      tasting_scores (
        score,
        notes,
        tasters (
          name
        )
      )
    `)
    .eq("sake_id", id)
    .order("created_at", { ascending: false });

  // Fetch AI-generated bottle art from any tasting of this sake
  const tastingIds = tastings?.map((t: any) => t.id) || [];
  const { data: bottleArt } = await supabase
    .from("tasting_images")
    .select("*")
    .in("tasting_id", tastingIds)
    .eq("image_type", "bottle_art")
    .limit(1)
    .maybeSingle();
  
  const aiBottleArtUrl = bottleArt?.generated_image_url;

  // Calculate average score
  const allScores = tastings?.flatMap((t: any) => t.tasting_scores.map((s: any) => s.score)) || [];
  const avgScore = allScores.length > 0 
    ? (allScores.reduce((a: number, b: number) => a + b, 0) / allScores.length).toFixed(1)
    : "—";

  return (
    <div className="container py-8">
      <div className="max-w-4xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
          {/* Image Section */}
          <div className="md:col-span-1 space-y-4">
            {sakeRow.front_image_url ? (
              <div className="relative w-full aspect-[3/4] bg-muted rounded-lg overflow-hidden">
                <Image
                  src={sakeRow.front_image_url}
                  alt={sakeRow.name}
                  fill
                  className="object-cover"
                />
              </div>
            ) : (
              <div className="w-full aspect-[3/4] bg-muted rounded-lg flex items-center justify-center">
                <span className="text-6xl">🍶</span>
              </div>
            )}
            
            {aiBottleArtUrl && (
              <div className="relative w-full aspect-[3/4] bg-muted rounded-lg overflow-hidden border-2 border-primary">
                <Badge className="absolute top-2 left-2 z-10">✨ Ukiyo-e Art</Badge>
                <Image
                  src={aiBottleArtUrl}
                  alt={`${sakeRow.name} - AI Generated Art`}
                  fill
                  className="object-cover"
                />
              </div>
            )}
          </div>

          {/* Details Section */}
          <div className="md:col-span-2 space-y-6">
            <div>
              <h1 className="text-4xl font-bold mb-2">{sakeRow.name}</h1>
              {sakeRow.brewery && (
                <p className="text-xl text-muted-foreground">{sakeRow.brewery}</p>
              )}
            </div>

            {/* Average Score */}
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground mb-1">Average Score</p>
                    <div className="flex items-center gap-2">
                      <span className="text-4xl font-bold">{avgScore}</span>
                      <span className="text-2xl text-yellow-500">★</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-muted-foreground mb-1">Total Tastings</p>
                    <p className="text-2xl font-semibold">{tastings?.length || 0}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Sake Details */}
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {sakeRow.prefecture && (
                    <div>
                      <p className="text-sm text-muted-foreground">Prefecture</p>
                      <p className="font-medium">{sakeRow.prefecture}</p>
                    </div>
                  )}
                  {sakeRow.grade && (
                    <div>
                      <p className="text-sm text-muted-foreground">Grade</p>
                      <p className="font-medium">{sakeRow.grade}</p>
                    </div>
                  )}
                  {sakeRow.type && (
                    <div>
                      <p className="text-sm text-muted-foreground">Type</p>
                      <Badge>{sakeRow.type}</Badge>
                    </div>
                  )}
                  {sakeRow.alc_pct && (
                    <div>
                      <p className="text-sm text-muted-foreground">Alcohol</p>
                      <p className="font-medium">{sakeRow.alc_pct}%</p>
                    </div>
                  )}
                  {sakeRow.smv !== null && (
                    <div>
                      <p className="text-sm text-muted-foreground">SMV</p>
                      <p className="font-medium">{sakeRow.smv}</p>
                    </div>
                  )}
                  {sakeRow.rice && (
                    <div>
                      <p className="text-sm text-muted-foreground">Rice</p>
                      <p className="font-medium">{sakeRow.rice}</p>
                    </div>
                  )}
                  {sakeRow.polishing_ratio && (
                    <div>
                      <p className="text-sm text-muted-foreground">Polishing Ratio</p>
                      <p className="font-medium">{sakeRow.polishing_ratio}%</p>
                    </div>
                  )}
                </div>
                {sakeRow.profile && (
                  <>
                    <Separator className="my-4" />
                    <div>
                      <p className="text-sm text-muted-foreground mb-2">Profile</p>
                      <p className="text-sm">{sakeRow.profile}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Tastings Section */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Tasting History</h2>
          {tastings && tastings.length > 0 ? (
            <div className="space-y-4">
              {tastings.map((tasting: any) => {
                const tastingAvg = tasting.tasting_scores.length > 0
                  ? (tasting.tasting_scores.reduce((sum: number, s: any) => sum + s.score, 0) / tasting.tasting_scores.length).toFixed(1)
                  : "—";

                return (
                  <Link key={tasting.id} href={`/tasting/${tasting.id}`}>
                    <Card className="hover:border-primary transition-colors cursor-pointer">
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-4 mb-2">
                              <p className="text-sm text-muted-foreground">
                                {new Date(tasting.date).toLocaleDateString()}
                              </p>
                              {tasting.location_name && (
                                <>
                                  <span className="text-muted-foreground">•</span>
                                  <p className="text-sm text-muted-foreground">
                                    {tasting.location_name}
                                  </p>
                                </>
                              )}
                            </div>
                            {tasting.notes && (
                              <p className="text-sm mb-3">{tasting.notes}</p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {tasting.tasting_scores.map((score: any, idx: number) => (
                                <Badge key={idx} variant="outline">
                                  {score.tasters.name}: {score.score}/5 ★
                                </Badge>
                              ))}
                            </div>
                          </div>
                          <div className="ml-4 text-right">
                            <p className="text-2xl font-bold">{tastingAvg}</p>
                            <p className="text-xs text-muted-foreground">avg</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          ) : (
            <Card>
              <CardContent className="pt-6 text-center text-muted-foreground">
                No tastings yet
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
