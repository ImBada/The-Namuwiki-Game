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
- Track elapsed time, click count, difficulty, link counts, and the visited path.
- Filter sparse, namespace, sensitive, and goal subpage candidates for steadier rounds.

## Test

```sh
npm test
```

## Project Structure

- `server.js`: Node HTTP entrypoint. It routes `/api/*` requests and serves `public/`.
- `src/game.js`: round creation, click validation, article selection, signed round tokens, difficulty scoring, and NamuWiki document fetch/cache.
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

Deploy from the repository root with Vercel's default project settings. No build
command is required. Leave the Output Directory setting empty/default.

Optional environment variable:

- `ROUND_SECRET`: secret used to sign round-state tokens. A local development
  default is provided, but production deployments should set their own value.
- `ALLOW_SYNTHETIC_FALLBACK=1`: allows temporary synthetic articles when an
  upstream request is rejected with 403. This is enabled automatically on Vercel.

Document caching is persistent only when the deployment provides a writable data
directory. On platforms without durable writes, the app still keeps a bounded
in-memory cache for the current server process.

## Deploy to Railway

Railway containers do not keep normal app filesystem writes across redeploys.
Daily leaderboard data is stored in `daily-scores.json`, and fetched NamuWiki
documents are cached as Brotli-compressed files in `document-cache/`, so attach
a Railway Volume and point the app's data directory at the volume mount path:

1. In Railway, open the service and add a Volume.
2. Set the volume mount path to `/data`.
3. Add an environment variable: `DATA_DIR=/data`.
4. Redeploy the service.

If `DATA_DIR` is not set, the app also checks `RAILWAY_VOLUME_MOUNT_PATH`.
Without a persistent volume, rankings and document cache files can disappear
after commits, pushes, redeploys, or service restarts. The document cache keeps
using a 7-day TTL and defaults to 1000 entries; set `DOCUMENT_CACHE_MAX_ENTRIES`
to adjust the limit.

## Notes

NamuWiki pages indicate a CC BY-NC-SA 2.0 KR license. The app keeps attribution visible and should be operated as a non-commercial project unless separate permission is secured.
