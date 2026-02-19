import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useSakeDetail(sakeId: string) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ["sake-detail", sakeId],
    queryFn: async () => {
      // Get sake details
      const { data: sake, error: sakeError } = await supabase
        .from("sakes")
        .select("*")
        .eq("id", sakeId)
        .single();
      
      if (sakeError) throw sakeError;
      if (!sake) throw new Error("Sake not found");
      
      // Get all tastings for this sake
      const { data: tastings, error: tastingsError } = await supabase
        .from("tastings")
        .select("*")
        .eq("sake_id", sakeId)
        .order("date", { ascending: false });
      
      if (tastingsError) throw tastingsError;
      
      // Get all scores for this sake
      const tastingIds = tastings?.map(t => t.id) || [];
      let scores: any[] = [];
      let images: any[] = [];
      
      if (tastingIds.length > 0) {
        const { data: scoresData, error: scoresError } = await supabase
          .from("scores")
          .select(`
            *,
            tasters (
              id,
              name,
              profile_pic
            ),
            tastings (
              id,
              date
            )
          `)
          .in("tasting_id", tastingIds);
        
        if (scoresError) throw scoresError;
        scores = scoresData || [];
        
        // Get tasting images for all tastings
        const { data: imagesData } = await supabase
          .from("tasting_images")
          .select("*")
          .in("tasting_id", tastingIds)
          .order("created_at", { ascending: true });
        
        images = imagesData || [];
      }
      
      return {
        sake,
        tastings: tastings || [],
        scores,
        images,
      };
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
