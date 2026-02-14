import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { Database } from "@/types/supabase/databaseTypes";

type TastingInsert = Database["public"]["Tables"]["tastings"]["Insert"];
type TastingRow = Database["public"]["Tables"]["tastings"]["Row"];
type TasterInsert = Database["public"]["Tables"]["tasters"]["Insert"];
type TasterRow = Database["public"]["Tables"]["tasters"]["Row"];
type TastingScoreInsert = Database["public"]["Tables"]["tasting_scores"]["Insert"];
type TastingTasterInsert = Database["public"]["Tables"]["tasting_tasters"]["Insert"];

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    // Create the tasting
    const tastingData: TastingInsert = {
      sake_id: body.sake_id,
      location_name: body.location_name || null,
      notes: body.notes || null,
    };

    const { data: tasting, error: tastingError } = await supabase
      .from("tastings")
      .insert(tastingData as any)
      .select()
      .single();

    if (tastingError || !tasting) {
      console.error("Error creating tasting:", tastingError);
      return NextResponse.json({ error: tastingError?.message || "Failed to create tasting" }, { status: 500 });
    }

    const tastingRow = tasting as TastingRow;

    // Add my score first (as a taster)
    if (body.my_score) {
      // Create a taster for "me" if needed
      const myTasterData: TasterInsert = {
        name: "Me", // You can make this dynamic later with auth
        email: null,
      };

      const { data: myTaster, error: myTasterError } = await supabase
        .from("tasters")
        .insert(myTasterData as any)
        .select()
        .single();

      if (!myTasterError && myTaster) {
        const myTasterRow = myTaster as TasterRow;

        const myScoreData: TastingScoreInsert = {
          tasting_id: tastingRow.id,
          taster_id: myTasterRow.id,
          score: body.my_score,
          notes: body.my_notes || null,
        };

        await supabase.from("tasting_scores").insert(myScoreData as any);

        const myTasterJunction: TastingTasterInsert = {
          tasting_id: tastingRow.id,
          taster_id: myTasterRow.id,
        };

        await supabase.from("tasting_tasters").insert(myTasterJunction as any);
      }
    }

    // Add other tasters and their scores
    if (body.tasters && body.tasters.length > 0) {
      for (const taster of body.tasters) {
        // Add to tasting_scores
        const scoreData: TastingScoreInsert = {
          tasting_id: tastingRow.id,
          taster_id: taster.id,
          score: taster.score,
          notes: taster.notes || null,
        };

        await supabase.from("tasting_scores").insert(scoreData as any);

        // Add to tasting_tasters junction table
        const tasterJunction: TastingTasterInsert = {
          tasting_id: tastingRow.id,
          taster_id: taster.id,
        };

        await supabase.from("tasting_tasters").insert(tasterJunction as any);
      }
    }

    return NextResponse.json(tastingRow);
  } catch (error) {
    console.error("Error in POST /api/tastings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
