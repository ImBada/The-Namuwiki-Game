import { createServer } from "node:http";
import { pathToFileURL } from "node:url";
import {
  createRound,
  estimateDifficulty,
  handleClick,
  handleRewind,
  scoreArticleQuality
} from "./src/game.js";
import { getDailyLeaderboard, submitDailyScore } from "./src/daily-scores.js";
import { readJsonBody, sendJson } from "./src/http.js";
import {
  addMultiplayerSignal,
  createMultiplayerRoom,
  getMultiplayerRoom,
  joinMultiplayerRoom,
  readMultiplayerSignals
} from "./src/multiplayer.js";
import { serveStatic } from "./src/static.js";

const PORT = Number.parseInt(process.env.PORT || "3000", 10);
const HOST = process.env.HOST || (process.env.PORT ? "0.0.0.0" : "127.0.0.1");

export {
  estimateDifficulty,
  scoreArticleQuality
};

export async function handleRequest(request, response) {
  try {
    const forwardedProto = Array.isArray(request.headers["x-forwarded-proto"])
      ? request.headers["x-forwarded-proto"][0]
      : request.headers["x-forwarded-proto"];
    const protocol = String(forwardedProto || "http").split(",", 1)[0].trim() || "http";
    const url = new URL(request.url || "/", `${protocol}://${request.headers.host}`);

    if (url.pathname === "/api/health") {
      return sendJson(response, { ok: true });
    }

    if (url.pathname === "/api/round" && request.method === "GET") {
      return sendJson(response, await createRound({
        startTitle: url.searchParams.get("start"),
        goalTitle: url.searchParams.get("goal"),
        dailyChallenge: url.searchParams.get("daily") === "1"
      }));
    }

    if (url.pathname === "/api/daily-scores" && request.method === "GET") {
      return sendJson(response, await getDailyLeaderboard());
    }

    if (url.pathname === "/api/daily-scores" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, await submitDailyScore(body), 201);
    }

    if (url.pathname === "/api/multiplayer/rooms" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, createMultiplayerRoom(body), 201);
    }

    const multiplayerRoomMatch = url.pathname.match(/^\/api\/multiplayer\/rooms\/([A-Za-z0-9]{5})$/);
    if (multiplayerRoomMatch && request.method === "GET") {
      return sendJson(
        response,
        getMultiplayerRoom(
          multiplayerRoomMatch[1],
          url.searchParams.get("peerId") || "",
          readPeerSecret(request)
        )
      );
    }

    if (multiplayerRoomMatch && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, joinMultiplayerRoom(multiplayerRoomMatch[1], body), 201);
    }

    const multiplayerSignalMatch = url.pathname.match(
      /^\/api\/multiplayer\/rooms\/([A-Za-z0-9]{5})\/signals$/
    );
    if (multiplayerSignalMatch && request.method === "GET") {
      return sendJson(
        response,
        readMultiplayerSignals(
          multiplayerSignalMatch[1],
          url.searchParams.get("peerId") || "",
          readPeerSecret(request),
          url.searchParams.get("after") || "0"
        )
      );
    }

    if (multiplayerSignalMatch && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(
        response,
        addMultiplayerSignal(multiplayerSignalMatch[1], {
          ...body,
          peerSecret: readPeerSecret(request)
        }),
        201
      );
    }

    if (url.pathname === "/api/click" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, await handleClick(body));
    }

    if (url.pathname === "/api/rewind" && request.method === "POST") {
      const body = await readJsonBody(request);
      return sendJson(response, await handleRewind(body));
    }

    return serveStatic(url, response);
  } catch (error) {
    const status = error.statusCode || 500;
    sendJson(response, { error: error.message || "Server error" }, status);
  }
}

export const app = createServer(handleRequest);
export default app;

function readPeerSecret(request) {
  const header = request.headers["x-peer-secret"];
  const headerValue = Array.isArray(header) ? header[0] : header;
  return String(headerValue || "");
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  app.listen(PORT, HOST, () => {
    console.log(`The Namuwiki Game is running at http://${HOST}:${PORT}`);
  });
}
