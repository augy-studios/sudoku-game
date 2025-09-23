// ---------- Utility: Theming ----------
const themePicker = document.getElementById('themePicker');
const root = document.body;

function applyTheme(v) {
    root.setAttribute('data-theme', v);
    localStorage.setItem('sudoku:theme', v);
}
themePicker.addEventListener('change', e => applyTheme(e.target.value));
applyTheme(localStorage.getItem('sudoku:theme') || 'light');
themePicker.value = localStorage.getItem('sudoku:theme') || 'light';

// ---------- Greeting & Nickname ----------
function timeOfDay() {
    const h = new Date().getHours();
    return h < 12 ? 'Morning' : h < 18 ? 'Afternoon' : 'Evening';
}

function updateGreeting() {
    document.getElementById('timeofday').textContent = timeOfDay();
    const name = localStorage.getItem('sudoku:nickname');
    document.getElementById('username').textContent = name ? `${name}` : '';
}
updateGreeting();
const greetingEl = document.getElementById('greeting');
greetingEl.addEventListener('click', () => {
    const current = localStorage.getItem('sudoku:nickname') || '';
    const name = prompt('Enter your nickname (for greeting & leaderboards):', current);
    if (name !== null) {
        localStorage.setItem('sudoku:nickname', name.trim());
        updateGreeting();
    }
});

// ---------- Settings Modal ----------
const settingsModal = document.getElementById('settingsModal');
const settingsBtn = document.getElementById('settingsBtn');
const closeSettings = document.getElementById('closeSettings');
const saveSettings = document.getElementById('saveSettings');

settingsBtn.addEventListener('click', () => {
    document.getElementById('nickname').value = localStorage.getItem('sudoku:nickname') || '';
    document.getElementById('correctPts').value = localStorage.getItem('sudoku:correct') || 300;
    document.getElementById('wrongPts').value = localStorage.getItem('sudoku:wrong') || 100;
    settingsModal.showModal();
});
closeSettings.addEventListener('click', () => settingsModal.close());
saveSettings.addEventListener('click', () => {
    localStorage.setItem('sudoku:nickname', document.getElementById('nickname').value.trim());
    localStorage.setItem('sudoku:correct', parseInt(document.getElementById('correctPts').value || 300));
    localStorage.setItem('sudoku:wrong', parseInt(document.getElementById('wrongPts').value || 100));
    updateGreeting();
    settingsModal.close();
    updateLBStatus();
    refreshLeaderboard();
});

// ---------- Points & Timer ----------
let score = 0;
let timer = 0;
let timerId = null;
let isDaily = false;
let currentDailyDateStr = '';

function startTimer() {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(() => {
        timer++;
        renderTimer();
    }, 1000);
}

function stopTimer() {
    if (timerId) clearInterval(timerId);
    timerId = null;
}

function resetTimer() {
    timer = 0;
    renderTimer();
}

function renderTimer() {
    const m = String(Math.floor(timer / 60)).padStart(2, '0');
    const s = String(timer % 60).padStart(2, '0');
    document.getElementById('timer').textContent = `${m}:${s}`;
}

function loadHigh() {
    return parseInt(localStorage.getItem('sudoku:highscore') || '0');
}

function saveHigh(v) {
    localStorage.setItem('sudoku:highscore', String(v));
}

function updateScores() {
    document.getElementById('score').textContent = score;
    const hs = loadHigh();
    if (score > hs) {
        saveHigh(score);
    }
    document.getElementById('highscore').textContent = loadHigh();
}

