import { deleteMonitor, getDashboardData, upsertMonitor } from "@/lib/monitor";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = (await request.json()) as Parameters<typeof upsertMonitor>[0];
  const monitor = await upsertMonitor(body);
  const snapshot = await getDashboardData();

  return Response.json({ monitor, snapshot });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const monitorId = searchParams.get("id");

  if (!monitorId) {
    return Response.json({ message: "缺少监控 ID" }, { status: 400 });
  }

  await deleteMonitor(monitorId);
  const snapshot = await getDashboardData();
  return Response.json({ snapshot });
}