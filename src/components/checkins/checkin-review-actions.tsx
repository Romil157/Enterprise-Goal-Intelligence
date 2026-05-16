"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { reviewCheckIn } from "@/src/server/checkins/actions";

import { Input } from "@/src/components/ui/input";

export function CheckInReviewActions({ 
  checkInId, 
  actualAchievement,
  unit 
}: { 
  checkInId: string;
  actualAchievement: number | null;
  unit: string | null;
}) {
  const [comment, setComment] = useState("");
  const [editedAchievement, setEditedAchievement] = useState<string>(actualAchievement?.toString() ?? "");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve() {
    startTransition(async () => {
      const result = await reviewCheckIn({
        checkInId,
        managerComment: comment || "Reviewed and approved.",
        decision: "APPROVE",
        editedAchievement: editedAchievement && editedAchievement !== actualAchievement?.toString() 
          ? Number(editedAchievement) 
          : undefined
      });
      setStatus(result.ok ? "Approved" : result.error.message);
    });
  }

  function returnForRework() {
    startTransition(async () => {
      const result = await reviewCheckIn({
        checkInId,
        managerComment: comment,
        decision: "REQUEST_REWORK",
        editedAchievement: editedAchievement && editedAchievement !== actualAchievement?.toString() 
          ? Number(editedAchievement) 
          : undefined
      });
      setStatus(result.ok ? "Returned for rework" : result.error.message);
    });
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-3">
      <div className="grid gap-1">
        <label className="text-xs font-medium text-slate-600">Inline Correction (Actual Achievement)</label>
        <div className="flex items-center gap-2">
          <Input 
            type="number" 
            step="any"
            value={editedAchievement}
            onChange={(e) => setEditedAchievement(e.target.value)}
            placeholder={`Original: ${actualAchievement ?? "None"}`}
            className="max-w-[200px]"
          />
          {unit && <span className="text-sm text-slate-500">{unit}</span>}
        </div>
      </div>
      <Textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Structured check-in review comment"
        rows={3}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={isPending} onClick={approve}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Approve
        </Button>
        <Button disabled={isPending || comment.trim().length < 4} variant="secondary" onClick={returnForRework}>
          <Undo2 className="h-4 w-4" />
          Return
        </Button>
      </div>
      {status ? <p className="text-sm font-medium text-slate-600">{status}</p> : null}
    </motion.div>
  );
}
