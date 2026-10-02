const $ = (id) => document.getElementById(id), radio = (n) => document.querySelector(`input[name=${n}]:checked`).value;
const video = $("webcam"), FRAMES = 5;
let stream = null, people = [], chosen = new Set(), queue = [], cur = -1, zoom = 1, split = false, edit = false, dragging = false, modelReady = false, working = false;

const toast = (m, e = false) => { $("toast").textContent = m; $("toast").classList.toggle("error", e); };
async function api(url, opts) {
  let r; try { r = await fetch(url, opts); } catch { throw new Error("Can't reach the server. Is it still running?"); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Server error (${r.status})`);
  return j;
}
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };

/* ---------- people ---------- */
async function loadPeople() {
  people = (await api("/api/persons")).persons;
  chosen = new Set([...chosen].filter((p) => people.includes(p)));
  if (!chosen.size) people.forEach((p) => chosen.add(p));
  const ul = $("people"); ul.replaceChildren();
  for (const p of people) {
    const li = el("li", chosen.has(p) ? "sel" : ""), t = el("div", "t"), n = el("b", "", p), tg = el("span", "tag", chosen.has(p) ? "Selected" : "Enrolled");
    n.append(tg); t.append(n, el("br"), el("small", "", "512-dim embedding"));
    const d = el("button", "x", "×"); d.title = d.ariaLabel = `Delete ${p}`;
    d.onclick = async (e) => { e.stopPropagation(); await api("/api/persons/" + encodeURIComponent(p), { method: "DELETE" }); loadPeople(); };
    li.onclick = () => { chosen.has(p) ? chosen.delete(p) : chosen.add(p); loadPeople(); };
    li.append(el("div", "av", p[0].toUpperCase()), t, d); ul.append(li);
  }
  $("count").textContent = `${people.length} Enrolled`; $("noPeople").classList.toggle("hidden", people.length > 0);
  $("clearBtn").classList.toggle("hidden", people.length < 2);
}
$("clearBtn").onclick = async () => { if (confirm("Delete every enrolled face?")) { await api("/api/persons", { method: "DELETE" }); loadPeople(); } };
const needsPeople = () => radio("target") === "except_person";
const pick = () => radio("target") === "person"; /* "Only selected people": choose faces by clicking boxes on the photo */
const goLabel = (it) => pick() ? (it?.sel.size ? `Anonymize ${it.sel.size} selected` : "Select faces on the photo") : it?.dirty ? `Apply to ${it.sel.size} selected` : "Anonymize active image";

async function enroll(fd) {
  const name = $("enrollName").value.trim();
  if (!name) { $("enrollName").focus(); toast("Enter an identity label first.", true); return false; }
  fd.append("name", name); toast("Learning face…");
  try { const j = await api("/api/enroll", { method: "POST", body: fd }); toast(`Enrolled ${j.person} from ${j.frames_used} frame(s).`); $("enrollName").value = ""; await loadPeople(); return true; }
  catch (e) { toast(e.message, true); return false; }
}
function stopCam() { stream?.getTracks().forEach((t) => t.stop()); stream = null; $("cam").classList.add("hidden"); $("dots").replaceChildren(); $("capBtn").disabled = false; }
const startCam = async () => {
  if (!$("enrollName").value.trim()) { $("enrollName").focus(); return toast("Enter an identity label first.", true); }
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640 } }); video.srcObject = stream;
    $("camMsg").textContent = "Centre your face in the oval, then press Capture."; $("cam").classList.remove("hidden"); $("capBtn").focus(); toast("");
  } catch (e) { toast("Camera unavailable: " + e.message + ". Use http://localhost or HTTPS and allow access.", true); }
};
/* First-use guide: explains enrol -> select -> "Everyone except selected" before the webcam/upload step */
let guideNext = null;
const guideSeen = () => { try { return localStorage.getItem("maskit_guide") === "1"; } catch { return false; } };
function withGuide(fn) { if (guideSeen()) return fn(); guideNext = fn; $("guide").classList.remove("hidden"); $("guideOk").focus(); }
function closeGuide(go) {
  $("guide").classList.add("hidden");
  if ($("guideSkip").checked) { try { localStorage.setItem("maskit_guide", "1"); } catch {} }
  const fn = guideNext; guideNext = null; if (go && fn) fn();
}
$("guideOk").onclick = () => closeGuide(true); $("guideNo").onclick = $("guideX").onclick = () => closeGuide(false);
$("guide").onclick = (e) => { if (e.target === $("guide")) closeGuide(false); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("guide").classList.contains("hidden")) closeGuide(false); });
$("camBtn").onclick = () => withGuide(startCam);
let sampleOk = false;
$("sampleLbl").addEventListener("click", (e) => {
  if (sampleOk) { sampleOk = false; return; }
  if (guideSeen()) return;
  e.preventDefault(); withGuide(() => { sampleOk = true; $("sampleInput").click(); });
});
$("sampleLbl").onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); $("sampleLbl").click(); } };
$("camX").onclick = stopCam;
$("cam").onclick = (e) => { if (e.target === $("cam")) stopCam(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && stream) stopCam(); });
$("capBtn").onclick = async () => {
  const dots = $("dots"), fd = new FormData(); dots.innerHTML = "<i></i>".repeat(FRAMES); $("capBtn").disabled = true; $("camMsg").textContent = "Hold still and turn slightly between shots…";
  for (let i = 0; i < FRAMES; i++) {
    const c = el("canvas"); c.width = video.videoWidth; c.height = video.videoHeight; c.getContext("2d").drawImage(video, 0, 0);
    fd.append("files", await new Promise((r) => c.toBlob(r, "image/jpeg", 0.9)), `f${i}.jpg`); dots.children[i].className = "f"; await new Promise((r) => setTimeout(r, 450));
  }
  $("camMsg").textContent = "Learning face…";
  if (await enroll(fd)) stopCam();
  else { $("camMsg").textContent = $("toast").textContent + " Try again."; dots.replaceChildren(); $("capBtn").disabled = false; }
};
$("sampleInput").onchange = async (e) => { const f = e.target.files[0]; e.target.value = ""; if (!f) return; const fd = new FormData(); fd.append("files", f); await enroll(fd); };

/* ---------- queue ---------- */
function addFiles(list) {
  let first = -1;
  for (const f of list) {
    if (!f.type.startsWith("image/")) { toast(`${f.name} isn't an image.`, true); continue; }
    if (f.size > 15 * 1048576) { toast(`${f.name} is over 15 MB.`, true); continue; }
    const dup = queue.findIndex((q) => q.file.name === f.name && q.file.size === f.size && q.file.lastModified === f.lastModified);
    if (dup >= 0) { if (first < 0) first = dup; toast(`${f.name} is already in the queue.`); continue; }
    queue.push({ file: f, url: URL.createObjectURL(f), res: null, sel: new Set(), dirty: false }); if (first < 0) first = queue.length - 1;
  }
  if (first >= 0) select(first);
}
function renderQueue() {
  $("qN").textContent = `(${queue.length})`; const q = $("q"); q.replaceChildren();
  queue.forEach((it, i) => {
    const w = el("div", "qw"), b = el("button", "qi" + (i === cur ? " act" : "") + (it.res ? " done" : "")); b.style.backgroundImage = `url(${it.url})`; b.ariaLabel = it.file.name;
    b.append(el("i"), el("b", "", "#" + String(i + 1).padStart(2, "0"))); b.onclick = () => select(i);
    const x = el("button", "qx", "×"); x.title = x.ariaLabel = `Remove ${it.file.name}`; x.onclick = (e) => { e.stopPropagation(); removeItem(i); };
    w.append(b, x); q.append(w);
  });
  const add = el("button", "qi", "+"); add.ariaLabel = "Add photos"; add.onclick = () => $("moreInput").click(); q.append(add);
  $("exportBtn").disabled = !queue.length;
}
function clearStage() {
  cur = -1; clearTimeout(liveT); livePending = false; split = edit = false; scan(false);
  $("frame").classList.add("hidden"); $("drop").classList.remove("hidden"); $("img").removeAttribute("src"); $("orig").removeAttribute("src"); $("boxes").replaceChildren();
  $("fname").textContent = "No image"; ["dims", "found", "rmBtn", "stageX", "hint"].forEach((id) => $(id).classList.add("hidden"));
  $("goBtn").disabled = $("copyBtn").disabled = true; $("goBtn").textContent = "Anonymize active image"; $("dlBtn").classList.add("disabled");
  $("splitBtn").disabled = $("editBtn").disabled = true; toast(""); renderQueue();
}
function removeItem(i) {
  if (working) return toast("Wait for the current run to finish, then remove the photo.", true);
  const it = queue[i]; if (!it) return;
  URL.revokeObjectURL(it.url); queue.splice(i, 1);
  if (!queue.length) return clearStage();
  if (i === cur) select(Math.min(i, queue.length - 1));
  else { if (i < cur) cur--; renderQueue(); }
  toast(`Removed ${it.file.name}.`);
}
$("rmBtn").onclick = $("stageX").onclick = () => removeItem(cur);
function select(i) {
  cur = i; const it = queue[i]; renderQueue();
  $("drop").classList.add("hidden"); $("frame").classList.remove("hidden"); $("rmBtn").classList.remove("hidden"); $("stageX").classList.remove("hidden"); $("fname").textContent = it.file.name;
  $("orig").src = it.url; $("goBtn").disabled = false;
  const im = new Image(); im.onload = () => { $("dims").textContent = `${im.naturalWidth} × ${im.naturalHeight} px`; $("dims").classList.remove("hidden"); }; im.src = it.url;
  show(it);
  if (pick() && !it.res) detect(it);
}
function show(it) {
  const r = it.res; $("img").src = r ? r.image + "?t=" + Date.now() : it.url;
  $("boxes").replaceChildren();
  $("found").classList.toggle("hidden", !r); $("dlBtn").classList.toggle("disabled", !r); $("copyBtn").disabled = !r;
  if (r) { $("dlBtn").href = r.image; $("dlBtn").download = "masked_" + it.file.name.replace(/\.\w+$/, "") + ".jpg"; $("found").textContent = `${r.faces_hidden} of ${r.faces_found} faces hidden`; }
  $("goBtn").textContent = goLabel(it);
  r?.faces.forEach((f, i) => {
    const [x1, y1, x2, y2] = f.box, b = el("button", "fbox" + (it.sel.has(i) ? " on" : ""));
    Object.assign(b.style, { left: x1 / r.width * 100 + "%", top: y1 / r.height * 100 + "%", width: (x2 - x1) / r.width * 100 + "%", height: (y2 - y1) / r.height * 100 + "%" });
    const named = f.info.startsWith("Matches") ? f.info.replace(/^Matches /, "").replace(/ \(.*/, "") : "";
    b.append(el("span", "", `${named || "Face #" + String(i + 1).padStart(2, "0")} ${f.conf}%`));
    b.title = f.info + ` · ${f.gender}, ~${f.age}`; b.ariaLabel = `Face ${i + 1}: ${f.info}. ${it.sel.has(i) ? "Hidden" : "Visible"}`;
    b.onclick = () => { it.sel.has(i) ? it.sel.delete(i) : it.sel.add(i); it.dirty = true; b.classList.toggle("on"); $("goBtn").textContent = goLabel(it); };
    $("boxes").append(b);
  });
  applyView();
}

/* ---------- process ---------- */
async function detect(it) { /* find faces without masking anything, so the user can click the ones to hide */
  it.sel = new Set(); it.dirty = false; busy(true, "Finding faces…"); $("goBtn").disabled = true; toast("");
  try { await run(it, true); if (queue[cur] === it) { split = false; edit = true; show(it); if (!it.res.faces_found) toast("No faces found. Try lowering the confidence threshold.", true); } }
  catch (e) { toast(e.message, true); }
  busy(false); $("goBtn").disabled = false;
}
async function run(it, manual) {
  if (needsPeople() && !chosen.size) throw new Error("Enroll and select at least one person for this scope.");
  const fd = new FormData();
  fd.append("file", it.file); fd.append("effect", radio("effect")); fd.append("target", pick() ? "all" : radio("target"));
  fd.append("intensity", $("intensity").value); fd.append("margin", $("margin").value); fd.append("feather", $("feather").checked); fd.append("min_conf", $("conf").value);
  chosen.forEach((p) => fd.append("persons", p)); if (manual || pick()) fd.append("override", JSON.stringify([...it.sel]));
  it.res = await api("/api/process", { method: "POST", body: fd }); modelReady = true;
  it.sel = new Set(it.res.faces.flatMap((f, i) => (f.hidden ? [i] : []))); it.dirty = false;
  
}
function busy(on, title = "Scanning faces…", msg) {
  working = on;
  $("scanLine").classList.toggle("hidden", !on); $("frame").classList.toggle("scanning", on); $("wait").classList.toggle("hidden", !on);
  $("goBtn").classList.toggle("loading", on);
  if (on) { $("waitTitle").textContent = title; $("waitMsg").textContent = msg || (modelReady ? "Detecting faces and applying your mask." : "First run loads the AI model. This can take up to a minute."); $("goBtn").textContent = "Processing…"; }
  else { $("goBtn").textContent = goLabel(queue[cur]); }
}
$("goBtn").onclick = async () => {
  const it = queue[cur];
  if (pick() && !it.sel.size) return toast("Click a face box on the photo to choose who to mask, then press Anonymize.", true);
  busy(true); $("goBtn").disabled = true; toast("");
  try { const manual = it.dirty || pick(); await run(it, manual); if (!manual) { split = true; edit = false; } toast(it.res.faces_found ? "" : "No faces found. Try lowering the confidence threshold."); renderQueue(); show(it); }
  catch (e) { toast(e.message, true); }
  busy(false); $("goBtn").disabled = false;
};
$("exportBtn").onclick = async () => {
  if (!window.JSZip) return toast("The zip library didn't load (needs internet once). Download photos individually instead.", true);
  busy(true, "Exporting photos…", "Processing your queue."); const zip = new JSZip();
  try {
    for (const [i, it] of queue.entries()) {
      if (!it.res) { $("waitMsg").textContent = `Photo ${i + 1} of ${queue.length}`; await run(it, false); }
      zip.file(`masked_${it.file.name.replace(/\.\w+$/, "")}.jpg`, await (await fetch(it.res.image)).blob());
    }
    const a = el("a"); a.href = URL.createObjectURL(await zip.generateAsync({ type: "blob" })); a.download = "maskit-export.zip"; a.click(); toast("Export ready."); renderQueue(); show(queue[cur]);
  } catch (e) { toast(e.message, true); }
  busy(false);
};
$("copyBtn").onclick = async () => {
  try { const blob = await (await fetch(queue[cur].res.image)).blob(); const png = await createImageBitmap(blob).then((b) => { const c = el("canvas"); c.width = b.width; c.height = b.height; c.getContext("2d").drawImage(b, 0, 0); return new Promise((r) => c.toBlob(r, "image/png")); });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]); toast("Copied to clipboard."); } catch { toast("Your browser blocked clipboard access. Use Download instead.", true); }
};