// ---------- Sudoku Engine (generator + solver) ----------
// Helper RNG (seeded)
function mulberry32(a) {
    return function () {
        var t = a += 0x6D2B79F5;
        t = Math.imul(t ^ t >>> 15, t | 1);
        t ^= t + Math.imul(t ^ t >>> 7, t | 61);
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function seedFromStr(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

const SIZE = 9;
const BOXS = 3;

function clone2D(g) {
    return g.map(r => r.slice());
}

function isSafe(grid, r, c, n) {
    for (let i = 0; i < 9; i++) {
        if (grid[r][i] === n || grid[i][c] === n) return false;
    }
    const br = Math.floor(r / 3) * 3,
        bc = Math.floor(c / 3) * 3;
    for (let i = 0; i < 3; i++)
        for (let j = 0; j < 3; j++) {
            if (grid[br + i][bc + j] === n) return false;
        }
    return true;
}

function solve(grid) {
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (grid[r][c] === 0) {
                for (let n = 1; n <= 9; n++) {
                    if (isSafe(grid, r, c, n)) {
                        grid[r][c] = n;
                        if (solve(grid)) return true;
                        grid[r][c] = 0;
                    }
                }
                return false;
            }
        }
    }
    return true;
}

function countSolutions(grid, limit = 2) { // backtracking counter (stop at limit)
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
                    return; // dead end, backtrack
                }
            }
        }
        cnt++; // found solution
    }
    back();
    return cnt;
}

