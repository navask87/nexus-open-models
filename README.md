# Nexus — open-model swarm

Workbench plus a public `/v1` API in front of free image, chat, and image-to-video endpoints.

## Deploy on Vercel

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/navask87/nexus-open-models)

```bash
npx vercel
```

Set `POLLINATIONS_API_KEY` in the Vercel project for chat and generative I2V.

## After deploy

Replace `https://YOUR-PROJECT.vercel.app` with the URL Vercel prints.

| What | Address |
| --- | --- |
| UI | `https://YOUR-PROJECT.vercel.app/` |
| Docs | `https://YOUR-PROJECT.vercel.app/docs` |
| API index | `https://YOUR-PROJECT.vercel.app/v1` |
| Models | `https://YOUR-PROJECT.vercel.app/v1/models` |
| Network scan | `https://YOUR-PROJECT.vercel.app/v1/network` |
| Chat | `POST https://YOUR-PROJECT.vercel.app/v1/chat/completions` |
| Images | `POST https://YOUR-PROJECT.vercel.app/v1/images/generations` |
| Video | `POST https://YOUR-PROJECT.vercel.app/v1/videos` |
| Router | `POST https://YOUR-PROJECT.vercel.app/v1/run` |

```bash
curl https://YOUR-PROJECT.vercel.app/v1/models

curl -X POST https://YOUR-PROJECT.vercel.app/v1/images/generations \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"watercolor radio telescope at dusk"}'
```

Vercel has no ffmpeg disk. Video returns a Pollinations I2V URL. An uploaded still is animated in the browser.
