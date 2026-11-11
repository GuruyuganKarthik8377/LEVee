// A partner's proof after landfall: checked by the Verifier against Levee's own records, then saved for tranche 2.
import type { LeveeContext, ProofUpload } from "../levee.ts";
import type { VerifierResult } from "../verifier/agent.ts";
import { LeveeError } from "./errors.ts";
import type { EventRecord, VerdictRecord } from "./stores.ts";

export function createProofs({ deps, kv, playbook, store, verify }: LeveeContext) {
  return {
    // POST /proofs. Runs the Verifier, then tranche 2 follows on the next tick.
    async submitProof(upload: ProofUpload): Promise<VerifierResult> {
      const event = await kv.get<EventRecord>(`event:${upload.eventKey}`);
      if (!event) throw new LeveeError(`No event ${upload.eventKey}`);
      if (!event.landfall) throw new LeveeError("Proof opens once landfall is confirmed");
      const partner = (await deps.partners()).find((p) => p.id === upload.partnerId);
      if (!partner) throw new LeveeError(`Unknown partner ${upload.partnerId}`);
      const first = await store.get(`${upload.eventKey}:t1`);
      const paid = first?.payout?.allocations.find((a) => a.partnerId === partner.id);
      if (!first?.payout || !paid) throw new LeveeError("This partner received no tranche 1 for this storm");
      // Everything it has been sent for this storm, so its receipts are held against the real total.
      const matched = (first.invoices ?? []).filter((i) => i.payout?.status === "done").flatMap((i) => i.payout!.paidTo).filter((p) => p.partnerId === partner.id).reduce((sum, p) => sum + p.cents, 0);
      const fundsReceivedAt = first.items.map((i) => i.firstAttemptAt).filter((t): t is string => !!t).sort().at(-1)!;

      const result = await verify({
        partnerId: partner.id,
        eventKey: upload.eventKey,
        amountReceived: { currency_code: playbook.currency, value: ((paid.cents + matched) / 100).toFixed(2) },
        fundsReceivedAt,
        landfallAt: event.landfall.confirmedAt,
        serviceArea: { name: partner.area.name, lat: partner.area.lat, lon: partner.area.lon, radiusKm: partner.radiusKm, utcOffsetMinutes: partner.utcOffsetMinutes },
        photos: upload.photos,
        receipts: upload.receipts,
        distribution: upload.distribution,
        ...(upload.sample && { sample: true }),
      });
      await deps.audit(result.audit);

      const delivered = new Map<string, { quantity: number; households: Set<string> }>();
      for (const d of upload.distribution) {
        const entry = delivered.get(d.item) ?? { quantity: 0, households: new Set<string>() };
        entry.quantity += d.quantity;
        entry.households.add(d.beneficiaryId);
        delivered.set(d.item, entry);
      }
      const record: VerdictRecord = {
        partnerId: partner.id,
        result,
        delivered: [...delivered].map(([item, d]) => ({ item, quantity: d.quantity, households: d.households.size })),
      };
      await kv.set(`verdict:${upload.eventKey}:${partner.id}`, record);
      return result;
    },
  };
}