/* ---------- view + controls ---------- */
const setZoom = (z) => { zoom = Math.min(3, Math.max(0.3, z)); $("frame").style.zoom = zoom; $("zV").textContent = Math.round(zoom * 100) + "%"; };
$("zIn").onclick = () => setZoom(zoom + 0.2); $("zOut").onclick = () => setZoom(zoom - 0.2); $("zReset").onclick = () => setZoom(1);
function applyView() {
  const r = queue[cur]?.res, cmp = !!(split && r), ed = !!(edit && r), p = $("splitR").value;
  ["orig", "divider", "tagO", "tagM"].forEach((id) => $(id).classList.toggle("hidden", !cmp));
  $("orig").style.clipPath = `inset(0 ${100 - p}% 0 0)`; $("divider").style.left = p + "%"; $("frame").classList.toggle("cmp", cmp);
  $("boxes").classList.toggle("hidden", !ed); $("hint").classList.toggle("hidden", !(ed && r.faces_found));
  $("hint").textContent = pick() ? "Click the faces you want to hide (they turn amber), then press Anonymize." : "Click a face box to hide or keep it, then press “Apply to selected”.";
  $("splitBtn").classList.toggle("on", cmp); $("editBtn").classList.toggle("on", ed); $("splitBtn").disabled = $("editBtn").disabled = !r;
}
$("splitBtn").onclick = () => { split = !split; if (split) edit = false; applyView(); };
$("editBtn").onclick = () => { edit = !edit; if (edit) split = false; applyView(); };
const drag = (e) => { const b = $("frame").getBoundingClientRect(); $("splitR").value = Math.min(100, Math.max(0, ((e.clientX - b.left) / b.width) * 100)); applyView(); };
$("frame").addEventListener("pointerdown", (e) => { if (split && queue[cur]?.res) { e.preventDefault(); dragging = true; $("frame").setPointerCapture(e.pointerId); drag(e); } });
$("frame").addEventListener("pointermove", (e) => dragging && drag(e));
["pointerup", "pointercancel"].forEach((ev) => $("frame").addEventListener(ev, () => (dragging = false)));
const bind = (id, out, fmt) => ($(id).oninput = () => ($(out).textContent = fmt($(id).value)));
bind("intensity", "intV", (v) => v + "%"); bind("margin", "marV", (v) => "+" + v + "%");
document.querySelectorAll("input[name=target]").forEach((i) => (i.onchange = () => {
  if (needsPeople() && !people.length) toast("Enroll someone first to use this scope.", true);
  const it = queue[cur]; if (!it || working) return;
  if (pick()) detect(it); else { it.sel = new Set(); it.dirty = false; edit = false; show(it); }
}));

