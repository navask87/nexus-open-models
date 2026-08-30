const UA = "NexusWorkbench/1.0";
const VIDEO_MODELS = [
  { id: "wan", vendor: "Alibaba" },
  { id: "wan-fast", vendor: "Alibaba" },
  { id: "p-video", vendor: "Pruna" },
  { id: "seedance-2.0-mini", vendor: "ByteDance" },
  { id: "grok-imagine-video-1.5", vendor: "xAI" },
];

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
}
function json(res, code, payload) {
  cors(res);
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
function bearer(req) {
  const raw = req.headers.authorization || "";
  if (raw.toLowerCase().startsWith("bearer ")) return raw.slice(7).trim() || null;
  return process.env.POLLINATIONS_API_KEY || null;
}
function pathOf(req) {
  const url = new URL(req.url, "http://localhost");
  const routed = url.searchParams.get("route");
  if (routed) return routed.replace(/\/+$/, "") || "/";
  return url.pathname.replace(/\/+$/, "") || "/";
}
async function readBody(req) {
  const ctype = String(req.headers["content-type"] || "");
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks);
  if (!raw.length) return {};
  if (ctype.includes("application/json")) {
    try { return JSON.parse(raw.toString("utf8")); } catch { return {}; }
  }
  if (ctype.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw.toString("utf8")));
  }
  return {};
}
function stillUrl(prompt) {
  const q = encodeURIComponent(String(prompt).slice(0, 220));
  return `https://image.pollinations.ai/prompt/${q}?model=sana&width=1024&height=1024&nologo=true&seed=${Date.now() % 99999}`;
}
function videoUrl(prompt, image, model, key) {
  const q = encodeURIComponent(String(prompt).slice(0, 220));
  const params = new URLSearchParams({ model: model || "wan", duration: "4", image, audio: "false" });
  if (key) params.set("key", key);
  return `https://gen.pollinations.ai/video/${q}?${params}`;
}
async function fetchText(url, headers = {}, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA, ...headers }, signal: ctrl.signal });
    return { ok: res.ok, status: res.status, text: await res.text() };
  } finally { clearTimeout(t); }
}
async function scanNetwork() {
  const endpoints = [];
  const add = (name, url, status, detail, models = []) => endpoints.push({ name, url, status, detail, models });
  try {
    const r = await fetchText("https://image.pollinations.ai/models");
    const models = r.ok ? JSON.parse(r.text) : [];
    add("Pollinations Image", "https://image.pollinations.ai", r.ok ? "live" : "down", "GET /prompt/{text}", Array.isArray(models) ? models : []);
  } catch (e) {
    add("Pollinations Image", "https://image.pollinations.ai", "down", String(e).slice(0, 120));
  }
  try {
    const r = await fetchText("https://gen.pollinations.ai/v1/models");
    const ids = [];
    const catalog = r.ok ? JSON.parse(r.text) : { data: [] };
    for (const m of catalog.data || []) {
      const outs = m.output_modalities || [];
      const ins = m.input_modalities || [];
      if (outs.includes("video") && ins.includes("image")) ids.push(m.id);
    }
    add("Pollinations Video (I2V)", "https://gen.pollinations.ai/video/{prompt}", ids.length ? "live" : "auth", "Image-to-video", ids.slice(0, 24));
  } catch (e) {
    add("Pollinations Video (I2V)", "https://gen.pollinations.ai/video/{prompt}", "auth", String(e).slice(0, 120), VIDEO_MODELS.map((m) => m.id));
  }
  add("Nexus Mover", "/v1/videos", "live", "Pollinations I2V URL from a still + prompt", ["wan"]);
  return { ok: true, scannedAt: Date.now(), endpoints };
}
function classify(prompt, hasImage) {
  const p = String(prompt || "").toLowerCase();
  if (hasImage || /(video|animate|clip|i2v)/.test(p)) return "video";
  if (/(discover|scan|catalog|endpoint|models?)/.test(p)) return "discover";
  if (/(image|picture|photo|illustration|render|draw|watercolor)/.test(p)) return "image";
  return "text";
}

