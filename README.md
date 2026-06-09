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

## Deploy to Vercel

The app is prepared for Vercel with:

- Static files served from `public/`.
- API requests routed through `api/index.js`.
- `vercel.json` rewrites for `/api/*` and the single-page app fallback.
- Signed round-state tokens, so `/api/click` does not depend on serverless
  instance memory.

Deploy from the repository root with Vercel's default project settings. No build
command is required.

Optional environment variable:

- `ROUND_SECRET`: secret used to sign round-state tokens. A local development
  default is provided, but production deployments should set their own value.

The document cache remains in memory. This is fine for a prototype, but production
traffic should move cached documents into persistent storage or a managed cache.

## Notes

NamuWiki pages indicate a CC BY-NC-SA 2.0 KR license. The app keeps attribution visible and should be operated as a non-commercial project unless separate permission is secured.
