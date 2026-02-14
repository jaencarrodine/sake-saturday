import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const body = await request.json();

    const { data, error } = await supabase
      .from("sakes")
      .insert({
        name: body.name,
        brewery: body.brewery || null,
        prefecture: body.prefecture || null,
        grade: body.grade || null,
        type: body.type || null,
        alc_pct: body.alc_pct ? parseFloat(body.alc_pct) : null,
        smv: body.smv ? parseFloat(body.smv) : null,
        rice: body.rice || null,
        polishing_ratio: body.polishing_ratio ? parseFloat(body.polishing_ratio) : null,
        opacity: body.opacity || null,
        profile: body.profile || null,
        serving_temp: body.serving_temp || null,
        front_image_url: body.front_image_url || null,
        back_image_url: body.back_image_url || null,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating sake:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Error in POST /api/sakes:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
