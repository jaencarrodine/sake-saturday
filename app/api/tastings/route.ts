import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    // Create the tasting
    const { data: tasting, error: tastingError } = await supabase
      .from("tastings")
      .insert({
        sake_id: body.sake_id,
        location_name: body.location_name || null,
        notes: body.notes || null,
      })
      .select()
      .single();

    if (tastingError) {
      console.error("Error creating tasting:", tastingError);
      return NextResponse.json({ error: tastingError.message }, { status: 500 });
    }

    // Add my score first (as a taster)
    if (body.my_score) {
      // Create a taster for "me" if needed
      const { data: myTaster, error: myTasterError } = await supabase
        .from("tasters")
        .insert({
          name: "Me", // You can make this dynamic later with auth
          email: null,
        })
        .select()
        .single();

      if (!myTasterError && myTaster) {
        await supabase.from("tasting_scores").insert({
          tasting_id: tasting.id,
          taster_id: myTaster.id,
          score: body.my_score,
          notes: body.my_notes || null,
        });

        await supabase.from("tasting_tasters").insert({
          tasting_id: tasting.id,
          taster_id: myTaster.id,
        });
      }
    }

    // Add other tasters and their scores
    if (body.tasters && body.tasters.length > 0) {
      for (const taster of body.tasters) {
        // Add to tasting_scores
        await supabase.from("tasting_scores").insert({
          tasting_id: tasting.id,
          taster_id: taster.id,
          score: taster.score,
          notes: taster.notes || null,
        });

        // Add to tasting_tasters junction table
        await supabase.from("tasting_tasters").insert({
          tasting_id: tasting.id,
          taster_id: taster.id,
        });
      }
    }

    return NextResponse.json(tasting);
  } catch (error) {
    console.error("Error in POST /api/tastings:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
