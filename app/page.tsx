import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import Image from "next/image";

export default async function Home() {
  const supabase = await createClient();

  // Fetch sakes with their average scores using the view
  const { data: sakes, error } = await supabase
    .from("sake_averages")
    .select("*")
    .order("avg_score", { ascending: false });

  if (error) {
    console.error("Error fetching sakes:", error);
  }

  return (
    <div className="container py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-2">Sake Collection</h1>
        <p className="text-muted-foreground">
          Explore and track your sake tasting experiences
        </p>
      </div>

      {!sakes || sakes.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            No sakes yet. Start by creating your first tasting!
          </p>
          <Link
            href="/tasting/new"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2"
          >
            Create First Tasting
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sakes.map((sake) => (
            <Link key={sake.id} href={`/sake/${sake.id}`}>
              <Card className="hover:border-primary transition-colors cursor-pointer h-full">
                <CardHeader>
                  {sake.front_image_url && (
                    <div className="relative w-full h-48 mb-4 bg-muted rounded-md overflow-hidden">
                      <Image
                        src={sake.front_image_url}
                        alt={sake.name || "Sake"}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <CardTitle className="text-xl">{sake.name}</CardTitle>
                  {sake.brewery && (
                    <p className="text-sm text-muted-foreground">
                      {sake.brewery}
                    </p>
                  )}
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {sake.type && <Badge variant="secondary">{sake.type}</Badge>}
                    </div>
                    <div className="flex flex-col items-end">
                      <div className="text-2xl font-bold">
                        {sake.avg_score ? sake.avg_score.toFixed(1) : "—"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {sake.tasting_count || 0} tasting{sake.tasting_count !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