module.exports = async (req, res) => {
  cors(res);
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  const path = pathOf(req);
  const key = bearer(req);
  if (req.method === "GET" && (path === "/api/nexus" || path === "/v1" || path === "/api")) {
    return json(res, 200, {
      name: "Nexus Open Models API", version: "v1", host: "Vercel",
      endpoints: {
        "GET /v1": "Index", "GET /v1/models": "Catalog", "GET /v1/network": "Health",
        "POST /v1/chat/completions": "Chat", "POST /v1/images/generations": "Stills",
        "POST /v1/videos": "I2V", "POST /v1/run": "Router",
      },
    });
  }
  if (req.method === "GET" && (path === "/v1/models" || path.endsWith("/models"))) {
    const scan = await scanNetwork();
    const now = Math.floor(Date.now() / 1000);
    const data = [
      { id: "sana", object: "model", created: now, owned_by: "pollinations", capabilities: ["image"] },
      { id: "openai", object: "model", created: now, owned_by: "pollinations", capabilities: ["chat"] },
      ...VIDEO_MODELS.map((m) => ({ id: m.id, object: "model", created: now, owned_by: m.vendor, capabilities: ["video"] })),
    ];
    return json(res, 200, { object: "list", data, network: scan.endpoints });
  }
  if (req.method === "GET" && (path === "/v1/network" || path === "/api/scan" || path.endsWith("/network") || path.endsWith("/scan"))) {
    return json(res, 200, await scanNetwork());
  }
  if (req.method === "GET" && path.endsWith("/video-models")) {
    return json(res, 200, { models: VIDEO_MODELS });
  }
  if (req.method !== "POST") return json(res, 404, { error: "unknown route", path });

  const fields = await readBody(req);
  const prompt = String(fields.prompt || fields.input || "").trim();
  const imageUrl = String(fields.image_url || fields.imageUrl || "").trim() || null;
  const model = String(fields.model || fields.videoModel || "wan").trim();
  const token = fields.pollinationsKey || key;

  if (path.includes("/chat")) {
    const messages = fields.messages || [];
    const parts = messages.map((m) => `${m.role || "user"}: ${typeof m.content === "string" ? m.content : ""}`);
    const textPrompt = prompt || parts.join("\n");
    if (!textPrompt) return json(res, 400, { error: { message: "messages or prompt required" } });
    const q = encodeURIComponent(textPrompt.slice(0, 4000));
    const headers = { Accept: "text/plain" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetchText(`https://text.pollinations.ai/${q}?model=openai`, headers, 45000);
    if (!r.ok) return json(res, 502, { error: { message: `HTTP ${r.status}`, type: "upstream_error" } });
    return json(res, 200, {
      id: `chatcmpl-nexus-${Date.now()}`, object: "chat.completion",
      created: Math.floor(Date.now() / 1000), model: "openai",
      choices: [{ index: 0, message: { role: "assistant", content: r.text }, finish_reason: "stop" }],
    });
  }
  if (path.includes("/images")) {
    if (!prompt) return json(res, 400, { error: { message: "prompt required" } });
    return json(res, 200, { created: Math.floor(Date.now() / 1000), data: [{ url: stillUrl(prompt) }], model: "sana" });
  }
  if (path.includes("/videos") || path.endsWith("/job") || path.endsWith("/run")) {
    const kind = classify(prompt, Boolean(imageUrl));
    if (kind === "discover" || !prompt) {
      const scan = await scanNetwork();
      return json(res, 200, {
        ok: true, kind: "discover",
        body: scan.endpoints.map((e) => `${e.status} ${e.name} — ${e.detail}`).join("\n"),
        endpoints: scan.endpoints, usedEndpoint: "Scout", usedModel: "live probe",
        events: [{ agent: "scout", text: `Probed ${scan.endpoints.length} endpoints.` }],
      });
    }
    if (kind === "image") {
      return json(res, 200, {
        ok: true, kind: "image", imageUrl: stillUrl(prompt),
        usedEndpoint: "Pollinations · sana", usedModel: "sana",
        events: [{ agent: "imager", text: "Sana still queued." }],
      });
    }
    const frame = imageUrl || stillUrl(prompt || "cinematic still");
    const remote = videoUrl(prompt || "slow cinematic push-in", frame, model, token);
    return json(res, 200, {
      ok: true, kind: "video", imageUrl: frame, videoUrl: remote, remoteVideoUrl: remote,
      usedEndpoint: "Pollinations I2V", usedModel: model,
      events: [{ agent: "mover", text: "Built a Pollinations video URL." }],
    });
  }
  return json(res, 404, { error: "unknown route", path });
};
