/** A page on this site to go back to after logging in, or undefined. Anything else, like another site's address, is dropped. */
export function returnTo(value: unknown): string | undefined {
  return typeof value === "string" && /^\/(?![/\\])/.test(value) ? value : undefined;
}

/** The pages that need a logged-in donor (or ops): pledging and the live PayPal demo. One-time gifts stay open. */
export const DONOR_PAGES = ["/pledge", "/run"];
