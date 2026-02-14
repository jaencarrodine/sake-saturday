import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import type { Database } from "@/types/supabase/databaseTypes";

type TasterInsert = Database["public"]["Tables"]["tasters"]["Insert"];

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    // Check if taster with this email already exists
    if (body.email) {
      const { data: existing } = await supabase
        .from("tasters")
        .select()
        .eq("email", body.email)
        .single();

      if (existing) {
        return NextResponse.json(existing);
      }
    }

    // Create new taster
    const tasterData: TasterInsert = {
      name: body.name,
      email: body.email || null,
      profile_image_url: body.profile_image_url || null,
    };

    const { data, error } = await supabase
      .from("tasters")
      .insert(tasterData as any)
      .select()
      .single();

    if (error) {
      console.error("Error creating taster:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in POST /api/tasters:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