function shuffled(arr, rnd) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function generateSolved(rnd) {
    const grid = Array.from({
        length: 9
    }, () => Array(9).fill(0));
    const rows = [0, 1, 2, 3, 4, 5, 6, 7, 8],
        cols = [0, 1, 2, 3, 4, 5, 6, 7, 8],
        nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    function fill(r, c) {
        if (r === 9) return true;
        const nr = c === 8 ? r + 1 : r;
        const nc = c === 8 ? 0 : c + 1;
        const order = shuffled(nums, rnd);
        for (const n of order) {
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

function makePuzzle(solved, difficulty, rnd) {
    // Remove clues while keeping unique solution; difficulty controls removals
    const grid = clone2D(solved);
    const positions = shuffled([...Array(81).keys()], rnd);
    const removeTarget = difficulty === 'easy' ? 40 : difficulty === 'medium' ? 50 : 58; // approximate blanks
    let removed = 0;
    for (const pos of positions) {
        if (removed >= removeTarget) break;
        const r = Math.floor(pos / 9),
            c = pos % 9;
        const backup = grid[r][c];
        grid[r][c] = 0;
        const test = clone2D(grid);
        if (countSolutions(test, 2) !== 1) {
            grid[r][c] = backup;
        } else {
            removed++;
        }
    }
    return grid;
}

// ---------- Game State ----------
let puzzle = null;
let solution = null;
let fixed = null; // booleans marking clues
const gridEl = document.getElementById('grid');

function renderGrid() {
    gridEl.innerHTML = '';
    for (let r = 0; r < 9; r++) {
        const rowFrag = document.createDocumentFragment();
        for (let c = 0; c < 9; c++) {
            const div = document.createElement('div');
            div.className = 'cell';
            const inp = document.createElement('input');
            inp.inputMode = 'numeric';
            inp.maxLength = 1;
            inp.setAttribute('aria-label', `r${r+1} c${c+1}`);
            const v = puzzle[r][c];
            if (v !== 0) {
                inp.value = String(v);
                inp.readOnly = true;
            }
            inp.addEventListener('input', (e) => {
                const val = e.target.value.replace(/[^1-9]/g, '');
                e.target.value = val;
                if (val === '') return; // allow clearing afterwards via Clear btn
                const num = parseInt(val);
                if (num === solution[r][c]) {
                    // correct
                    if (puzzle[r][c] === 0) { // only award if it was empty before
                        score += parseInt(localStorage.getItem('sudoku:correct') || 300);
                        puzzle[r][c] = num;
                        e.target.classList.remove('error');
                        e.target.classList.add('correct');
                        setTimeout(() => e.target.classList.remove('correct'), 400);
                        updateScores();
                        if (isComplete()) onComplete();
                    }
                } else {
                    e.target.classList.add('error');
                    setTimeout(() => e.target.classList.remove('error'), 350);
                    score -= parseInt(localStorage.getItem('sudoku:wrong') || 100);
                    updateScores();
                }
            });
            div.appendChild(inp);
            rowFrag.appendChild(div);
        }
        gridEl.appendChild(rowFrag);
    }
}

function isComplete() {
    for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++)
            if (puzzle[r][c] !== solution[r][c]) return false;
    return true;
}

function newGameFromSeed(seed, difficulty) {
    const rnd = mulberry32(seed);
    const solved = generateSolved(rnd);
    const pz = makePuzzle(solved, difficulty, rnd);
    puzzle = pz;
    solution = solved;
    fixed = pz.map(row => row.map(v => v !== 0));
    score = 0;
    resetTimer();
    startTimer();
    updateScores();
    renderGrid();
    isDaily = false;
    currentDailyDateStr = '';
    document.getElementById('lbDate').textContent = '—';
}

function dailySeedFromDateStr(dateStr) {
    return seedFromStr('DAILY:' + dateStr);
}

async function startDaily(dateStr) {
    // Ask the serverless function for the canonical daily (includes solution)
    currentDailyDateStr = dateStr;
    document.getElementById('lbDate').textContent = dateStr;

    try {
        const r = await fetch(`/api/puzzle?date=${encodeURIComponent(dateStr)}&withSolution=1`);
        if (!r.ok) throw new Error(await r.text());
        const {
            puzzle: pz,
            solution: sol,
            difficulty: diff
        } = await r.json();

        puzzle = pz;
        solution = sol;
        fixed = pz.map(row => row.map(v => v !== 0));

        score = 0;
        resetTimer();
        startTimer();
        updateScores();
        renderGrid();
        isDaily = true;

        // Optionally surface server-selected difficulty in the UI dropdown:
        if (['easy', 'medium', 'hard'].includes(diff)) {
            document.getElementById('difficulty').value = diff;
        }

        refreshLeaderboard();
    } catch (e) {
        console.warn('Daily fetch failed, falling back to client generator.', e);

        // Fallback to client-side deterministic generator if API unavailable
        const diff = ['easy', 'medium', 'hard'][(seedFromStr(dateStr) % 3)];
        const seed = dailySeedFromDateStr(dateStr);
        const rnd = mulberry32(seed);
        const solved = generateSolved(rnd);
        const pz = makePuzzle(solved, diff, rnd);
        puzzle = pz;
        solution = solved;
        fixed = pz.map(row => row.map(v => v !== 0));
        score = 0;
        resetTimer();
        startTimer();
        updateScores();
        renderGrid();
        isDaily = true;
        refreshLeaderboard();
    }
}

// ---------- Controls ----------
document.getElementById('newGame').addEventListener('click', () => {
    const difficulty = document.getElementById('difficulty').value;
    const seed = Math.floor(Math.random() * 1e9) ^ Date.now();
    newGameFromSeed(seed, difficulty);
});
document.getElementById('dailyBtn').addEventListener('click', () => {
    const today = new Date();
    const ds = today.toISOString().slice(0, 10);
    startDaily(ds);
    document.getElementById('dailyDate').value = ds;
});
document.getElementById('loadDaily').addEventListener('click', () => {
    const ds = document.getElementById('dailyDate').value;
    if (ds) startDaily(ds);
});

document.getElementById('checkBtn').addEventListener('click', () => {
    // Mark wrong entries
    const inputs = gridEl.querySelectorAll('input');
    for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++) {
            const idx = r * 9 + c;
            const inp = inputs[idx];
            if (inp.readOnly) continue;
            const val = inp.value ? parseInt(inp.value) : 0;
            if (val && val !== solution[r][c]) {
                inp.classList.add('error');
                setTimeout(() => inp.classList.remove('error'), 350);
                score -= parseInt(localStorage.getItem('sudoku:wrong') || 100);
            }
        }
    updateScores();
});
document.getElementById('hintBtn').addEventListener('click', () => {
    // fill one empty cell correctly (mild penalty)
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            if (puzzle[r][c] === 0) {
                const inputs = gridEl.querySelectorAll('input');
                const idx = r * 9 + c;
                inputs[idx].value = String(solution[r][c]);
                puzzle[r][c] = solution[r][c];
                score = Math.max(0, score - 150);
                updateScores();
                if (isComplete()) onComplete();
                return;
            }
        }
    }
});
document.getElementById('solveBtn').addEventListener('click', () => {
    const inputs = gridEl.querySelectorAll('input');
    for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
            const idx = r * 9 + c;
            const inp = inputs[idx];
            inp.value = String(solution[r][c]);
            inp.readOnly = true;  // lock everything since puzzle is solved
        }
    }
    puzzle = clone2D(solution);
    fixed = solution.map(row => row.map(() => true)); // mark all as fixed
    updateScores();
    stopTimer();
});
document.getElementById('clearBtn').addEventListener('click', () => {
    const inputs = gridEl.querySelectorAll('input');
    for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++) {
            const idx = r * 9 + c;
            if (!fixed[r][c]) {
                inputs[idx].value = '';
                puzzle[r][c] = 0;
            }
        }
    updateScores();
});

