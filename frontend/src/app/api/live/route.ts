import { reserveBalanceCents } from "../../../../../backend/policy/src/rules.ts";
import { sessionFor, withStore, type Action, type Session } from "@/lib/liveStore";
import { paypalConfigured, paypalRoute, readPayout } from "@/lib/paypal";
import { backendStore, pagePartners, pagePayments, pageReader } from "@/server/levee";
import { askAboutRun, refreshBatches, runAction } from "@/server/liveRun";
import { handle, withSetCookies } from "@/server/http";
import { requireGiver } from "@/server/supabaseAuth";

export const dynamic = "force-dynamic";

const ACTIONS: Action[] = ["fire", "skip", "charge1", "proof", "charge2", "approve", "reject", "reset"];

/** What the browser may see. The saved account's token never leaves the server. */
function view(session: Session, reserveCents: number) {
  const { pledge, gifts, run, activity } = session;
  return {
    configured: paypalConfigured(),
    reserveCents,
    pledge: pledge && { amountCents: pledge.amountCents, capCents: pledge.capCents, chargedCents: pledge.chargedCents, timing: pledge.timing ?? "early" },
    gifts: gifts.filter((g) => g.status !== "created").map(({ id, cents, status, captureId, feeCents, netCents, at }) => ({ id, cents, status, captureId, feeCents, netCents, at })),
    run,
    activity: activity.slice(0, 40),
  };
}

export type LiveView = ReturnType<typeof view>;

/** The Reserve, from the backend's ledger: gifts and monthly payments in, storm draws and refunds out. */
const reserve = async () => reserveBalanceCents(await backendStore().readLedger());

export const GET = () =>
  withStore(async (store) => {
    const session = await sessionFor(store);
    if (paypalConfigured()) await refreshBatches(session, readPayout);
    return Response.json(view(session, await reserve()));
  });

/** Moves real sandbox money, so it needs a logged-in donor or ops person. Reading (GET) stays open: the gift page shows the Reserve. */
export const POST = (request: Request) =>
  handle(async () => {
    const { cookies } = await requireGiver(request);
    return withSetCookies(await act(request), cookies);
  });

const MAX_QUESTION = 500;

const act = (request: Request) =>
  paypalRoute(async () => {
    const { action, question, ai } = (await request.json()) as { action?: Action | "ask"; question?: unknown; ai?: unknown };
    // "Where did my money go?": the Narrator answers about this browser's run.
    if (action === "ask") {
      if (typeof question !== "string" || !question.trim() || question.length > MAX_QUESTION) return Response.json({ error: `Ask a question of up to ${MAX_QUESTION} characters` }, { status: 400 });
      return withStore(async (store) => {
        const session = await sessionFor(store);
        const backend = backendStore();
        const answer = await askAboutRun(session, question.trim(), { kv: backend.kv, ledger: backend.ledger, readLedger: backend.readLedger, payments: pagePayments(), partners: pagePartners, reader: pageReader() });
        return Response.json({ answer, ...view(session, await reserve()) });
      });
    }
    if (!action || !ACTIONS.includes(action)) return Response.json({ error: "unknown_action" }, { status: 400 });
    return withStore(async (store) => {
      const session = await sessionFor(store);
      const backend = backendStore();
      await runAction(session, action, { kv: backend.kv, ledger: backend.ledger, readLedger: backend.readLedger, payments: pagePayments(), partners: pagePartners }, ai === "live" ? "live" : "saved");
      return Response.json(view(session, await reserve()));
    });
  });
