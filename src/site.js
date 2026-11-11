(() => {
  const $ = (id) => document.getElementById(id);

  // Theme switch. The choice is stored; the <head> applies it before paint.
  const themeButton = $("theme-toggle");
  if (themeButton) {
    const label = () => {
      themeButton.textContent = document.documentElement.dataset.theme === "night" ? "Paper" : "Night";
    };
    label();
    themeButton.addEventListener("click", () => {
      const night = document.documentElement.dataset.theme !== "night";
      if (night) document.documentElement.dataset.theme = "night";
      else delete document.documentElement.dataset.theme;
      try { localStorage.setItem("theme", night ? "night" : "paper"); } catch {}
      label();
    });
  }

  // Timeline expand
  const more = $("timeline-more");
  if (more) {
    more.addEventListener("click", () => {
      const open = $("timeline").classList.toggle("open");
      more.textContent = open ? "Show less" : "Full timeline";
      more.setAttribute("aria-expanded", open);
    });
  }

  // ---- The lab: a small model of my Postgres failover test ----
  const stage = $("lab-stage");
  if (!stage) return;

  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const CLIENTS = [{ x: 29, y: 86 }, { x: 29, y: 146 }, { x: 29, y: 206 }];
  const API_IN = { x: 104, y: 146 }, API_OUT = { x: 208, y: 146 };
  const PODS = [0, 1, 2].map((i) => ({ i, x: 280, y: 16 + i * 101, w: 132, h: 58, role: i === 0 ? "primary" : "replica" }));
  const anchor = (p) => ({ x: p.x, y: p.y + p.h / 2 });
  const FAILOVER_MS = 2000;   // matches the ~2 s gap I measured
  const REJOIN_MS = 4400;

  // Smooth S-curve between two points; the same maths moves the packets
  const curve = (a, b) => { const m = (a.x + b.x) / 2; return `M${a.x} ${a.y} C${m} ${a.y} ${m} ${b.y} ${b.x} ${b.y}`; };
  const at = (a, b, u) => {
    const m = (a.x + b.x) / 2, v = 1 - u;
    return { x: v * v * v * a.x + 3 * v * v * u * m + 3 * v * u * u * m + u * u * u * b.x,
             y: v * v * v * a.y + 3 * v * v * u * a.y + 3 * v * u * u * b.y + u * u * u * b.y };
  };

  CLIENTS.forEach((c) => el("path", { class: "wire live", d: curve(c, API_IN) }, $("lab-wires")));
  PODS.forEach((p) => { p.wire = el("path", { class: "wire", d: curve(API_OUT, anchor(p)) }, $("lab-wires")); });

  PODS.forEach((p) => {
    p.g = el("g", { class: "pod", tabindex: "-1" }, $("lab-pods"));
    el("rect", { x: p.x, y: p.y, width: p.w, height: p.h, rx: 12 }, p.g);
    el("circle", { class: "lead", cx: p.x + p.w - 14, cy: p.y + 14, r: 3.5 }, p.g);
    el("text", { class: "pname", x: p.x + p.w / 2, y: p.y + 26, "text-anchor": "middle" }, p.g).textContent = "postgres-" + (p.i + 1);
    p.label = el("text", { class: "lbl", x: p.x + p.w / 2, y: p.y + 44, "text-anchor": "middle" }, p.g);
    p.g.addEventListener("click", () => { if (p.role === "primary") kill(); });
    p.g.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && p.role === "primary") { e.preventDefault(); kill(); } });
  });

  const LABEL = { primary: "primary", replica: "replica", dead: "killed", electing: "electing" };
  let down = false, downAt = 0, retries = 0, lastDead = PODS[0];
  const primary = () => PODS.find((p) => p.role === "primary");

  function paint() {
    PODS.forEach((p) => {
      p.g.classList.remove("primary", "replica", "dead", "electing");
      p.g.classList.add(p.role);
      p.g.setAttribute("tabindex", p.role === "primary" ? "0" : "-1");
      p.label.textContent = LABEL[p.role];
      p.wire.setAttribute("class", "wire" + (p.role === "primary" ? " live" : ""));
    });
    $("lab-api-state").textContent = down ? "retrying" : "booking";
    $("lab-kill").disabled = down || PODS.some((p) => p.role === "dead");
  }

  function kill() {
    const p = primary();
    if (!p || down || $("lab-kill").disabled) return;
    down = true; downAt = performance.now(); lastDead = p;
    p.role = "dead";
    p.g.classList.add("hit");
    setTimeout(() => p.g.classList.remove("hit"), 340);
    PODS.forEach((q) => { if (q.role === "replica") q.role = "electing"; });
    $("lab-status").textContent = "Primary killed. Both replicas race for the leader lock.";
    paint();
    setTimeout(() => {
      const racers = PODS.filter((q) => q.role === "electing");
      const winner = racers[Math.floor(Math.random() * racers.length)];
      racers.forEach((q) => { q.role = q === winner ? "primary" : "replica"; });
      down = false;
      $("lab-gap").textContent = (FAILOVER_MS / 1000).toFixed(1) + " s";
      $("lab-status").textContent = "postgres-" + (winner.i + 1) + " won the lock. Every retry landed. No booking lost.";
      paint();
    }, FAILOVER_MS);
    setTimeout(() => {
      p.role = "replica";
      $("lab-status").textContent = "postgres-" + (p.i + 1) + " is back as a replica. Kill the new primary?";
      paint();
    }, REJOIN_MS);
  }
  $("lab-kill").addEventListener("click", kill);
  paint();

  if (reduced) return;   // no moving packets; kill and promote still work

  // Packets: client -> seat-api -> primary.
  // With no primary a packet tries the old address, fails, and tries again (amber).
  const pkts = [];
  const SPEED = { in: 1 / 520, out: 1 / 560, back: 1 / 300, try: 1 / 300 };
  const TRY_REACH = 0.42;
  let last = performance.now(), lastSpawn = 0;

  const fail = (k) => { retries++; $("lab-retries").textContent = retries; k.node.setAttribute("class", "pkt retry"); };
  const send = (k, pr) => { k.mode = "out"; k.pod = pr; k.a = API_OUT; k.b = anchor(pr); k.u = 0; k.dir = 1; k.node.setAttribute("class", "pkt"); };
  const retry = (k) => { fail(k); k.mode = "try"; k.a = API_OUT; k.b = anchor(lastDead); k.u = 0; k.dir = 1; };

  function frame(now) {
    const dt = Math.min(now - last, 250); last = now;
    if (now - lastSpawn > 300 && pkts.length < 36) {
      lastSpawn = now;
      pkts.push({ node: el("circle", { class: "pkt", r: 3.2 }, $("lab-pkts")), mode: "in", a: CLIENTS[Math.floor(Math.random() * 3)], b: API_IN, u: 0, dir: 1 });
    }
    if (down) $("lab-gap").textContent = ((now - downAt) / 1000).toFixed(1) + " s";
    const pr = primary();
    for (let n = pkts.length - 1; n >= 0; n--) {
      const k = pkts[n];
      if (k.mode === "out" && k.pod.role !== "primary") { fail(k); k.mode = "back"; k.dir = -1; }
      k.u += k.dir * dt * SPEED[k.mode];
      if (k.mode === "in" && k.u >= 1) { pr ? send(k, pr) : retry(k); }
      else if (k.mode === "out" && k.u >= 1) {
        const ring = el("circle", { class: "ack", cx: k.b.x, cy: k.b.y, r: 3 }, $("lab-pkts"));
        ring.addEventListener("animationend", () => ring.remove());
        k.node.remove(); pkts.splice(n, 1); continue;
      }
      else if (k.mode === "back" && k.u <= 0) { pr ? send(k, pr) : retry(k); }
      else if (k.mode === "try") {
        if (k.dir === 1 && k.u >= TRY_REACH) k.dir = -1;
        else if (k.dir === -1 && k.u <= 0) { pr ? send(k, pr) : retry(k); }
      }
      const pt = at(k.a, k.b, Math.max(0, Math.min(1, k.u)));
      k.node.setAttribute("cx", pt.x); k.node.setAttribute("cy", pt.y);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
