#!/usr/bin/env node
/**
 * Generates the profile header card as two SVGs (dark + light).
 *
 * Why SVG: GitHub profile READMEs are sanitized markdown — no CSS, no script.
 * An image is the only way to carry real typography, and SVG is the only image
 * format that stays crisp and stays small.
 *
 * Why monospace everywhere: GitHub proxies README images through Camo, which
 * blocks external font loading, so @font-face and web fonts are out. Rather
 * than let Archivo silently fall back to something generic, the card leans on
 * the site's instrument voice — monospace, which renders near-identically
 * across platforms. The design is built around the constraint, not fighting it.
 *
 * Run: node scripts/generate-card.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "assets");
const TIMEOUT_MS = 10_000;

/* ------------------------------------------------------------------
   MANUAL — keep in sync with technyx-sh/src/lib/metrics.ts
   api.railforless.us/stats exposes rolling windows only, not an
   all-time total. When a cumulative endpoint lands, fetch it here.
   ------------------------------------------------------------------ */
const MANUAL = {
  cumulativeSearches: 300_000,
  searchesSince: "SEP 2024",
};

const PALETTE = {
  dark: {
    ground: "#0B0E14",
    panel: "#171D2C",
    rule: "#242C3D",
    ruleSoft: "#1B2231",
    ink: "#E2E8F2",
    dim: "#8593A8",
    // Lifted from the site's #5A6579: the card rasterizes, so a reader
    // can't zoom the 9px sublabels. 4.6:1 rather than 3.29:1.
    faint: "#727C90",
    clear: "#3FBF87",
  },
  light: {
    ground: "#F7F5F1",
    panel: "#EFEBE4",
    rule: "#DDD8CF",
    ruleSoft: "#E6E1D9",
    ink: "#1B1F26",
    dim: "#5C6470",
    // Same reason — 4.57:1 rather than 2.95:1.
    faint: "#6B7079",
    // Darkened so it still passes contrast on paper.
    clear: "#1F8F5F",
  },
};

const MONO =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, 'DejaVu Sans Mono', monospace";

