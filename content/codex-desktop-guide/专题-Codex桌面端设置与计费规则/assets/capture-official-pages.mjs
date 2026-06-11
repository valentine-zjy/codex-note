import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const outDir = path.join(root, "assets", "screenshots", "web");
fs.mkdirSync(outDir, { recursive: true });

const edgePath = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const port = 9333 + Math.floor(Math.random() * 1000);
const userDataDir = path.join(os.tmpdir(), `codex-doc-screenshot-${process.pid}`);

const shots = [
  {
    file: "01-codex-pricing-top.png",
    url: "https://developers.openai.com/codex/pricing",
    scrollText: "Codex Pricing",
  },
  {
    file: "02-codex-pricing-options.png",
    url: "https://developers.openai.com/codex/pricing",
    scrollText: "Pricing options",
  },
  {
    file: "03-codex-usage-limits.png",
    url: "https://developers.openai.com/codex/pricing",
    scrollText: "What are the usage limits for my plan?",
  },
  {
    file: "04-codex-rate-card.png",
    url: "https://developers.openai.com/codex/pricing",
    scrollText: "How do credits work?",
  },
  {
    file: "05-codex-feature-availability.png",
    url: "https://developers.openai.com/codex/pricing",
    scrollText: "Feature availability",
  },
  {
    file: "06-plus-pro-credits.png",
    url: "https://help.openai.com/en/articles/12642688-using-credits-for-flexible-usage-in-chatgpt-freegopluspro",
    scrollText: "How credits work",
  },
  {
    file: "07-business-spend-controls.png",
    url: "https://help.openai.com/en/articles/20001155-managing-credits-and-spend-controls-in-chatgpt-business",
    scrollText: "Manage spend controls",
  },
  {
    file: "08-flexible-pricing-enterprise.png",
    url: "https://help.openai.com/en/articles/11487671-flexible-pricing-for-the-enterprise-edu-and-business-plans",
    scrollText: "How do credits work in ChatGPT plans?",
  },
  {
    file: "09-codex-app-settings-page.png",
    url: "https://developers.openai.com/codex/app/settings",
    scrollText: "Codex app settings",
  },
  {
    file: "10-local-environments-page.png",
    url: "https://developers.openai.com/codex/app/local-environments",
    scrollText: "Local environments",
  },
];

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} for ${url}`);
  }
  return response.json();
}

async function waitForEndpoint() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      return await getJson(`http://127.0.0.1:${port}/json/version`);
    } catch {
      await delay(250);
    }
  }
  throw new Error("Timed out waiting for Edge DevTools endpoint");
}

async function createPage() {
  const target = await getJson(`http://127.0.0.1:${port}/json/new?about:blank`, { method: "PUT" });
  return target.webSocketDebuggerUrl;
}

function connect(wsUrl) {
  let id = 0;
  const pending = new Map();
  const ws = new WebSocket(wsUrl);
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return new Promise((resolve, reject) => {
    ws.addEventListener("open", () => {
      resolve({
        send(method, params = {}) {
          const callId = ++id;
          ws.send(JSON.stringify({ id: callId, method, params }));
          return new Promise((callResolve, callReject) => {
            pending.set(callId, { resolve: callResolve, reject: callReject });
          });
        },
        close() {
          ws.close();
        },
      });
    });
    ws.addEventListener("error", reject);
  });
}

async function capture(client, shot) {
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await client.send("Page.navigate", { url: shot.url });
  await delay(5500);
  await client.send("Runtime.evaluate", {
    expression: `
      (() => {
        const target = ${JSON.stringify(shot.scrollText)};
        const articleRoot = document.querySelector('main') || document.body;
        const nodes = [...articleRoot.querySelectorAll('h1,h2,h3,h4')];
        const hit = nodes.find((node) => (node.innerText || '').trim().includes(target));
        if (hit) {
          hit.scrollIntoView({ block: 'start', inline: 'nearest' });
          window.scrollBy(0, -120);
        } else {
          window.scrollTo(0, 0);
        }
        return { found: Boolean(hit), y: window.scrollY, title: document.title };
      })()
    `,
    awaitPromise: true,
  });
  await delay(1200);
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  fs.writeFileSync(path.join(outDir, shot.file), Buffer.from(result.data, "base64"));
  console.log(`${shot.file}\t${shot.url}`);
}

fs.mkdirSync(userDataDir, { recursive: true });
const edge = spawn(edgePath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--disable-dev-shm-usage",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${userDataDir}`,
  "about:blank",
], {
  stdio: "ignore",
});

try {
  await waitForEndpoint();
  for (const shot of shots) {
    const wsUrl = await createPage();
    const client = await connect(wsUrl);
    await capture(client, shot);
    client.close();
  }
} finally {
  edge.kill();
  await delay(500);
  if (userDataDir.startsWith(os.tmpdir())) {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}
