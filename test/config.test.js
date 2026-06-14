import test from "node:test";
import assert from "node:assert/strict";

let importCounter = 0;

const ENV_KEYS = [
  "ROUND_SECRET",
  "NODE_ENV",
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

async function importConfig(label) {
  importCounter += 1;
  return import(`../src/config.js?${label}-${Date.now()}-${importCounter}`);
}

async function withEnv(overrides, task) {
  const previous = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  Object.assign(process.env, overrides);

  try {
    return await task();
  } finally {
    for (const key of ENV_KEYS) {
      if (previous[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = previous[key];
      }
    }
  }
}

test("uses the local round secret outside deployment environments", async () => {
  await withEnv({}, async () => {
    const { getRoundSecret } = await importConfig("local");
    assert.equal(getRoundSecret(), "the-namuwiki-game-local-round-secret");
  });
});

test("requires a round secret for deployment environment markers", async () => {
  for (const marker of ["RAILWAY_ENVIRONMENT", "NETLIFY", "AWS_EXECUTION_ENV"]) {
    await withEnv({ [marker]: "1" }, async () => {
      const { getRoundSecret } = await importConfig(`deployment-${marker}`);
      assert.throws(
        () => getRoundSecret(),
        /ROUND_SECRET must be set in production or deployment environments/
      );
    });
  }
});

test("uses an explicit round secret in deployment environments", async () => {
  await withEnv({ RAILWAY_ENVIRONMENT: "production", ROUND_SECRET: " deployed-secret " }, async () => {
    const { getRoundSecret } = await importConfig("explicit");
    assert.equal(getRoundSecret(), "deployed-secret");
  });
});
