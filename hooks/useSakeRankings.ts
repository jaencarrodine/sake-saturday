import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useSakeRankings(limit?: number) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ["sake-rankings", limit],
    queryFn: async () => {
      let query = supabase
        .from("sake_rankings")
        .select("*")
        .order("avg_score", { ascending: false, nullsFirst: false });
      
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
