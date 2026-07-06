// 深度プロファイルSVG生成（scripts/build_logbook.py generate_depth_svg の移植）

const GRAPH_MAX_DEPTH    = 45;   // y軸固定: 0〜45m
const GRAPH_MAX_DURATION = 60;   // x軸固定: 0〜60分
const GRAPH_DEPTH_STEP   = 5;    // y軸目盛り間隔

export function generateDepthSvg(profile, avgDepth, warning, uid, durationMins = null) {
  if (!profile || profile.length < 2) return "";

  const W = 340, H = 145;
  const PL = 38, PR = 16, PT = 10, PB = 26;
  const pw = W - PL - PR;
  const ph = H - PT - PB;

  const yScale = GRAPH_MAX_DEPTH;
  const n = profile.length;
  const actualMins = Math.min(durationMins || 38, GRAPH_MAX_DURATION);

  const pts = profile.map((v, i) => [
    PL + (i / (n - 1) * actualMins / GRAPH_MAX_DURATION) * pw,
    PT + Math.min(v, yScale) / yScale * ph,
  ]);

  const lastX = pts[n - 1][0];
  const f1 = v => v.toFixed(1);
  const fillD = `M ${PL},${PT} ` + pts.map(([x, y]) => `L ${f1(x)},${f1(y)}`).join(" ") + ` L ${f1(lastX)},${PT} Z`;
  const lineD = `M ${f1(pts[0][0])},${f1(pts[0][1])} ` + pts.slice(1).map(([x, y]) => `L ${f1(x)},${f1(y)}`).join(" ");

  const depthLabels = [];
  for (let val = 0; val <= GRAPH_MAX_DEPTH; val += GRAPH_DEPTH_STEP) {
    const y = PT + val / yScale * ph;
    const major = val % 10 === 0;
    depthLabels.push(
      `<line x1="${PL}" y1="${f1(y)}" x2="${PL + pw}" y2="${f1(y)}" ` +
      `stroke="#3d6b8a" stroke-width="${major ? 0.6 : 0.3}" ` +
      `stroke-dasharray="${major ? "3,4" : "2,3"}" opacity="${major ? "0.35" : "0.18"}"/>`
    );
    if (major) {
      depthLabels.push(
        `<text x="${PL - 4}" y="${f1(y + 3)}" text-anchor="end" font-size="7" ` +
        `fill="#999988" font-family="monospace">${val}m</text>`
      );
    }
  }

  const timeLabels = [];
  for (let t = 0; t <= GRAPH_MAX_DURATION; t += 10) {
    const x = PL + (t / GRAPH_MAX_DURATION) * pw;
    timeLabels.push(
      `<line x1="${f1(x)}" y1="${PT}" x2="${f1(x)}" y2="${PT + ph}" ` +
      `stroke="#3d6b8a" stroke-width="0.3" stroke-dasharray="2,4" opacity="0.2"/>`,
      `<text x="${f1(x)}" y="${PT + ph + 14}" text-anchor="middle" font-size="7" ` +
      `fill="#999988" font-family="monospace">${t}m</text>`
    );
  }

  let avgLine = "";
  if (avgDepth) {
    const ay = PT + Math.min(avgDepth, yScale) / yScale * ph;
    avgLine =
      `<line x1="${PL}" y1="${f1(ay)}" x2="${PL + pw}" y2="${f1(ay)}" ` +
      `stroke="#8b3a1e" stroke-width="0.9" stroke-dasharray="3,3" opacity="0.6"/>` +
      `<text x="${PL + pw + 2}" y="${f1(ay + 3)}" font-size="6.5" fill="#8b3a1e" opacity="0.75" font-family="monospace">avg</text>`;
  }

  const deco = (warning || "").includes("DECO")
    ? `<text x="${PL + pw}" y="${PT + 6}" text-anchor="end" font-size="7.5" ` +
      `fill="#8b3a1e" font-family="monospace" font-weight="bold">⚠ DECO</text>`
    : "";

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="100%" style="display:block;">
  <defs>
    <linearGradient id="dg${uid}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#3d6b8a" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#1a3a50" stop-opacity="0.9"/>
    </linearGradient>
  </defs>
  <rect x="${PL}" y="${PT}" width="${pw}" height="${ph}" fill="#e8f0f5" opacity="0.3" rx="1"/>
  ${depthLabels.join("")}
  ${timeLabels.join("")}
  <path d="${fillD}" fill="url(#dg${uid})"/>
  <path d="${lineD}" fill="none" stroke="#deeaf3" stroke-width="1.4" stroke-linejoin="round"/>
  ${avgLine}
  ${deco}
</svg>`;
}
