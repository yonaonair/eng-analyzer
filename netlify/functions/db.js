import { neon } from "@neondatabase/serverless";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { ...CORS, "Content-Type": "application/json" },
    });
}

export default async (req) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    const url = process.env.DATABASE_URL;
    if (!url) return json({ error: "DATABASE_URL 환경변수가 없습니다." }, 500);

    const sql = neon(url);
    const { action, ...p } = await req.json();

    try {
        if (action === "list") {
            const rows = await sql`
                SELECT id, book, page, num, created_at
                FROM analyses
                ORDER BY created_at DESC
                LIMIT 300`;
            return json(rows);
        }

        if (action === "check") {
            const rows = await sql`
                SELECT * FROM analyses
                WHERE book = ${p.book} AND page = ${p.page ?? ""} AND num = ${p.num}
                LIMIT 1`;
            return json(rows[0] ?? null);
        }

        if (action === "get") {
            const rows = await sql`
                SELECT * FROM analyses WHERE id = ${p.id} LIMIT 1`;
            return json(rows[0] ?? null);
        }

        if (action === "upsert") {
            await sql`
                INSERT INTO analyses (book, page, num, passage, result)
                VALUES (${p.book}, ${p.page ?? ""}, ${p.num}, ${p.passage}, ${p.result})
                ON CONFLICT (book, page, num)
                DO UPDATE SET
                    passage    = EXCLUDED.passage,
                    result     = EXCLUDED.result,
                    created_at = NOW()`;
            return json({ ok: true });
        }

        return json({ error: "알 수 없는 action" }, 400);
    } catch (e) {
        console.error("[db]", e);
        return json({ error: e.message }, 500);
    }
};

export const config = {
    path: "/api/db",
    timeout: 10,
};
