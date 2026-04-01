import { HotspotDashboard } from "@/components/hotspot-dashboard";
import { getDashboardData } from "@/lib/monitor";

export const dynamic = "force-dynamic";

export default async function Home() {
  const initialData = await getDashboardData();
  return <HotspotDashboard initialData={initialData} />;
}
