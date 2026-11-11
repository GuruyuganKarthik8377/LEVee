import type { Metadata } from "next";
import { AppPage, Card, Label, Pill, type Tone } from "@/components/app/ui";
import LiveBoard from "@/components/live/LiveBoard";
import PillButton from "@/components/ui/PillButton";
import { alertMeets, getStorms, inGulfWatchArea } from "@/lib/gdacs";

export const metadata: Metadata = {
  title: "Live storm watch | LEVee",
  description: "Real tropical cyclones from GDACS, checked against LEVee's published rules.",
};

// GDACS issues advisories every few hours, so a quarter of an hour keeps this current without calling it on every visit.
export const revalidate = 900;

const ALERT_TONE: Record<string, Tone> = { Red: "red", Orange: "gold", Green: "green" };

export default async function LivePage() {
  const storms = await getStorms();
  const current = storms?.filter((s) => s.current) ?? [];
  const recent = storms?.filter((s) => !s.current && alertMeets(s.alert)) ?? [];
  const uncovered = [...current, ...recent].filter((s) => alertMeets(s.alert) && !inGulfWatchArea(s));

  return (
    <AppPage
      badge="Live data · GDACS"
      title="Storms on the *map* right now"
      intro="Real tropical cyclones from GDACS, checked against LEVee's published rules. Nothing here is a replay, and watching a storm never moves money."
      status={false}
      replay={false}
    >
      {storms === null ? (
        <Card>
          <Pill tone="gold">GDACS can&apos;t be reached</Pill>
          <p className="mt-3 text-[16px] text-body">We couldn&apos;t load the live storm list just now, so nothing is shown rather than old data. It tries again within 15 minutes.</p>
          <div className="mt-4">
            <PillButton href="/replay/helene">Watch the Helene replay instead</PillButton>
          </div>
        </Card>
      ) : (
        <>
          <LiveBoard current={current} />

          {recent.length > 0 && (
            <div className="mt-10">
              <Label>Serious storms in the last two weeks</Label>
              <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                {recent.map((s) => (
                  <li key={s.id} className="flex min-w-0 items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-ice">
                    <span className="min-w-0">
                      <a href={s.url} target="_blank" rel="noreferrer" className="block font-semibold text-ink hover:underline">
                        {s.name}
                      </a>
                      <span className="block truncate text-[13px] text-[#5f6b7a]">{s.countries || "Over open ocean"}</span>
                    </span>
                    <Pill tone={ALERT_TONE[s.alert] ?? "grey"}>{s.alert}</Pill>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {uncovered.length > 0 && (
            <Card className="mt-8 bg-navy text-white ring-navy">
              <p className="font-display text-[24px] text-white">
                {uncovered.length} serious {uncovered.length === 1 ? "storm" : "storms"} with no LEVee playbook yet
              </p>
              <p className="mt-2 max-w-[62ch] text-[15px] leading-relaxed text-white/75">Each new region needs published rules and vetted local partners with PayPal accounts. This list is where LEVee could go next.</p>
            </Card>
          )}
        </>
      )}
    </AppPage>
  );
}
