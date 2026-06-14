const LOCAL_ROUND_SECRET = "the-namuwiki-game-local-round-secret";
const DEPLOYMENT_ENVIRONMENT_MARKERS = [
  "VERCEL",
  "VERCEL_ENV",
  "RAILWAY_ENVIRONMENT",
  "RAILWAY_PROJECT_ID",
  "RAILWAY_SERVICE_ID",
  "RENDER",
  "FLY_APP_NAME",
  "K_SERVICE",
  "AWS_LAMBDA_FUNCTION_NAME",
  "AWS_EXECUTION_ENV",
  "NETLIFY",
  "CF_PAGES",
  "FUNCTION_TARGET"
];

export function getRoundSecret() {
  const secret = String(process.env.ROUND_SECRET || "").trim();
  if (secret) return secret;

  if (isDeploymentEnvironment()) {
    throw new Error("ROUND_SECRET must be set in production or deployment environments");
  }

  return LOCAL_ROUND_SECRET;
}

function isDeploymentEnvironment() {
  return (
    process.env.NODE_ENV === "production" ||
    DEPLOYMENT_ENVIRONMENT_MARKERS.some((name) => Boolean(process.env[name]))
  );
}
