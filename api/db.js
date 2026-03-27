const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

function jsonRes(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
}

async function sql(connStr, query, params = []) {
    const u = new URL(connStr);
    const res = await fetch(`https://${u.hostname}/sql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Neon-Connection-String": connStr,
        },
        body: JSON.stringify({ query, params }),
    });
    const json = await res.json();
    if (!res.ok || json.message) throw new Error(json.message || `DB 오류 ${res.status}`);
    return json.rows ?? [];
}

export default async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    const connStr = process.env.DATABASE_URL;
    if (!connStr) return jsonRes({ error: "DATABASE_URL 환경변수가 없습니다." }, 500);

    const { action, ...p } = await req.json();

    try {
        if (action === "list") {
            const rows = await sql(connStr,
                "SELECT id, book, page, num, created_at FROM analyses ORDER BY created_at DESC LIMIT 300"
            );
            return jsonRes(rows);
        }
        if (action === "check") {
            const rows = await sql(connStr,
                "SELECT * FROM analyses WHERE book=$1 AND page=$2 AND num=$3 LIMIT 1",
                [p.book, p.page ?? "", p.num]
            );
            return jsonRes(rows[0] ?? null);
        }
        if (action === "get") {
            const rows = await sql(connStr,
                "SELECT * FROM analyses WHERE id=$1 LIMIT 1",
                [p.id]
            );
            return jsonRes(rows[0] ?? null);
        }
        if (action === "upsert") {
            await sql(connStr,
                `INSERT INTO analyses (book, page, num, passage, result)
                 VALUES ($1, $2, $3, $4, $5::jsonb)
                 ON CONFLICT (book, page, num) DO UPDATE SET
                   passage=EXCLUDED.passage, result=EXCLUDED.result, created_at=NOW()`,
                [p.book, p.page ?? "", p.num, p.passage, JSON.stringify(p.result)]
            );
            return jsonRes({ ok: true });
        }
        return jsonRes({ error: "알 수 없는 action" }, 400);
    } catch (e) {
        return jsonRes({ error: e.message }, 500);
    }
};

export const config = { runtime: "edge" };
