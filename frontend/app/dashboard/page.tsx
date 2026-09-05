import { Grid } from "@/components/om/primitives/Grid";
import { KpiRow } from "@/components/dashboard/KpiRow";
import { ReachTrendCard } from "@/components/dashboard/ReachTrendCard";
import { ChannelMixCard } from "@/components/dashboard/ChannelMixCard";
import { ActivityCard } from "@/components/dashboard/ActivityCard";
import { UpcomingCard } from "@/components/dashboard/UpcomingCard";
import { WeeklyPostsCard } from "@/components/dashboard/WeeklyPostsCard";
import { TopPostsCard } from "@/components/dashboard/TopPostsCard";

export default function DashboardPage() {
  return (
    <div className="om-anim-rise space-y-3">
      <KpiRow />
      <Grid cols={2}>
        <ReachTrendCard />
        <ChannelMixCard />
      </Grid>
      <Grid cols={2}>
        <ActivityCard />
        <UpcomingCard />
      </Grid>
      <Grid cols={2}>
        <WeeklyPostsCard />
        <TopPostsCard />
      </Grid>
    </div>
  );
}
