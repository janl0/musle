const STAGES = [1, 2, 4, 8, 15];
const MAX_GUESSES = STAGES.length;
const SONGS_PER_DAY = 3;

const DAILY_QUERIES = [
    'Daft Punk Get Lucky', 'Queen Bohemian Rhapsody', 'Michael Jackson Billie Jean',
    'Nirvana Smells Like Teen Spirit', 'Adele Rolling in the Deep', 'The Weeknd Blinding Lights',
    'Eminem Lose Yourself', 'Radiohead Creep', 'Dua Lipa Levitating', 'Coldplay Yellow',
    'ABBA Dancing Queen', 'Billie Eilish bad guy', 'Oasis Wonderwall', 'Prince Purple Rain',
    'Lady Gaga Poker Face', 'Fleetwood Mac Dreams', 'Kendrick Lamar HUMBLE', 'Rihanna Umbrella',
    'a-ha Take On Me', 'Stevie Wonder Superstition', 'Taylor Swift Shake It Off', 'Ed Sheeran Shape of You'
];

const el = {
    guesses:   [1, 2, 3, 4, 5].map(n => document.getElementById('guess' + n)),
    input:     document.getElementById('currentGuess'),
    options:   document.getElementById('songOptions'),
    playBtn:   document.getElementById('playBtn'),
    playIcon:  document.getElementById('playIcon'),
    skipBtn:   document.getElementById('skipBtn'),
    submitBtn: document.getElementById('submitBtn'),
    time:      document.getElementById('currentTime'),
    stageTime: document.getElementById('stageTime'),
    segs:      [...document.querySelectorAll('.seg')],
    status:    document.getElementById('status'),
    statusBox: document.getElementById('statusBox'),
    nextBtn:   document.getElementById('nextBtn'),
    songList:  document.getElementById('songList'),
};

const audio = new Audio();
audio.preload = 'auto';

let games = [];
let round = 0;
let current = 0;
let optionMap = new Map();
let rafId = null;

const game = () => games[current];
const answer = () => game().song;
const stage = () => (game().finished ? MAX_GUESSES - 1 : Math.min(game().guesses.length, MAX_GUESSES - 1));

function jsonp(url) {
    return new Promise((resolve, reject) => {
        const cb = 'cb_' + Math.random().toString(36).slice(2);
        const script = document.createElement('script');
        const timer = setTimeout(() => { cleanup(); reject(new Error('Request timed out')); }, 8000);
        function cleanup() { clearTimeout(timer); delete window[cb]; script.remove(); }
        window[cb] = data => { cleanup(); resolve(data); };
        script.onerror = () => { cleanup(); reject(new Error('Network error')); };
        script.src = `${url}&callback=${cb}`;
        document.head.appendChild(script);
    });
}

async function searchSongs(term, limit = 8) {
    const url = `https://itunes.apple.com/search?media=music&entity=song&limit=${limit}&term=${encodeURIComponent(term)}`;
    const data = await jsonp(url);
    return data.results
        .filter(r => r.previewUrl)
        .map(r => ({
            id: r.trackId,
            title: r.trackName,
            artist: r.artistName,
            album: r.collectionName,
            previewUrl: r.previewUrl,
            artwork: (r.artworkUrl100 || '').replace('100x100', '600x600'),
        }));
}

async function loadRoundSongs(roundNumber) {
    const queries = Array.from({ length: SONGS_PER_DAY },
        (_, i) => DAILY_QUERIES[(roundNumber * SONGS_PER_DAY + i) % DAILY_QUERIES.length]);
    const found = await Promise.all(queries.map(q => searchSongs(q, 5)));
    return found.map((results, i) => {
        if (!results.length) throw new Error('No playable song for: ' + queries[i]);
        return results[0];
    });
}

const labelFor = song => `${song.title} – ${song.artist}`;

function normalize(str) {
    return str.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\(.*?\)|\[.*?\]/g, '')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ').trim();
}

function isCorrect(text) {
    const picked = optionMap.get(text);
    if (picked) return picked.id === answer().id || normalize(picked.title) === normalize(answer().title);

    const g = normalize(text);
    return g === normalize(answer().title) || g === normalize(labelFor(answer()));
}

const debounce = (fn, ms) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

function playSnippet() {
    audio.currentTime = 0;
    audio.play();
    el.playIcon.className = 'bi bi-pause-fill';
    tick();
}

function stopSnippet() {
    audio.pause();
    audio.currentTime = 0;
    el.playIcon.className = 'bi bi-play-fill';
    cancelAnimationFrame(rafId);
    updateTime(0);
}

function togglePlay() {
    audio.paused ? playSnippet() : stopSnippet();
}

function tick() {
    const limit = game().finished ? audio.duration || STAGES[STAGES.length - 1] : STAGES[stage()];
    updateTime(audio.currentTime);
    if (audio.currentTime >= limit) return stopSnippet();
    rafId = requestAnimationFrame(tick);
}

function updateTime(seconds) {
    el.time.textContent = seconds.toFixed(1) + 's';
}

