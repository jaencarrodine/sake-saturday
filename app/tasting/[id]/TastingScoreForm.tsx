"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

type TastingScoreFormProps = {
  kikizakeId: string;
  existingScore: { id: string; score: number; notes: string | null } | null;
  isOwner: boolean;
};

export function TastingScoreForm({ kikizakeId, existingScore, isOwner }: TastingScoreFormProps) {
  const router = useRouter();
  const [score, setScore] = useState(existingScore?.score ?? 0);
  const [notes, setNotes] = useState(existingScore?.notes ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (score < 1 || score > 5) return;

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      if (existingScore) {
        const { error } = await supabase
          .from("kikizake_scores")
          .update({ score, notes: notes || null })
          .eq("id", existingScore.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("kikizake_scores")
          .insert({
            kikizake_id: kikizakeId,
            taster_id: user.id,
            score,
            notes: notes || null,
          });

        if (error) throw error;
      }

      router.refresh();
    } catch (err) {
      console.error("Error saving score:", err);
      alert("Failed to save rating. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!existingScore) return;
    if (!confirm("Remove your rating?")) return;

    setIsSubmitting(true);
    const supabase = createClient();

    try {
      const { error } = await supabase
        .from("kikizake_scores")
        .delete()
        .eq("id", existingScore.id);

      if (error) throw error;
      router.refresh();
    } catch (err) {
      console.error("Error deleting score:", err);
      alert("Failed to remove rating.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Rating</CardTitle>
        <CardDescription>
          {existingScore ? "Update your score and notes" : "Add your score and tasting notes"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Score (1-5 stars)</Label>
            <div className="flex gap-2 mt-2">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScore(s)}
                  className={`text-4xl transition-colors ${
                    s <= score ? "text-yellow-500" : "text-muted"
                  }`}
                >
                  ★
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Your tasting notes..."
              rows={3}
              className="mt-2"
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={score < 1 || isSubmitting}>
              {isSubmitting ? "Saving..." : existingScore ? "Update Rating" : "Add Rating"}
            </Button>
            {existingScore && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDelete}
                disabled={isSubmitting}
              >
                Remove
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
