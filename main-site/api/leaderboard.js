// Methods:
//   GET  /api/leaderboard?date=YYYY-MM-DD
//   POST /api/leaderboard   { puzzle_date, nickname, score }
//
// ENV required (Project Settings → Environment Variables):
//   SUPABASE_URL=https://YOUR-PROJECT.supabase.co
//   SUPABASE_SERVICE_KEY=YOUR-SERVICE-ROLE-KEY

const ALLOWED_ORIGIN = '*'; // or set to your site origin for stricter CORS

function setCORS(res) {
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function bad(res, code, msg) {
    res.status(code).json({
        error: msg
    });
}

export default async function handler(req, res) {
    setCORS(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const {
        SUPABASE_URL,
        SUPABASE_SERVICE_KEY
    } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
        return bad(res, 500, 'Supabase env vars not configured');
    }

    const headers = {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
    };

    try {
        if (req.method === 'GET') {
            const date = String(req.query.date || '').trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
                return bad(res, 400, 'Query param "date" must be YYYY-MM-DD');
            }

            // Order by score desc, then earlier submission first
            const qs = `select=nickname,score,created_at&puzzle_date=eq.${encodeURIComponent(
        date
      )}&order=score.desc,created_at.asc`;

            const r = await fetch(`${SUPABASE_URL}/rest/v1/sudoku_scores?${qs}`, {
                headers,
            });
            if (!r.ok) {
                const t = await r.text();
                return bad(res, r.status, `Supabase error: ${t}`);
            }
            const rows = await r.json();
            return res.status(200).json({
                date,
                rows
            });
        }

        if (req.method === 'POST') {
            const {
                puzzle_date,
                nickname,
                score
            } = req.body || {};
            if (!/^\d{4}-\d{2}-\d{2}$/.test(String(puzzle_date || '')))
                return bad(res, 400, 'puzzle_date must be YYYY-MM-DD');
            const name = String(nickname || 'Anonymous').slice(0, 40).trim();
            const val = Number(score);
            if (!Number.isFinite(val)) return bad(res, 400, 'score must be a number');

            // Basic sanity checks
            if (val < -1e9 || val > 1e9) return bad(res, 400, 'score out of range');

            const body = [{
                puzzle_date,
                nickname: name,
                score: Math.round(val)
            }];

            const r = await fetch(`${SUPABASE_URL}/rest/v1/sudoku_scores`, {
                method: 'POST',
                headers: {
                    ...headers,
                    'Content-Type': 'application/json',
                    'Prefer': 'return=representation',
                },
                body: JSON.stringify(body),
            });

            if (!r.ok) {
                const t = await r.text();
                return bad(res, r.status, `Supabase insert error: ${t}`);
            }
            const [row] = await r.json();
            return res.status(201).json({
                ok: true,
                row
            });
        }

        return bad(res, 405, 'Method Not Allowed');
    } catch (e) {
        return bad(res, 500, `Server error: ${e.message || e}`);
    }
}