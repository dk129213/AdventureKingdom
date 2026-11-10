// AKarcade online layer: server-side high scores and Tournament Day.
// Talks to /api/arcade on the Adventure Kingdom server. If that API is not there (for example the
// arcade is opened from a plain static host) everything quietly falls back to on-device scores.
(() => {
  'use strict';
  const AK = window.AK;
  if (!AK || !AK.scores) return;

  const API = '/api/arcade';
  const TOKEN_KEY = 'akarcade.player';
  const $ = id => document.getElementById(id);
  const fmt = n => Number(n).toLocaleString('en-US');

  const state = {
    online: false,
    tournament: null,     // running tournament or null
    recent: null,         // tournament that finished in the last few days, or null
    joined: false,
    name: '',
    clockSkew: 0,         // server time minus device time, in ms
    best: null, rank: null,
  };
  AK.online = state;

  const player = () => AK.store.get(TOKEN_KEY, null);
  const token = () => { const p = player(); return p && typeof p.token === 'string' ? p.token : null; };

  async function call(path, options = {}) {
    const res = await fetch(API + path, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      cache: 'no-store',
    });
    let data = null;
    try { data = await res.json(); } catch (e) { /* not JSON */ }
    if (!res.ok) { const err = new Error((data && data.error) || 'Something went wrong. Please try again.'); err.status = res.status; throw err; }
    return data;
  }

  // ------------------------------------------------------------ shared high scores
  const serverBoards = {};
  const localGet = AK.scores.get, localAdd = AK.scores.add;
  AK.scores.get = id => (serverBoards[id] && serverBoards[id].length ? serverBoards[id].slice(0, 10) : localGet(id));
  AK.scores.add = (id, name, score) => {
    const rank = localAdd(id, name, score);
    if (state.online) {
      call('/scores', { method: 'POST', body: JSON.stringify({ game: id, name, score, token: token() }) })
        .then(d => { if (d && Array.isArray(d.data)) { serverBoards[id] = d.data; if (AK.scores.notify) AK.scores.notify(id); } })
        .catch(() => { /* keep the on-device copy */ });
    }
    return rank;
  };
  async function loadBoards(games) {
    await Promise.all(Object.keys(games).map(async id => {
      try {
        const d = await call('/scores?game=' + encodeURIComponent(id));
        serverBoards[id] = d.data || [];
        if (AK.scores.notify) AK.scores.notify(id);
      } catch (e) { /* ignore */ }
    }));
  }

  // ------------------------------------------------------------ tournament UI
  const bar = $('tBar'), barMsg = $('tBarMsg'), barClock = $('tBarClock'), joinBtn = $('tJoinBtn'), barNote = $('tBarNote');
  const section = $('tournament'), standBody = $('tStandBody'), standTitle = $('tStandTitle'), standNote = $('tStandNote');
  const modal = $('joinModal'), form = $('joinForm'), formErr = $('joinError'), formDone = $('joinDone');
  let noteTimer = null;

  function note(text, ms = 9000) {
    if (!barNote) return;
    barNote.textContent = text || '';
    clearTimeout(noteTimer);
    if (text && ms) noteTimer = setTimeout(() => { barNote.textContent = ''; }, ms);
  }

  function setTheme(on) {
    document.body.classList.toggle('tournament', on);
    AK.tournamentTheme = on;
    window.dispatchEvent(new Event('ak-theme'));
    const h1 = $('roomHeadline'), eyebrow = $('roomEyebrow');
    if (h1) h1.innerHTML = on ? 'Tournament<br><em>Day</em>' : 'One more<br><em>credit.</em>';
    if (eyebrow) eyebrow.textContent = on ? 'TOURNAMENT DAY IS ON' : 'THE ARCADE IS OPEN';
  }

  function tickClock() {
    const t = state.tournament;
    if (!t || !barClock) return;
    const ms = new Date(t.ends_at).getTime() - (Date.now() + state.clockSkew);
    if (ms <= 0) { barClock.textContent = '00:00:00'; refresh(); return; }
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    const p = n => String(n).padStart(2, '0');
    barClock.textContent = (d ? d + 'd ' : '') + p(h) + ':' + p(m) + ':' + p(s % 60);
  }
  setInterval(tickClock, 1000);

  let focusedOnce = false;
  function render() {
    const t = state.tournament, r = state.recent;
    setTheme(!!t);
    if (!bar) return;
    bar.hidden = !(t || r);
    section.hidden = !(t || r);
    if (t) {
      barMsg.textContent = t.title + ' · ' + t.game_title;
      barClock.hidden = false;
      tickClock();
      joinBtn.hidden = false;
      joinBtn.disabled = state.joined;
      joinBtn.textContent = state.joined ? '✓ JOINED AS ' + state.name.toUpperCase() : 'JOIN THE TOURNAMENT';
      standTitle.textContent = t.title + ' · ' + t.game_title;
      standNote.textContent = state.joined
        ? 'You are in. Every game of ' + t.game_title + ' you finish counts, and your best score is the one that stands.'
        : 'Highest score on ' + t.game_title + ' when the clock runs out wins. Join to make your scores count.';
      // walk the visitor up to the tournament cabinet, once
      if (!focusedOnce && AK.host && AK.host.mode() === 'room') {
        const i = AK.host.games.findIndex(g => g.id === t.game_id);
        if (i >= 0) { AK.host.focus(i, true); focusedOnce = true; }
      }
    } else if (r) {
      barClock.hidden = true;
      joinBtn.hidden = true;
      barMsg.textContent = r.winner
        ? r.title + ' is over · Winner: ' + r.winner.name + ' with ' + fmt(r.winner.score) + ' on ' + r.game_title
        : r.title + ' is over';
      standTitle.textContent = r.title + ' · ' + r.game_title + ' · final standings';
      standNote.textContent = 'The winner will be contacted by e-mail.';
    }
  }

  async function loadStandings() {
    if (!section || section.hidden) return;
    try {
      const d = await call('/tournament/leaderboard');
      standBody.textContent = '';
      if (!d.data.length) {
        const li = document.createElement('li');
        li.className = 'empty';
        li.textContent = 'No scores yet. Be the first on the board!';
        standBody.append(li);
        return;
      }
      d.data.forEach(row => {
        const li = document.createElement('li');
        if (state.joined && row.name === state.name) li.className = 'me';
        const rank = document.createElement('span'); rank.textContent = row.rank === 1 ? '🏆' : row.rank + '.';
        const name = document.createElement('span'); name.textContent = row.name;
        const score = document.createElement('span'); score.textContent = fmt(row.score);
        li.append(rank, name, score);
        standBody.append(li);
      });
    } catch (e) { /* keep the last list */ }
  }

  async function refresh() {
    try {
      const d = await call('/status');
      state.online = true;
      state.clockSkew = new Date(d.now).getTime() - Date.now();
      const changed = (state.tournament && state.tournament.id) !== (d.tournament && d.tournament.id);
      state.tournament = d.tournament;
      state.recent = d.recent;
      if (changed) { state.joined = false; state.best = state.rank = null; }
      if (d.tournament && token() && !state.joined) {
        try {
          const me = await call('/me', { method: 'POST', body: JSON.stringify({ token: token() }) });
          state.joined = !!me.joined;
          state.name = me.name || '';
        } catch (e) { /* treat as not joined */ }
      }
      render();
      loadStandings();
      return d;
    } catch (e) {
      state.online = false;      // no API here: plain on-device arcade
      return null;
    }
  }

  // called by the host every time a game ends
  AK.onGameOver = (id, score) => {
    const t = state.tournament;
    if (!state.online || !t || t.game_id !== id) return;
    if (!state.joined) { note('Join the tournament to make your ' + t.game_title + ' scores count!', 12000); return; }
    call('/scores', { method: 'POST', body: JSON.stringify({ game: id, kind: 'tournament', score, token: token() }) })
      .then(d => {
        state.best = d.best; state.rank = d.rank;
        note('Score in: ' + fmt(score) + ' · your best ' + fmt(d.best) + ' · rank #' + d.rank + ' of ' + d.players, 15000);
        loadStandings();
      })
      .catch(err => { if (err.status === 409 || err.status === 403) refresh(); });
  };

  // ------------------------------------------------------------ join form
  let lastFocus = null;
  function openJoin() {
    if (!modal || !state.tournament) return;
    lastFocus = document.activeElement;
    formErr.textContent = '';
    form.hidden = false; formDone.hidden = true;
    modal.hidden = false;
    document.body.classList.add('modal-open');
    AK.inputBlocked = true;
    $('joinGame').textContent = state.tournament.game_title;
    setTimeout(() => $('joinName').focus(), 30);
  }
  function closeJoin() {
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove('modal-open');
    AK.inputBlocked = false;
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  if (joinBtn) joinBtn.addEventListener('click', openJoin);
  if (modal) {
    modal.addEventListener('click', e => { if (e.target === modal || e.target.closest('[data-close]')) closeJoin(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modal.hidden) { e.stopPropagation(); closeJoin(); } }, true);
    form.addEventListener('submit', async e => {
      e.preventDefault();
      formErr.textContent = '';
      const body = {
        display_name: $('joinName').value.trim(),
        email: $('joinEmail').value.trim(),
        phone: $('joinPhone').value.trim(),
        guardian: $('joinGuardian').checked,
        consent: $('joinConsent').checked,
      };
      if (body.display_name.length < 2) { formErr.textContent = 'Please enter a player name (2 to 16 characters).'; return; }
      if (!body.guardian) { formErr.textContent = 'A parent or guardian must tick the first box (or the player must be 16 or older).'; return; }
      if (!body.consent) { formErr.textContent = 'Please tick the privacy box to join.'; return; }
      const submit = $('joinSubmit');
      submit.disabled = true;
      try {
        const csrf = await (await fetch('/api/csrf-token', { cache: 'no-store' })).json();
        const d = await call('/join', { method: 'POST', headers: { 'x-csrf-token': csrf.token }, body: JSON.stringify(body) });
        AK.store.set(TOKEN_KEY, { token: d.token, name: d.name });
        state.joined = true; state.name = d.name;
        form.reset();
        form.hidden = true; formDone.hidden = false;
        $('joinDoneName').textContent = d.name;
        render(); loadStandings();
      } catch (err) {
        formErr.textContent = err.message;
      }
      submit.disabled = false;
    });
  }

  // ------------------------------------------------------------ start
  refresh().then(d => { if (d) loadBoards(d.games); });
  setInterval(() => { if (!document.hidden && state.online) refresh(); }, 45000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.online) refresh(); });
})();
