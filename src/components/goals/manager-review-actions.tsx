"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Loader2, Undo2 } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/src/components/ui/button";
import { Textarea } from "@/src/components/ui/textarea";
import { approveGoalPlan, returnGoalPlan } from "@/src/server/goals/actions";

export function ManagerReviewActions({
  planId,
  approvalId,
  planVersion,
  approvalVersion
}: {
  planId: string;
  approvalId: string;
  planVersion: number;
  approvalVersion: number;
}) {
  const [comment, setComment] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function approve() {
    startTransition(async () => {
      const result = await approveGoalPlan({
        planId,
        approvalId,
        expectedPlanVersion: planVersion,
        expectedApprovalVersion: approvalVersion,
        comment
      });
      setStatus(result.ok ? "Approved" : result.error.message);
    });
  }

  function returnForRework() {
    startTransition(async () => {
      const result = await returnGoalPlan({
        planId,
        approvalId,
        expectedPlanVersion: planVersion,
        expectedApprovalVersion: approvalVersion,
        comment
      });
      setStatus(result.ok ? "Returned" : result.error.message);
    });
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid gap-3">
      <Textarea
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Manager review comment"
        rows={3}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={isPending} onClick={approve}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          Approve
        </Button>
        <Button disabled={isPending || comment.trim().length < 8} variant="secondary" onClick={returnForRework}>
          <Undo2 className="h-4 w-4" />
          Return
        </Button>
      </div>
      {status ? <p className="text-sm font-medium text-slate-600">{status}</p> : null}
    </motion.div>
  );
}
