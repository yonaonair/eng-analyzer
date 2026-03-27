/**
 * 로컬 개발 서버 — node server.js 로 실행
 * http://localhost:3000 에서 앱을 엽니다.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const https = require("https");

// .env 파일에서 ANTHROPIC_API_KEY 로드
const envFile = path.join(__dirname, ".env");
if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, "utf8")
        .split("\n")
        .forEach((line) => {
            const eq = line.indexOf("=");
            if (eq === -1) return;
            const k = line.slice(0, eq).trim();
            const v = line.slice(eq + 1).trim();
            if (k && !process.env[k]) process.env[k] = v;
        });
}

const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
    console.error("❌  ANTHROPIC_API_KEY가 .env 파일에 없습니다.");
    process.exit(1);
}

const PORT = process.env.PORT || 3000;
const PUBLIC = path.join(__dirname, "public");

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css",
    ".js": "application/javascript",
    ".json": "application/json",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
};

const server = http.createServer(async (req, res) => {
    // ── CORS preflight ──
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }

    // ── API proxy ──
    if (req.method === "POST" && req.url === "/api/analyze") {
        let body = "";
        req.on("data", (chunk) => (body += chunk));
        req.on("end", () => {
            const options = {
                hostname: "api.anthropic.com",
                path: "/v1/messages",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-api-key": API_KEY,
                    "anthropic-version": "2023-06-01",
                    "Content-Length": Buffer.byteLength(body),
                },
            };
            const proxy = https.request(options, (apiRes) => {
                const chunks = [];
                apiRes.on("data", (c) => chunks.push(c));
                apiRes.on("end", () => {
                    const data = Buffer.concat(chunks).toString("utf8");
                    res.writeHead(apiRes.statusCode, {
                        "Content-Type": "application/json; charset=utf-8",
                        "Access-Control-Allow-Origin": "*",
                    });
                    res.end(data);
                });
            });
            proxy.on("error", (e) => {
                res.writeHead(500, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: { message: e.message } }));
            });
            proxy.write(body);
            proxy.end();
        });
        return;
    }

    // ── DB API ──
    if (req.method === "POST" && req.url === "/api/db") {
        const chunks = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", async () => {
            const jsonOk = (data) => {
                res.writeHead(200, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
                res.end(JSON.stringify(data));
            };
            const jsonErr = (msg) => {
                res.writeHead(500, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
                res.end(JSON.stringify({ error: msg }));
            };
            try {
                const connStr = process.env.DATABASE_URL;
                if (!connStr) throw new Error("DATABASE_URL이 .env에 없습니다.");

                const neonSql = async (query, params = []) => {
                    const u = new URL(connStr);
                    const apiRes = await fetch(`https://${u.hostname}/sql`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Neon-Connection-String": connStr },
                        body: JSON.stringify({ query, params }),
                    });
                    const json = await apiRes.json();
                    if (!apiRes.ok || json.message) throw new Error(json.message || `DB 오류 ${apiRes.status}`);
                    return json.rows ?? [];
                };

                const { action, ...p } = JSON.parse(Buffer.concat(chunks).toString("utf8"));
                let result;

                if (action === "list") {
                    result = await neonSql("SELECT id, book, page, num, created_at FROM analyses ORDER BY created_at DESC LIMIT 300");
                } else if (action === "check") {
                    const rows = await neonSql("SELECT * FROM analyses WHERE book=$1 AND page=$2 AND num=$3 LIMIT 1", [p.book, p.page ?? "", p.num]);
                    result = rows[0] ?? null;
                } else if (action === "get") {
                    const rows = await neonSql("SELECT * FROM analyses WHERE id=$1 LIMIT 1", [p.id]);
                    result = rows[0] ?? null;
                } else if (action === "upsert") {
                    await neonSql(
                        "INSERT INTO analyses (book, page, num, passage, result) VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (book, page, num) DO UPDATE SET passage=EXCLUDED.passage, result=EXCLUDED.result, created_at=NOW()",
                        [p.book, p.page ?? "", p.num, p.passage, JSON.stringify(p.result)]
                    );
                    result = { ok: true };
                } else {
                    throw new Error("알 수 없는 action: " + action);
                }

                jsonOk(result);
            } catch (e) {
                jsonErr(e.message);
            }
        });
        return;
    }

    // ── Static files ──
    let filePath = path.join(PUBLIC, req.url === "/" ? "index.html" : req.url);
    // Prevent path traversal
    if (!filePath.startsWith(PUBLIC)) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end("Not found");
            return;
        }
        const ext = path.extname(filePath);
        res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`✅  서버 실행 중: http://localhost:${PORT}`);
    console.log(`   종료하려면 Ctrl+C`);
});
