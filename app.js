// Lumen site: the window on the left follows the section you are reading,
// sections rise in as they arrive, and the upgrade check runs Lumen's own
// balance model on the parts catalogue (data.js).
document.documentElement.classList.add("js");

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Entrances: heading, then text, then picture, staggered.
const rise = [];
document.querySelectorAll(".read > h2, .read > .intro, .mod, .step, .shops li, .note, .check-side > *, .check-plate, .stats h2, .mosaic > *, .faq h2, .faq-text p").forEach((el) => {
  el.classList.add("rise");
  rise.push(el);
});
const groups = new Map();
for (const el of rise) {
  const p = el.parentElement;
  const i = groups.get(p) ?? 0;
  groups.set(p, i + 1);
  el.style.setProperty("--d", `${Math.min(i, 8) * 70}ms`);
}
const seen = new IntersectionObserver(
  (es) => es.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add("in");
      seen.unobserve(e.target);
    }
  }),
  { rootMargin: "0px 0px -10% 0px" },
);
rise.forEach((el) => seen.observe(el));

// The stage: show the pane for the section nearest the middle of the screen.
const win = document.querySelector(".win");
const steps = [...document.querySelectorAll(".step")];
const marks = [...document.querySelectorAll("[data-stage]")];
const pick = () => {
  const mid = innerHeight / 2;
  let best = null;
  let dist = Infinity;
  for (const m of marks) {
    const r = m.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) continue;
    const d = r.top <= mid && r.bottom >= mid ? 0 : Math.min(Math.abs(r.top - mid), Math.abs(r.bottom - mid));
    // Smaller blocks win when both contain the middle (a module inside a section).
    const score = d * 10000 + r.height;
    if (score < dist) {
      dist = score;
      best = m;
    }
  }
  if (best) win.dataset.state = best.dataset.stage;
  for (const s of steps) {
    const r = s.getBoundingClientRect();
    s.classList.toggle("on", r.top < mid && r.bottom > mid);
  }
};
let ticking = false;
addEventListener("scroll", () => {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(() => {
      pick();
      ticking = false;
    });
  }
}, { passive: true });
addEventListener("resize", pick);
pick();

// Upgrade check.
const gpuSel = document.getElementById("cp-gpu");
const cpuSel = document.getElementById("cp-cpu");
const fill = (sel, list, group, def) => {
  const byGroup = new Map();
  for (const it of list) {
    const g = group(it);
    if (!byGroup.has(g)) byGroup.set(g, []);
    byGroup.get(g).push(it);
  }
  for (const [g, items] of byGroup) {
    const og = document.createElement("optgroup");
    og.label = g;
    for (const it of items) {
      const o = document.createElement("option");
      o.value = it[0];
      o.textContent = it[1];
      og.append(o);
    }
    sel.append(og);
  }
  sel.value = def;
};
fill(gpuSel, GPUS, (g) => (/^RTX|^GTX/.test(g[1]) ? "NVIDIA" : /^Radeon/.test(g[1]) ? "AMD" : "Intel"), "rtx-3060");
fill(cpuSel, CPUS, (c) => c[4], "r5-5600");

let budget = 500;
const gpuCap = (cpu) => 1.2 * cpu - 15; // the GPU score a CPU can feed at 1440p (Lumen's balance model)
const perf = (cpu, gpu) => Math.min(gpu, gpuCap(cpu));
const gbp = (n) => `£${n.toLocaleString("en-GB")}`;
const shopUrl = {
  scan: (q) => `https://www.scan.co.uk/search?q=${encodeURIComponent(q).replace(/%20/g, "+")}`,
  ocuk: (q) => `https://www.overclockers.co.uk/search?sSearch=${encodeURIComponent(q).replace(/%20/g, "+")}`,
};
const shortName = (n) => n.replace(/^Radeon /, "RX ").replace(/^RX RX/, "RX");

function run() {
  const g = GPUS.find((x) => x[0] === gpuSel.value);
  const c = CPUS.find((x) => x[0] === cpuSel.value);
  const now = perf(c[2], g[2]);
  const used = Math.round(Math.min(1, gpuCap(c[2]) / g[2]) * 100);
  document.getElementById("cp-used").textContent = `${used}%`;
  const bar = document.getElementById("cp-bar");
  bar.style.width = `${used}%`;
  bar.classList.toggle("low", used < 85);

  // Best graphics card and best same-socket CPU within the budget.
  const gpuOpts = GPUS.filter((x) => x[3] != null && x[3] <= budget && x[2] > g[2])
    .map((x) => ({ name: x[1], price: x[3], gain: perf(c[2], x[2]) / now - 1 }))
    .filter((o) => o.gain >= 0.08)
    .sort((a, b) => b.gain - a.gain || a.price - b.price);
  const cpuOpts = CPUS.filter((x) => x[3] != null && x[3] <= budget && x[4] === c[4] && x[2] > c[2])
    .map((x) => ({ name: x[1], price: x[3], gain: perf(x[2], g[2]) / now - 1 }))
    .filter((o) => o.gain >= 0.08)
    .sort((a, b) => b.gain - a.gain || a.price - b.price);
  const bestGpu = gpuOpts[0];
  const bestCpu = cpuOpts[0];

  let verdict;
  if (used < 85) verdict = `Your ${c[1]} holds the ${g[1]} back. Upgrade the CPU first; a faster graphics card would be held back too.`;
  else if (gpuCap(c[2]) > g[2] * 1.4) verdict = `Your ${g[1]} is the limit, and your CPU has plenty of room for a much faster card.`;
  else verdict = `Your ${g[1]} is the limit. Your CPU can feed a somewhat faster card.`;
  document.getElementById("cp-verdict").textContent = verdict;

  const picks = [];
  const first = used < 85 ? [bestCpu, bestGpu] : [bestGpu, bestCpu];
  for (const o of first) if (o) picks.push(o);
  const box = document.getElementById("cp-pick");
  box.replaceChildren();
  if (!picks.length) {
    const p = document.createElement("p");
    p.className = "cp-opt";
    p.textContent = `Nothing under ${gbp(budget)} gives at least 8% more. Try a bigger budget.`;
    box.append(p);
  }
  for (const o of picks.slice(0, 2)) {
    const d = document.createElement("div");
    d.className = "cp-opt";
    d.innerHTML = `<b></b><span class="gain">+${Math.round(o.gain * 100)}%</span><small>about ${gbp(o.price)} · typical UK price</small>`;
    d.querySelector("b").textContent = o.name;
    box.append(d);
  }
  const top = picks[0]?.name ?? g[1];
  const [scan, ocuk] = document.querySelectorAll("#cp-shops a");
  scan.href = shopUrl.scan(shortName(top));
  ocuk.href = shopUrl.ocuk(shortName(top));
  scan.textContent = picks[0] ? `Search Scan for ${shortName(top)}` : "Search Scan";
  ocuk.textContent = picks[0] ? `Search Overclockers` : "Search Overclockers";
}

document.querySelectorAll("[data-budget]").forEach((b) =>
  b.addEventListener("click", () => {
    budget = Number(b.dataset.budget);
    document.querySelectorAll("[data-budget]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    run();
  }),
);
gpuSel.addEventListener("change", run);
cpuSel.addEventListener("change", run);
run();
