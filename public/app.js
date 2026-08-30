const AGENTS = [
  { id: "conductor", name: "Conductor", role: "Routes the ticket" },
  { id: "scout", name: "Scout", role: "Probes live endpoints" },
  { id: "imager", name: "Imager", role: "Stills from text" },
  { id: "mover", name: "Mover", role: "Image → video" },
  { id: "browser", name: "Browser", role: "Live web brief" },
];

const rail = document.getElementById("rail");
const feed = document.getElementById("feed");
const catalogList = document.getElementById("catalogList");
const statusEl = document.getElementById("status");
const drop = document.getElementById("drop");
const stillInput = document.getElementById("still");
const preview = document.getElementById("preview");
const previewImg = document.getElementById("previewImg");
const previewName = document.getElementById("previewName");
const previewSize = document.getElementById("previewSize");
let stillFile = null;

function renderRail(active) {
  rail.innerHTML = AGENTS.map((a) => `
    <div class="agent ${a.id === active ? "active" : ""}">
      <div class="badge">${a.name[0]}</div>
      <div><h3>${a.name}</h3><p>${a.role}</p></div>
    </div>`).join("");
}

function kindFrom(prompt, imageUrl, hasFile) {
  const p = prompt.toLowerCase();
  if (hasFile || imageUrl || /(video|animate|clip|i2v|image[- ]to[- ]video)/.test(p)) return "video";
  if (/(discover|scan|catalog|endpoint|models?)/.test(p)) return "discover";
  if (/(image|picture|photo|illustration|render|draw|watercolor)/.test(p)) return "image";
  return "text";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function ticketCard(job) {
  const ev = (job.events || []).map((e) => `<li><strong>${e.agent}</strong> — ${e.text}</li>`).join("");
  const media = [
    job.imageUrl && job.videoUrl ? `<img alt="Start frame" src="${job.imageUrl}" />` : "",
    job.videoUrl ? `<video controls autoplay loop muted playsinline src="${job.videoUrl}"></video>` : (!job.videoUrl && job.imageUrl ? `<img alt="" src="${job.imageUrl}" />` : ""),
  ].join("");
  const remote = job.remoteVideoUrl ? `<p class="meta"><a href="${job.remoteVideoUrl}" target="_blank" rel="noopener">Generative I2V URL</a></p>` : "";
  return `<article class="ticket"><header><h4>${escapeHtml(job.prompt || "")}</h4><div class="meta">${escapeHtml(job.usedEndpoint || "")} · ${escapeHtml(job.usedModel || "")}</div></header>${media}${job.body ? `<p class="body">${escapeHtml(job.body)}</p>` : ""}${remote}<ul class="events">${ev}</ul></article>`;
}

function setStill(file) {
  if (!file || !file.type.startsWith("image/")) return;
  stillFile = file;
  previewImg.src = URL.createObjectURL(file);
  previewName.textContent = file.name;
  previewSize.textContent = `${Math.max(1, Math.round(file.size / 1024))} KB`;
  preview.hidden = false;
  drop.classList.add("has-file");
}

drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("hot"); });
drop.addEventListener("dragleave", () => drop.classList.remove("hot"));
drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("hot"); if (e.dataTransfer.files[0]) setStill(e.dataTransfer.files[0]); });
stillInput.addEventListener("change", () => { if (stillInput.files[0]) setStill(stillInput.files[0]); });
document.getElementById("clearStill").addEventListener("click", (e) => {
  e.preventDefault();
  stillFile = null;
  stillInput.value = "";
  preview.hidden = true;
  drop.classList.remove("has-file");
});

async function scan() {
  statusEl.textContent = "scanning…";
  try {
    const data = await (await fetch("/api/scan")).json();
    const live = (data.endpoints || []).filter((e) => e.status === "live").length;
    statusEl.textContent = `${live} live endpoints`;
    catalogList.innerHTML = (data.endpoints || []).map((e) => `<div class="ep"><strong><span class="dot ${e.status}"></span>${escapeHtml(e.name)}</strong><span>${escapeHtml(e.detail)}</span></div>`).join("");
  } catch {
    statusEl.textContent = "catalog unreachable";
  }
}

async function kenBurnsFromFile(file) {
  const img = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = 1280; canvas.height = 720;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(24);
  const mime = MediaRecorder.isTypeSupported("video/webm;codecs=vp9") ? "video/webm;codecs=vp9" : "video/webm";
  const rec = new MediaRecorder(stream, { mimeType: mime });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start();
  for (let i = 0; i < 96; i += 1) {
    const z = 1 + i * 0.0015;
    const scale = Math.max(canvas.width / img.width, canvas.height / img.height) * z;
    const w = img.width * scale, h = img.height * scale;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2 - i * 0.25, w, h);
    await new Promise((r) => setTimeout(r, 1000 / 24));
  }
  rec.stop();
  await new Promise((r) => { rec.onstop = r; });
  return URL.createObjectURL(new Blob(chunks, { type: mime }));
}

async function dispatch() {
  const typed = document.getElementById("prompt").value.trim();
  const imageUrl = document.getElementById("imageUrl").value.trim();
  const videoModel = document.getElementById("videoModel").value;
  const pollinationsKey = document.getElementById("key").value.trim();
  const prompt = typed || (stillFile || imageUrl ? "Slow cinematic push-in" : "");
  if (!prompt) return;
  const kind = kindFrom(prompt, imageUrl, Boolean(stillFile));
  renderRail(kind === "video" ? "mover" : "conductor");
  feed.insertAdjacentHTML("afterbegin", ticketCard({ prompt, events: [{ agent: "conductor", text: "Routing." }], usedEndpoint: "routing", usedModel: "…" }));
  try {
    const job = await (await fetch("/api/job", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, imageUrl, videoModel, pollinationsKey }),
    })).json();
    job.prompt = prompt;
    if (stillFile && kind === "video") {
      try {
        job.videoUrl = await kenBurnsFromFile(stillFile);
        job.events = (job.events || []).concat([{ agent: "mover", text: "Recorded a local 4s clip from the upload." }]);
      } catch (_) {}
    }
    feed.firstElementChild.outerHTML = ticketCard(job);
  } catch (err) {
    feed.firstElementChild.outerHTML = ticketCard({ prompt, body: String(err), events: [{ agent: "conductor", text: "Dispatch failed." }] });
  }
}

document.getElementById("go").addEventListener("click", dispatch);
renderRail("conductor");
scan();
