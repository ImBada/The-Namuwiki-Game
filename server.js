import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import {
  createRound,
  estimateDifficulty,
  handleClick,
  normalizeRoundSeed,
  scoreArticleQuality,
  stableSeededOrder
} from "./src/game.js";
import { getDailyLeaderboard, submitDailyScore } from "./src/daily-scores.js";
import { readJsonBody, sendJson } from "./src/http.js";
import { serveStatic } from "./src/static.js";

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");

export {
  estimateDifficulty,
  normalizeRoundSeed,
  scoreArticleQuality,
  stableSeededOrder
};

export async function handleRequest(request, response) {
  try {
    const url = new URL(request.url || "/", `http://${request.headers.host}`);

    if (url.pathname === "/api/health") {
      return sendJson(response, { ok: true });
    }

    if (url.pathname === "/api/round" && request.method === "GET") {
      return sendJson(response, await createRound({
        startTitle: url.searchParams.get("start"),
        goalTitle: url.searchParams.get("goal"),
        seed: url.searchParams.get("seed")
      }));
    }

    if (url.pathname === "/api/daily-scores" && request.method === "GET") {
      return sendJson(response, await getDailyLeaderboard(url.searchParams.get("seed")));
    }

    if (url.pathname === "/api/daily-scores" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, await submitDailyScore(body), 201);
    }

    if (url.pathname === "/api/click" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, await handleClick(body));
    }

    return serveStatic(url.pathname, response);
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(response, { error: error.message || "Server error" }, status);
  }
}

export const app = createServer(handleRequest);
export default app;

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  app.listen(PORT, HOST, () => {
    console.log(`The Namuwiki Game is running at http://${HOST}:${PORT}`);
  });
}
