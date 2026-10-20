import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = process.env.GEN_OUT || path.join(ROOT, "assets", "generated");

const LOGIN = process.env.PROFILE_LOGIN || "anjan-budige";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
if (!TOKEN) {
  console.error("GITHUB_TOKEN is required");
  process.exit(1);
}

const F = "'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const FM = "'SF Mono','Cascadia Code',Consolas,monospace";

async function fetchProfile() {
  const query = `query($login:String!){user(login:$login){
    contributionsCollection{
      restrictedContributionsCount
      contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount weekday } } }
    }
  }}`;
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${TOKEN}`, "Content-Type": "application/json", "User-Agent": "profile-generator" },
    body: JSON.stringify({ query, variables: { login: LOGIN } }),
  });
  const json = await res.json();
  if (!res.ok || json.errors) {
    console.error(JSON.stringify(json.errors || json.message));
    process.exit(1);
  }
  return json.data.user.contributionsCollection;
}

function graph(cc) {
  const weeks = cc.contributionCalendar.weeks;
  const totalContribs = cc.contributionCalendar.totalContributions;
  const totals = weeks.map((w) => w.contributionDays.reduce((n, x) => n + x.contributionCount, 0));
  const n = totals.length;
  const w = 880, h = 230;
  const L = 44, R = 18, T = 46, B = 34;
  const pw = w - L - R, ph = h - T - B;
  const max = Math.max(...totals, 1);
  const px = (i) => L + (i * pw) / (n - 1);
  const py = (v) => T + ph - (v / max) * ph;

  const line = totals.map((v, i) => `${i ? "L" : "M"}${px(i).toFixed(1)} ${py(v).toFixed(1)}`).join(" ");
  const area = `${line} L${px(n - 1).toFixed(1)} ${T + ph} L${px(0).toFixed(1)} ${T + ph} Z`;

  let inner = `
  <defs>
    <linearGradient id="ag-area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#22C55E" stop-opacity="0.5"/><stop offset="100%" stop-color="#22C55E" stop-opacity="0.02"/>
    </linearGradient>
  </defs>
  <text x="${L}" y="26" font-family="${F}" font-size="15" font-weight="700" fill="#FFFFFF" letter-spacing="1">Contribution Activity Graph</text>
  <text x="${w - R}" y="26" text-anchor="end" font-family="${FM}" font-size="12" fill="#22C55E">${totalContribs} contributions in the last year</text>`;

  for (let g = 0; g <= 4; g++) {
    const y = T + (ph * g) / 4;
    inner += `<line x1="${L}" y1="${y}" x2="${w - R}" y2="${y}" stroke="#21262d" stroke-width="1"/>
    <text x="${L - 8}" y="${y + 3.5}" text-anchor="end" font-family="${FM}" font-size="9" fill="#8b949e">${Math.round(max - (max * g) / 4)}</text>`;
  }

  let lastMonth = -1;
  weeks.forEach((wk, i) => {
    const first = wk.contributionDays[0];
    if (!first) return;
    const m = new Date(first.date).getMonth();
    if (m !== lastMonth) {
      lastMonth = m;
      inner += `<text x="${px(i)}" y="${h - 12}" text-anchor="middle" font-family="${FM}" font-size="9" fill="#8b949e">${new Date(first.date).toLocaleString("en", { month: "short" })}</text>`;
    }
  });

  inner += `
  <path d="${area}" fill="url(#ag-area)">
    <animate attributeName="opacity" values="0.75;1;0.75" dur="5s" repeatCount="indefinite"/>
  </path>
  <path d="${line}" fill="none" stroke="#22C55E" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
  ${totals.map((v, i) => `<circle cx="${px(i).toFixed(1)}" cy="${py(v).toFixed(1)}" r="2.6" fill="#86EFAC"/>`).join("")}
  <circle cx="${px(n - 1).toFixed(1)}" cy="${py(totals[n - 1]).toFixed(1)}" r="4" fill="#22C55E">
    <animate attributeName="r" values="3;6;3" dur="2s" repeatCount="indefinite"/>
    <animate attributeName="opacity" values="1;0.3;1" dur="2s" repeatCount="indefinite"/>
  </circle>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="Contribution activity graph for the last year">
<rect width="${w}" height="${h}" rx="12" fill="#0d1117"/>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="none" stroke="#21262d"/>
${inner}
</svg>`;
}

const cc = await fetchProfile();
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "graph.svg"), graph(cc));
console.log("generated graph.svg");
