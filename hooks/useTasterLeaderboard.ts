import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useTasterLeaderboard(limit?: number) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ["taster-leaderboard", limit],
    queryFn: async () => {
      let query = supabase
        .from("taster_leaderboard")
        .select("*")
        .order("avg_score_given", { ascending: false, nullsFirst: false });
      
      if (limit) {
        query = query.limit(limit);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
