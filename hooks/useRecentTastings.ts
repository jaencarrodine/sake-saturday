import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export function useRecentTastings(limit: number = 6) {
  const supabase = createClient();
  
  return useQuery({
    queryKey: ["recent-tastings", limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tastings")
        .select(`
          id,
          date,
          location_name,
          front_image,
          sake_id,
          sakes (
            id,
            name
          )
        `)
        .order("date", { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return data;
    },
    staleTime: 1000 * 60 * 2, // 2 minutes
  });
}
