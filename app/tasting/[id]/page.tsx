import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function TastingPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createClient();

  // Fetch tasting with sake and scores
  const { data: tasting, error: tastingError } = await supabase
    .from("tastings")
    .select(`
      *,
      sakes (*),
      tasting_scores (
        id,
        score,
        notes,
        created_at,
        tasters (
          id,
          name,
          email,
          profile_image_url
        )
      )
    `)
    .eq("id", id)
    .single();

  if (tastingError || !tasting) {
    notFound();
  }

  // Calculate average score
  const scores = tasting.tasting_scores.map((s: any) => s.score);
  const avgScore = scores.length > 0
    ? (scores.reduce((a: number, b: number) => a + b, 0) / scores.length).toFixed(1)
    : "—";

  return (
    <div className="container py-8">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground mb-4 inline-block">
            ← Back to Home
          </Link>
          <h1 className="text-4xl font-bold mb-2">Tasting Session</h1>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>{new Date(tasting.date).toLocaleDateString()}</span>
            {tasting.location_name && (
              <>
                <span>•</span>
                <span>{tasting.location_name}</span>
              </>
            )}
          </div>
        </div>

        {/* Sake Overview */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-6">
              <Link href={`/sake/${tasting.sakes.id}`} className="flex-shrink-0">
                {tasting.sakes.front_image_url ? (
                  <div className="relative w-32 h-40 bg-muted rounded-lg overflow-hidden hover:opacity-80 transition-opacity">
                    <Image
                      src={tasting.sakes.front_image_url}
                      alt={tasting.sakes.name}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-32 h-40 bg-muted rounded-lg flex items-center justify-center">
                    <span className="text-4xl">🍶</span>
                  </div>
                )}
              </Link>
              <div className="flex-1">
                <Link href={`/sake/${tasting.sakes.id}`}>
                  <h2 className="text-2xl font-bold mb-1 hover:text-primary transition-colors">
                    {tasting.sakes.name}
                  </h2>
                </Link>
                {tasting.sakes.brewery && (
                  <p className="text-muted-foreground mb-3">{tasting.sakes.brewery}</p>
                )}
                <div className="flex flex-wrap gap-2 mb-4">
                  {tasting.sakes.type && <Badge>{tasting.sakes.type}</Badge>}
                  {tasting.sakes.prefecture && (
                    <Badge variant="outline">{tasting.sakes.prefecture}</Badge>
                  )}
                  {tasting.sakes.grade && (
                    <Badge variant="outline">{tasting.sakes.grade}</Badge>
                  )}
                </div>
                {tasting.sakes.profile && (
                  <p className="text-sm text-muted-foreground">{tasting.sakes.profile}</p>
                )}
              </div>
              <div className="text-right">
                <div className="text-5xl font-bold mb-1">{avgScore}</div>
                <div className="text-yellow-500 text-2xl mb-1">★</div>
                <p className="text-xs text-muted-foreground">
                  {scores.length} rating{scores.length !== 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tasting Notes */}
        {tasting.notes && (
          <Card>
            <CardHeader>
              <CardTitle>Session Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{tasting.notes}</p>
            </CardContent>
          </Card>
        )}

        {/* Individual Scores */}
        <div>
          <h2 className="text-2xl font-bold mb-4">Individual Ratings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tasting.tasting_scores.map((score: any) => (
              <Card key={score.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start gap-4">
                    <Avatar className="h-12 w-12">
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {score.tasters.name.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-semibold">{score.tasters.name}</p>
                        <div className="flex items-center gap-1">
                          <span className="text-2xl font-bold">{score.score}</span>
                          <span className="text-yellow-500">★</span>
                        </div>
                      </div>
                      {score.notes && (
                        <p className="text-sm text-muted-foreground">{score.notes}</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Score Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Score Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[5, 4, 3, 2, 1].map((star) => {
                const count = scores.filter((s: number) => s === star).length;
                const percentage = scores.length > 0 ? (count / scores.length) * 100 : 0;
                
                return (
                  <div key={star} className="flex items-center gap-4">
                    <div className="flex items-center gap-1 w-12">
                      <span className="text-sm font-medium">{star}</span>
                      <span className="text-yellow-500 text-sm">★</span>
                    </div>
                    <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="w-12 text-right text-sm text-muted-foreground">
                      {count}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
