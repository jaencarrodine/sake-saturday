import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useTastingScores(tastingIds: string[]) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ["tasting-scores", tastingIds],
    queryFn: async () => {
      if (tastingIds.length === 0) {
        return [];
      }
      
      const { data, error } = await supabase
        .from("scores")
        .select("tasting_id, score")
        .in("tasting_id", tastingIds);
      
      if (error) throw error;
      return data || [];
    },
    enabled: tastingIds.length > 0,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