function renderStage() {
    el.stageTime.textContent = STAGES[stage()] + 's';
    el.segs.forEach((seg, i) => seg.classList.toggle('active', i <= stage()));
}

function renderGuesses() {
    el.guesses.forEach((row, i) => {
        const g = game().guesses[i];
        row.textContent = g ? g.text : '';
        row.className = 'guess' + (g ? ' ' + g.status : '');
    });
}

function renderSongList() {
    el.songList.replaceChildren(...games.map((g, i) => {
        const li = document.createElement('li');
        const btn = document.createElement('button');
        btn.className = 'song-item'
            + (i === current ? ' active' : '')
            + (g.finished ? (g.won ? ' won' : ' lost') : '');
        btn.innerHTML = '<span class="num"></span><span class="name"></span>';
        btn.querySelector('.num').textContent = i + 1;
        btn.querySelector('.name').textContent = g.finished ? labelFor(g.song) : '';
        btn.addEventListener('click', () => selectSong(i));
        li.appendChild(btn);
        return li;
    }));
}

function renderStatus() {
    const g = game();
    el.statusBox.hidden = !g.finished;
    if (!g.finished) return;

    const solved = games.filter(x => x.won).length;
    const allDone = games.every(x => x.finished);
    el.statusBox.className = 'status ' + (g.won ? 'win' : 'lose');
    el.status.textContent = (g.won
        ? `Nice! It was "${g.song.title}" by ${g.song.artist}. You got it in ${g.guesses.length}.`
        : `Out of guesses. It was "${g.song.title}" by ${g.song.artist}.`)
        + (allDone ? ` All done: you solved ${solved} of ${games.length}. Reload for ${games.length} new songs.` : '');
    el.nextBtn.hidden = allDone;
}

function setControlsEnabled(enabled) {
    [el.input, el.skipBtn, el.submitBtn].forEach(c => c.disabled = !enabled);
}

function render() {
    renderGuesses();
    renderStage();
    renderSongList();
    renderStatus();
    setControlsEnabled(!game().finished);
    updateTime(0);
}

function selectSong(index) {
    if (index === current) return;
    stopSnippet();
    current = index;
    audio.src = answer().previewUrl;
    el.input.value = '';
    saveState();
    render();
}

function nextSong() {
    for (let step = 1; step <= games.length; step++) {
        const i = (current + step) % games.length;
        if (!games[i].finished) return selectSong(i);
    }
}

function submitGuess() {
    const text = el.input.value.trim();
    if (game().finished || !text) return;
    addGuess(text, isCorrect(text) ? 'correct' : 'wrong');
}

function skipGuess() {
    if (game().finished) return;
    addGuess('Skipped', 'skipped');
}

function addGuess(text, status) {
    const g = game();
    g.guesses.push({ text, status });
    el.input.value = '';
    stopSnippet();

    if (status === 'correct') { g.finished = true; g.won = true; }
    else if (g.guesses.length >= MAX_GUESSES) { g.finished = true; g.won = false; }

    saveState();
    render();
}

const updateSuggestions = debounce(async () => {
    const term = el.input.value.trim();
    if (term.length < 2) return;
    try {
        const songs = await searchSongs(term);
        optionMap = new Map(songs.map(s => [labelFor(s), s]));
        el.options.replaceChildren(...songs.map(s => {
            const o = document.createElement('option');
            o.value = labelFor(s);
            return o;
        }));
    } catch (err) {
        console.warn('Suggestion search failed:', err.message);
    }
}, 350);

const STORAGE_KEY = 'musle-progress';

function readSaved() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}

function saveState() {
    try {
        const data = {
            round,
            current,
            games: games.map(({ guesses, finished, won }) => ({ guesses, finished, won }))
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {}
}

async function init() {
    el.playBtn.disabled = true;
    let saved = readSaved();
    if (saved && Array.isArray(saved.games)) {
        round = saved.games.every(g => g.finished) ? saved.round + 1 : saved.round;
        if (round !== saved.round) saved = null;
    } else {
        saved = null;
    }
    try {
        const songs = await loadRoundSongs(round);
        games = songs.map(song => ({ song, guesses: [], finished: false, won: false }));
    } catch (err) {
        el.statusBox.hidden = false;
        el.statusBox.className = 'status lose';
        el.status.textContent = "Could not load the songs. Check your connection and refresh.";
        return;
    }
    if (saved && saved.games.length === games.length) {
        saved.games.forEach((g, i) => Object.assign(games[i], g));
        current = Math.min(saved.current, games.length - 1);
    }
    saveState();
    audio.src = answer().previewUrl;
    render();
    el.playBtn.disabled = false;

    el.playBtn.addEventListener('click', togglePlay);
    el.submitBtn.addEventListener('click', submitGuess);
    el.skipBtn.addEventListener('click', skipGuess);
    el.nextBtn.addEventListener('click', nextSong);
    el.input.addEventListener('input', updateSuggestions);
    el.input.addEventListener('keydown', e => { if (e.key === 'Enter') submitGuess(); });
    audio.addEventListener('ended', stopSnippet);
}

init();