async function fetchJson(url, init) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) {
      console.warn(`[card] ${url} -> ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.warn(`[card] ${url} failed: ${error.message}`);
    return null;
  }
}

async function getStars(repo, fallback) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "iamtechnyx-profile-card",
  };
  // The Action passes GITHUB_TOKEN so the API isn't rate-limited to 60/hr.
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const data = await fetchJson(`https://api.github.com/repos/${repo}`, { headers });
  return typeof data?.stargazers_count === "number" ? data.stargazers_count : fallback;
}

async function collect() {
  const [stats, ownStars] = await Promise.all([
    fetchJson("https://api.railforless.us/stats"),
    getStars("iamtechnyx/BorderlessMinecraft", 176),
  ]);

  return {
    cumulative: MANUAL.cumulativeSearches,
    since: MANUAL.searchesSince,
    lastDay: typeof stats?.lastDay === "number" ? stats.lastDay : null,
    ownStars,
  };
}

const n = (value) => value.toLocaleString("en-US");

/** SVG text content must not carry raw markup characters. */
const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function buildSvg(theme, data) {
  const c = PALETTE[theme];
  const W = 840;
  const H = 268;

  // Three figures, matching the site's counter row. MudBlazor's 10k stars are
  // deliberately not folded into a combined total — they aren't Riley's repo.
  const stats = [
    { value: `${n(data.cumulative)}+`, label: "FARE SEARCHES SERVED", sub: `SINCE ${data.since}` },
    data.lastDay === null
      ? { value: "—", label: "LAST 24 HOURS", sub: "UNAVAILABLE" }
      : { value: n(data.lastDay), label: "IN THE LAST 24 HOURS", sub: "RAILFORLESS.US", lit: true },
    { value: n(data.ownStars), label: "STARS ON MY OWN WORK", sub: "BORDERLESSMINECRAFT" },
  ];

  const colX = [26, 300, 566];

  const statMarkup = stats
    .map((s, i) => {
      const x = colX[i];
      const dot = s.lit
        ? `<circle cx="${x + 4}" cy="${196 - 3}" r="3" fill="${c.clear}"/>`
        : "";
      const labelX = s.lit ? x + 14 : x;
      return `
    <text x="${x}" y="${178}" font-family="${MONO}" font-size="27" font-weight="700" letter-spacing="-0.5" fill="${c.ink}">${esc(s.value)}</text>
    ${dot}
    <text x="${labelX}" y="${196}" font-family="${MONO}" font-size="9.5" letter-spacing="1.3" fill="${c.dim}">${esc(s.label)}</text>
    <text x="${x}" y="${210}" font-family="${MONO}" font-size="9" letter-spacing="1.1" fill="${c.faint}">${esc(s.sub)}</text>`;
    })
    .join("");

  // The track circuit, same as the site: lit blocks are running systems,
  // the unlit one is a project Riley contributes to but doesn't run.
  const systems = [
    { name: "RAILFORLESS", lit: true },
    { name: "WOT REPLAY RECORDER", lit: true },
    { name: "BORDERLESSMINECRAFT", lit: true },
    { name: "MUDBLAZOR", lit: false },
  ];

  let cursor = 26;
  const systemMarkup = systems
    .map((s) => {
      const box = `<rect x="${cursor}" y="${239}" width="7" height="7" fill="${s.lit ? c.clear : "none"}" stroke="${s.lit ? c.clear : c.faint}" stroke-width="1"/>`;
      const label = `<text x="${cursor + 13}" y="${246}" font-family="${MONO}" font-size="9" letter-spacing="1.2" fill="${s.lit ? c.dim : c.faint}">${esc(s.name)}</text>`;
      cursor += 13 + s.name.length * 6.1 + 24;
      return box + label;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Riley Nielsen, software engineer. ${esc(n(data.cumulative))}+ fare searches served, ${data.lastDay === null ? "unknown" : esc(n(data.lastDay))} in the last 24 hours, ${esc(n(data.ownStars))} stars on BorderlessMinecraft.">
  <rect width="${W}" height="${H}" fill="${c.ground}"/>
  <rect x="0.5" y="0.5" width="${W - 1}" height="${H - 1}" fill="none" stroke="${c.rule}"/>

  <rect x="1" y="1" width="${W - 2}" height="39" fill="${c.panel}"/>
  <line x1="0" y1="40" x2="${W}" y2="40" stroke="${c.rule}"/>
  <text x="26" y="25" font-family="${MONO}" font-size="12" font-weight="700" letter-spacing="2.2" fill="${c.ink}">RILEY NIELSEN</text>
  <text x="${W - 26}" y="25" text-anchor="end" font-family="${MONO}" font-size="10" letter-spacing="1.5" fill="${c.faint}">ST PAUL, MN</text>

  <text x="26" y="88" font-family="${MONO}" font-size="21" font-weight="700" letter-spacing="-0.3" fill="${c.ink}">I build backends and keep them running.</text>
  <text x="26" y="112" font-family="${MONO}" font-size="10" letter-spacing="1.6" fill="${c.dim}">SOFTWARE ENGINEER  ·  BACKEND &amp; INFRASTRUCTURE  ·  .NET / TYPESCRIPT / LINUX</text>

  <line x1="26" y1="138" x2="${W - 26}" y2="138" stroke="${c.ruleSoft}"/>
${statMarkup}

  <line x1="26" y1="224" x2="${W - 26}" y2="224" stroke="${c.ruleSoft}"/>
${systemMarkup}
  <text x="${W - 26}" y="246" text-anchor="end" font-family="${MONO}" font-size="9" letter-spacing="1.2" fill="${c.faint}">RILEYNIELSEN.COM</text>
</svg>
`;
}

const data = await collect();
await fs.mkdir(OUT_DIR, { recursive: true });

for (const theme of ["dark", "light"]) {
  const file = path.join(OUT_DIR, `card-${theme}.svg`);
  await fs.writeFile(file, buildSvg(theme, data), "utf-8");
  console.log(`[card] wrote ${path.relative(process.cwd(), file)}`);
}

console.log(
  `[card] searches=${n(data.cumulative)}+ last24h=${data.lastDay ?? "n/a"} stars=${data.ownStars}`,
);
