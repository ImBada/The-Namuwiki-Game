const LOCAL_ROUND_SECRET = "the-namuwiki-game-local-round-secret";

export function getRoundSecret() {
  const secret = process.env.ROUND_SECRET || "";
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    throw new Error("ROUND_SECRET must be set in production");
  }

  return LOCAL_ROUND_SECRET;
}