function onComplete() {
    stopTimer();
    // Small time bonus
    score += Math.max(0, 3000 - timer);
    updateScores();
    if (isDaily) {
        maybePromptNickname();
        submitDailyScore();
    }
    alert('Puzzle complete!');
}

function maybePromptNickname() {
    const name = localStorage.getItem('sudoku:nickname');
    if (!name) {
        const n = prompt('Great job! Enter nickname for leaderboard:');
        if (n !== null) {
            localStorage.setItem('sudoku:nickname', n.trim());
            updateGreeting();
        }
    }
}

// ---------- Leaderboard (via serverless API) ----------
function updateLBStatus() {
    const el = document.getElementById('lbStatus');
    if (el) {
        el.textContent = 'API Connected';
    }
}

async function submitDailyScore() {
    const nickname = localStorage.getItem('sudoku:nickname') || 'Anonymous';
    if (!currentDailyDateStr) return;
    try {
        const r = await fetch('/api/leaderboard', { // <-- remove .js
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                puzzle_date: currentDailyDateStr,
                nickname,
                score,
            }),
        });
        if (!r.ok) throw new Error(await r.text());
        await refreshLeaderboard();
    } catch (e) {
        console.warn('Submit error:', e);
    }
}

async function fetchLeaderboardAPI(dateStr) {
    const r = await fetch(`/api/leaderboard?date=${encodeURIComponent(dateStr)}`);
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    return data.rows || [];
}

async function refreshLeaderboard() {
    const body = document.getElementById('lbBody');
    body.innerHTML = '';
    const dateStr = currentDailyDateStr || new Date().toISOString().slice(0, 10);
    document.getElementById('lbDate').textContent = dateStr;

    try {
        const rows = await fetchLeaderboardAPI(dateStr);
        if (rows.length === 0) {
            body.innerHTML =
                '<tr><td colspan="4" style="color:var(--muted);">No scores yet. Be the first!</td></tr>';
            return;
        }
        rows.forEach((r, i) => {
            const tr = document.createElement('tr');
            const when = new Date(r.created_at).toLocaleString();
            tr.innerHTML = `<td>${i + 1}</td><td>${escapeHtml(r.nickname)}</td><td>${r.score}</td><td>${when}</td>`;
            body.appendChild(tr);
        });
    } catch (e) {
        body.innerHTML =
            `<tr><td colspan="4" style="color:var(--muted);">Error loading leaderboard.</td></tr>`;
    }
}
document.getElementById('refreshLB').addEventListener('click', refreshLeaderboard);

function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#39;"
    } [c]));
}

// ---------- Boot ----------
updateLBStatus();
document.getElementById('dailyDate').value = new Date().toISOString().slice(0, 10);

// Start with a quick game
newGameFromSeed(Math.floor(Math.random() * 1e9), 'easy');