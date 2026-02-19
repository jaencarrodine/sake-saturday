import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useTastingDetail(tastingId: string) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ["tasting-detail", tastingId],
    queryFn: async () => {
      // Get tasting details
      const { data: tasting, error: tastingError } = await supabase
        .from("tastings")
        .select(`
          *,
          sakes (
            id,
            name,
            prefecture,
            type,
            grade
          )
        `)
        .eq("id", tastingId)
        .single();
      
      if (tastingError) throw tastingError;
      if (!tasting) throw new Error("Tasting not found");
      
      // Get all scores for this tasting
      const { data: scores, error: scoresError } = await supabase
        .from("scores")
        .select(`
          *,
          tasters (
            id,
            name,
            profile_pic
          )
        `)
        .eq("tasting_id", tastingId)
        .order("score", { ascending: false });
      
      if (scoresError) throw scoresError;
      
      // Get tasting images
      const { data: tastingImages } = await supabase
        .from("tasting_images")
        .select("*")
        .eq("tasting_id", tastingId)
        .order("created_at", { ascending: true });
      
      return {
        tasting,
        scores: scores || [],
        images: tastingImages || [],
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
