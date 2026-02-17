import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

type Stats = {
  sakeCount: number;
  tastingCount: number;
  tasterCount: number;
  scoreCount: number;
};

export function useStats() {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ["stats"],
    queryFn: async () => {
      // Get counts from all tables
      const [
        { count: sakeCount },
        { count: tastingCount },
        { count: tasterCount },
        { count: scoreCount }
      ] = await Promise.all([
        supabase.from("sakes").select("*", { count: "exact", head: true }),
        supabase.from("tastings").select("*", { count: "exact", head: true }),
        supabase.from("tasters").select("*", { count: "exact", head: true }),
        supabase.from("scores").select("*", { count: "exact", head: true })
      ]);
      
      return {
        sakeCount: sakeCount || 0,
        tastingCount: tastingCount || 0,
        tasterCount: tasterCount || 0,
        scoreCount: scoreCount || 0,
      } as Stats;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
