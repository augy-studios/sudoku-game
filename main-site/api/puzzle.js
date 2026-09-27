// GET /api/puzzle?date=YYYY-MM-DD&withSolution=0|1
// Returns { date, difficulty, puzzle: number[9][9], solution?: number[9][9] }

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({
        error: 'Method Not Allowed'
    });

    const date = (req.query.date && String(req.query.date)) || new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({
            error: 'date must be YYYY-MM-DD'
        });
    }
    const withSolution = String(req.query.withSolution || '0') === '1';

    // ---- Seed helpers
    function seedFromStr(s) {
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function mulberry32(a) {
        return function () {
            let t = (a += 0x6D2B79F5);
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function shuffled(arr, rnd) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ---- Sudoku helpers
    function isSafe(grid, r, c, n) {
        for (let i = 0; i < 9; i++)
            if (grid[r][i] === n || grid[i][c] === n) return false;
        const br = Math.floor(r / 3) * 3,
            bc = Math.floor(c / 3) * 3;
        for (let i = 0; i < 3; i++)
            for (let j = 0; j < 3; j++)
                if (grid[br + i][bc + j] === n) return false;
        return true;
    }

    function generateSolved(rnd) {
        const grid = Array.from({
            length: 9
        }, () => Array(9).fill(0));
        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];

        function fill(r, c) {
            if (r === 9) return true;
            const nr = c === 8 ? r + 1 : r;
            const nc = c === 8 ? 0 : c + 1;
            for (const n of shuffled(nums, rnd)) {
                if (isSafe(grid, r, c, n)) {
                    grid[r][c] = n;
                    if (fill(nr, nc)) return true;
                    grid[r][c] = 0;
                }
            }
            return false;
        }
        fill(0, 0);
        return grid;
    }

    function clone2D(g) {
        return g.map((r) => r.slice());
    }

    function countSolutions(grid, limit = 2) {
        let cnt = 0;

        function back() {
            for (let r = 0; r < 9; r++) {
                for (let c = 0; c < 9; c++) {
                    if (grid[r][c] === 0) {
                        for (let n = 1; n <= 9; n++) {
                            if (isSafe(grid, r, c, n)) {
                                grid[r][c] = n;
                                back();
                                if (cnt >= limit) {
                                    grid[r][c] = 0;
                                    return;
                                }
                                grid[r][c] = 0;
                            }
                        }
                        return;
                    }
                }
            }
            cnt++;
        }
        back();
        return cnt;
    }

    function makePuzzle(solved, difficulty, rnd) {
        const grid = clone2D(solved);
        const positions = shuffled([...Array(81).keys()], rnd);
        const removeTarget = difficulty === 'easy' ? 40 : difficulty === 'medium' ? 50 : 58;
        let removed = 0;
        for (const pos of positions) {
            if (removed >= removeTarget) break;
            const r = Math.floor(pos / 9),
                c = pos % 9;
            const backup = grid[r][c];
            grid[r][c] = 0;
            const test = clone2D(grid);
            if (countSolutions(test, 2) !== 1) grid[r][c] = backup;
            else removed++;
        }
        return grid;
    }

    // Vary difficulty by date
    const seed = seedFromStr('DAILY:' + date);
    const diffIdx = seedFromStr(date) % 3;
    const difficulty = ['easy', 'medium', 'hard'][diffIdx];
    const rnd = mulberry32(seed);
    const solution = generateSolved(rnd);
    const puzzle = makePuzzle(solution, difficulty, rnd);

    const payload = {
        date,
        difficulty,
        puzzle
    };
    if (withSolution) payload.solution = solution;
    return res.status(200).json(payload);
}