import { PRIOR_PROOF_HASHES, type ProofCheck, type ProofFile, type ProofKind } from "@/fixtures/helene";
import type { Verdict } from "@/lib/demoStore";

/**
 * Browser stand-in for the Verifier agent. The exact-duplicate check is real: it hashes each file and compares it with
 * prior proof. Reading counts, dates and locations needs the live agent, so those show as not run instead of a fake pass.
 */
export const KIND_LABEL: Record<ProofKind, string> = {
  list: "Distribution list",
  photo: "Photo",
  receipt: "Receipt",
};

export function guessKind(file: File): ProofKind {
  if (file.type.startsWith("image/")) return "photo";
  if (/\.(csv|xlsx?|tsv)$/i.test(file.name)) return "list";
  return "receipt";
}

export async function hashFile(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function verify(files: ProofFile[], earlierHashes: string[]): { checks: ProofCheck[]; verdict: Verdict; files: ProofFile[] } {
  const seen = new Set([...PRIOR_PROOF_HASHES, ...earlierHashes]);
  const marked = files.map((file) => {
    if (!seen.has(file.hash)) {
      seen.add(file.hash);
      return file;
    }
    return { ...file, flagged: "Same file as proof the Verifier has already seen" };
  });
  const duplicates = marked.filter((f) => f.flagged);
  const missing = (Object.keys(KIND_LABEL) as ProofKind[]).filter((k) => !files.some((f) => f.kind === k));

  const checks: ProofCheck[] = [
    {
      label: "Every proof type is here",
      state: missing.length ? "fail" : "pass",
      note: missing.length ? `Missing: ${missing.map((k) => KIND_LABEL[k].toLowerCase()).join(", ")}` : "List, photos and receipts are all present",
    },
    {
      label: "No duplicate images",
      state: duplicates.length ? "fail" : "pass",
      note: duplicates.length ? `${duplicates.map((f) => f.name).join(", ")} matched earlier proof` : "No file matches earlier proof",
    },
    { label: "Counts match amounts", state: "skipped", note: "Reading the list needs the live Verifier" },
    { label: "Dates and location fit", state: "skipped", note: "Reading photo data needs the live Verifier" },
  ];

  return { checks, files: marked, verdict: duplicates.length ? "human" : missing.length ? "partial" : "pass" };
}
