import { NextResponse } from "next/server";
import { executeInTransaction } from "@/src/server/background/transactionalManager";
import { logAudit } from "@/src/server/governance/auditService";

export async function POST(req: Request) {
  try {
    // 1. Verify MS Teams Payload Signature (HMAC validation in a real enterprise app)
    // const signature = req.headers.get("Authorization");
    // validateSignature(signature, process.env.TEAMS_WEBHOOK_SECRET);

    const payload = await req.json();

    // From our Adaptive Card Action.Submit
    const { action, approvalId } = payload;

    if (!action || !approvalId) {
      return NextResponse.json({ error: "Invalid payload structure" }, { status: 400 });
    }

    console.log(`[Teams Webhook] Received action ${action} for Approval ${approvalId}`);

    // 2. Execute business logic idempotently within transaction
    await executeInTransaction(async (tx) => {
      // In a real app we would load the GoalApproval, verify it is still PENDING, 
      // check the user permissions based on the mapped Entra Object ID, and apply the decision.
      const approval = await tx.goalApproval.findUnique({
        where: { id: approvalId },
        select: { organizationId: true }
      });
      
      if (!approval) {
        throw new Error("Approval not found");
      }
      
      // await tx.goalApproval.update({ ... });

      await logAudit(tx, {
        organizationId: approval.organizationId, 
        action: action === "APPROVE" ? "APPROVE" : "REJECT",
        entityType: "GoalApproval",
        entityId: approvalId,
        metadata: { source: "MS_TEAMS_ADAPTIVE_CARD" },
        isSystemGenerated: true,
      });
    });

    // Optionally, we could return a new Adaptive Card replacing the old one with a success message.
    return NextResponse.json({ message: "Action processed successfully" }, { status: 200 });
  } catch (error) {
    console.error("[Teams Webhook] Error processing action:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