for (const [lbl, inp] of [["drop", "photoInput"], ["more", "moreInput"]]) {
  const L = $(lbl), I = $(inp);
  I.onchange = () => { addFiles(I.files); I.value = ""; };
  L.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); I.click(); } };
  L.ondragover = (e) => { e.preventDefault(); L.classList.add("over"); }; L.ondragleave = () => L.classList.remove("over");
  L.ondrop = (e) => { e.preventDefault(); e.stopPropagation(); L.classList.remove("over"); addFiles(e.dataTransfer.files); };
}
$("stage").ondragover = (e) => e.preventDefault(); $("stage").ondrop = (e) => { e.preventDefault(); addFiles(e.dataTransfer.files); };
/* Look controls re-render the processed photo live */
let liveT = null, liveBusy = false, livePending = false;
async function live() {
  const it = queue[cur]; if (!it?.res) return;
  if (liveBusy) { livePending = true; return; }
  liveBusy = true; toast("Updating preview…");
  try { await run(it, true); if (queue[cur] === it) { show(it); await $("img").decode().catch(() => {}); } toast(""); } catch (e) { toast(e.message, true); }
  liveBusy = false; if (livePending) { livePending = false; return live(); } scan(false);
}
const scan = (on) => { $("scanLine").classList.toggle("hidden", !on); $("frame").classList.toggle("scanning", on); };
const liveSoon = () => { if (!queue[cur]?.res) return; scan(true); clearTimeout(liveT); liveT = setTimeout(live, 400); };
["intensity", "margin"].forEach((id) => $(id).addEventListener("input", liveSoon));
$("feather").addEventListener("change", liveSoon);
document.querySelectorAll("input[name=effect]").forEach((i) => i.addEventListener("change", liveSoon));
renderQueue(); loadPeople().catch((e) => toast(e.message, true));

/* While a file is being dragged over the window, let the drop area (not the 3D iframe) receive it */
{ let dc = 0; const on = (v) => document.body.classList.toggle("filedrag", v);
  document.addEventListener("dragenter", (e) => { if (e.dataTransfer?.types?.includes("Files")) { dc++; on(true); } });
  document.addEventListener("dragleave", () => { dc = Math.max(0, dc - 1); if (!dc) on(false); });
  document.addEventListener("drop", () => { dc = 0; on(false); });
  document.addEventListener("dragend", () => { dc = 0; on(false); }); }