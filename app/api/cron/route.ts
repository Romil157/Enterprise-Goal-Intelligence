import { NextResponse } from "next/server";
import { executeDailyCron } from "@/src/server/cron/cronScheduler";
import { prisma } from "@/src/lib/prisma";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization");
    
    // Secure Cron Execution Endpoint
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.warn("[Cron API] Unauthorized cron attempt.");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    console.log("[Cron API] Authorized cron trigger received.");

    // Retrieve all active organizations
    const organizations = await prisma.organization.findMany({
      where: { status: "ACTIVE" },
      select: { id: true },
    });

    // In a multi-tenant enterprise system with thousands of orgs, we would 
    // fan-out these executions to a distributed queue like SQS or BullMQ.
    // For this architectural phase, we execute them sequentially or concurrently in batches.
    for (const org of organizations) {
      await executeDailyCron(org.id);
    }

    return NextResponse.json({ message: "Cron jobs executed successfully" }, { status: 200 });
  } catch (error) {
    console.error("[Cron API] Execution failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

// Support GET for external services that might only support GET requests (like simple pingers),
// although POST is strongly preferred for side-effect operations.
export async function GET(req: Request) {
  return POST(req);
}
