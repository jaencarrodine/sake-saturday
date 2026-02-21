import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useTasterDetail(tasterId: string) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ["taster-detail", tasterId],
    queryFn: async () => {
      // Get taster details
      const { data: taster, error: tasterError } = await supabase
        .from("tasters")
        .select("id, name, profile_pic, ai_profile_image_url, created_at")
        .eq("id", tasterId)
        .single();
      
      if (tasterError) throw tasterError;
      if (!taster) throw new Error("Taster not found");
      
      // Get all scores by this taster
      const { data: scores, error: scoresError } = await supabase
        .from("scores")
        .select(`
          *,
          tastings (
            id,
            date,
            sake_id,
            sakes (
              id,
              name,
              image_url,
              ai_bottle_image_url
            )
          )
        `)
        .eq("taster_id", tasterId)
        .order("created_at", { ascending: false });
      
      if (scoresError) throw scoresError;
      
      return {
        taster,
        scores: scores || [],
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
