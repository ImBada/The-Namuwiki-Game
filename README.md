# The Namuwiki Game

A small MVP for a NamuWiki-based link traversal game inspired by The Wiki Game.

## Run

```sh
npm start
```

Open `http://localhost:3000`.

## MVP Scope

- Create a round with a NamuWiki start article and goal article.
- Fetch and cache NamuWiki article metadata, sanitized article HTML, and internal article links.
- Render the current NamuWiki article body in the game view and rewrite playable wiki links.
- Let the player move only through links that exist on the current article.
- Track elapsed time, click count, link counts, and the visited path.
- Filter sparse, namespace, sensitive, and goal subpage candidates for steadier rounds.

## Test

```sh
npm test
```

## Project Structure

- `server.js`: Node HTTP entrypoint. It routes `/api/*` requests and serves `public/`.
- `src/game.js`: round creation, click validation, article selection, signed round tokens, round quality scoring, and NamuWiki document fetch/cache.
- `src/daily-scores.js`: daily challenge leaderboard persistence.
- `src/namu.js`: NamuWiki title normalization, article extraction, link filtering, and HTML sanitizing.
- `src/http.js` and `src/static.js`: small HTTP and static-file helpers.
- `public/`: browser UI. `app.js` owns app state/rendering, while `client-utils.js` and `wiki-dom.js` hold reusable helpers.
- `test/`: Node test runner coverage for NamuWiki parsing and round-quality logic.
- `docs/`: planning notes and roadmap.

## Deploy to Vercel

The app is prepared for Vercel with:

- Static files served from `public/` by `server.js`.
- Vercel routes all requests to `server.js`, which serves both static assets
  and `/api/*` JSON endpoints. There is no separate `api/` directory.
- Signed round-state tokens, so `/api/click` does not depend on serverless
  instance memory.
- Multiplayer room and signaling APIs are intentionally disabled on
  Vercel/serverless deployments. They use process-local `Map` state, which is
  not shared or durable across serverless invocations.

Deploy from the repository root with Vercel's default project settings. No build
command is required. Leave the Output Directory setting empty/default.

Environment variables:

- `ROUND_SECRET`: secret used to sign round-state tokens. A local development
  and test default is provided, but production or deployment environments must
  set their own value or the server will refuse to start.
- `ALLOW_SYNTHETIC_FALLBACK=1`: allows temporary synthetic articles when an
  upstream request is rejected with 403. This is enabled automatically on Vercel.

Document caching and generated daily challenge rounds are persistent only when
the deployment provides a writable data directory. On platforms without durable
writes, the app still keeps a bounded in-memory document cache for the current
server process, but a daily challenge may be regenerated after a restart.

## Deploy to Railway

Railway is the recommended deployment target when multiplayer is needed. Run a
single long-lived app instance for multiplayer, because room and signaling state
is stored in the Node process and is not shared across replicas or restarts.

Railway containers do not keep normal app filesystem writes across redeploys.
Daily challenge rounds are stored in `daily-rounds.json`, leaderboard data is
stored in `daily-scores.json`, and fetched NamuWiki documents are cached as
Brotli-compressed files in `document-cache/`, so attach a Railway Volume and
point the app's data directory at the volume mount path:

1. In Railway, open the service and add a Volume.
2. Set the volume mount path to `/data`.
3. Add an environment variable: `DATA_DIR=/data`.
4. Redeploy the service.

If `DATA_DIR` is not set, the app also checks `RAILWAY_VOLUME_MOUNT_PATH`.
Without a persistent volume, generated daily rounds, rankings, and document
cache files can disappear after commits, pushes, redeploys, or service
restarts. The document cache keeps using a 7-day TTL and defaults to 1000
entries; set `DOCUMENT_CACHE_MAX_ENTRIES` to adjust the limit.

## Notes

NamuWiki pages indicate a CC BY-NC-SA 2.0 KR license. The app keeps attribution visible and should be operated as a non-commercial project unless separate permission is secured.
