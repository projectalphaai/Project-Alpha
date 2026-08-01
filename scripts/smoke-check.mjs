/**
 * Project Alpha — static demo smoke checks (no browser automation required).
 */
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const base = "http://127.0.0.1:8080";
const failures = [];

function fail(msg) {
    failures.push(msg);
    console.error("FAIL:", msg);
}

function ok(msg) {
    console.log("OK:", msg);
}

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else out.push(full);
    }
    return out;
}

function httpGet(urlPath, redirects = 0) {
    return new Promise((resolve) => {
        const req = http.get(base + urlPath, { timeout: 5000 }, async (res) => {
            if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location && redirects < 5) {
                res.resume();
                const loc = res.headers.location;
                const next = loc.startsWith("http") ? new URL(loc).pathname + (new URL(loc).search || "") : loc;
                resolve(await httpGet(next, redirects + 1));
                return;
            }
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => resolve({ status: res.statusCode, body }));
        });
        req.on("error", (err) => resolve({ status: 0, body: "", error: err.message }));
        req.on("timeout", () => {
            req.destroy();
            resolve({ status: 0, body: "", error: "timeout" });
        });
    });
}

const jsFiles = walk(root).filter((f) => f.endsWith(".js") && !f.includes(`${path.sep}vendor${path.sep}`));
for (const file of jsFiles) {
    try {
        execSync(`node --check "${file}"`, { stdio: "pipe" });
        ok(`syntax ${path.relative(root, file)}`);
    } catch {
        fail(`syntax ${path.relative(root, file)}`);
    }
}

const critical = [
    "/",
    "/index.html",
    "/pages/login.html",
    "/pages/signup.html",
    "/pages/dashboard.html",
    "/css/style.css",
    "/css/auth.css",
    "/css/dashboard.css",
    "/js/script.js",
    "/js/auth.js",
    "/js/auth-pages.js",
    "/js/dashboard.js",
    "/js/vendor/chart.umd.min.js",
    "/img/favicon.svg",
    "/img/avatar.svg",
    "/img/instagram.svg",
    "/img/facebook.svg",
    "/img/linkedin.svg",
    "/img/x.svg",
    "/img/youtube.svg"
];

for (const p of critical) {
    const res = await httpGet(p);
    if (res.status === 200) ok(`HTTP 200 ${p}`);
    else fail(`HTTP ${res.status} ${p}${res.error ? " (" + res.error + ")" : ""}`);
}

const htmlFiles = walk(root).filter((f) => f.endsWith(".html"));
const placeholderRe = /\b(Lorem ipsum|Coming soon|TODO:|FIXME|TBD\b|dummy data|placeholder text)\b/i;
const assetHrefRe = /(?:src|href)=["']([^"']+)["']/gi;

for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const rel = path.relative(root, file);
    if (placeholderRe.test(html)) fail(`placeholder text in ${rel}`);
    else ok(`no placeholders ${rel}`);

    let m;
    while ((m = assetHrefRe.exec(html))) {
        const href = m[1];
        if (
            href.startsWith("http") ||
            href.startsWith("//") ||
            href.startsWith("#") ||
            href.startsWith("mailto:") ||
            href.startsWith("data:")
        ) {
            continue;
        }
        const resolved = path.resolve(path.dirname(file), href.split("?")[0]);
        if (!fs.existsSync(resolved)) fail(`broken asset ${rel} -> ${href}`);
    }
}

const auth = fs.readFileSync(path.join(root, "js/auth.js"), "utf8");
if (!auth.includes("demo@projectalpha.ai") || !auth.includes("demo1234")) {
    fail("demo credentials missing from auth.js");
} else ok("demo credentials present");

const dash = fs.readFileSync(path.join(root, "pages/dashboard.html"), "utf8");
if (!dash.includes("js/vendor/chart.umd.min.js")) fail("dashboard not using local Chart.js");
else ok("local Chart.js wired");

const script = fs.readFileSync(path.join(root, "js/script.js"), "utf8");
if (!script.includes("chatbot-form")) fail("landing chatbot form handler missing");
else ok("interactive chatbot wired");

if (failures.length) {
    console.error(`\n${failures.length} failure(s)`);
    process.exit(1);
}
console.log("\nAll smoke checks passed.");
