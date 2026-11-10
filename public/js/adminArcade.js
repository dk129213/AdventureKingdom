/* ============================================
   Adventure Kingdom - Admin: AK Arcade tab
   Tournament day, tournament standings, all-time high scores.
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const panel = document.getElementById('tab-arcade');
  const tabBtn = document.querySelector('.dash-tab[data-tab="arcade"]');
  if (!panel || !tabBtn || typeof Auth === 'undefined') return;

  const $ = id => document.getElementById(id);
  const esc = str => {
    if (str === null || str === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  };
  const fmtDate = iso => {
    if (!iso) return '-';
    const d = new Date(iso.includes('T') ? iso : iso.replace(' ', 'T') + 'Z');
    return Number.isNaN(d.getTime()) ? esc(iso) : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };
  const fmtScore = n => Number(n).toLocaleString();
  const cellMsg = (cols, text, color = '#999') => `<tr><td colspan="${cols}" style="text-align:center;padding:30px;color:${color};">${esc(text)}</td></tr>`;

  let overview = null;
  let shownTournamentId = null;
  let countdownTimer = null;

  function setMsg(text, isError) {
    const el = $('arcadeMsg');
    el.textContent = text || '';
    el.style.color = isError ? '#c00' : '#27AE60';
  }

  async function api(url, options) {
    const res = await Auth.apiFetch(url, options);
    let data = null;
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) throw new Error((data && data.error) || 'Request failed.');
    return data;
  }

  // ---------------------------------------------------------------- load
  async function load() {
    try {
      overview = await api('/api/arcade/admin/overview');
    } catch (err) {
      setMsg(err.message, true);
      return;
    }
    renderTournamentCard();
    renderHistory();
    renderBoard();
    const pick = shownTournamentId || (overview.active && overview.active.id) || (overview.tournaments[0] && overview.tournaments[0].id);
    if (pick) loadStandings(pick); else $('arcadeStandingsBody').innerHTML = cellMsg(8, 'No tournaments yet.');
  }

  // ---------------------------------------------------------------- tournament card
  function renderTournamentCard() {
    const active = overview.active;
    $('arcadeActive').style.display = active ? '' : 'none';
    $('arcadeStartForm').style.display = active ? 'none' : '';
    clearInterval(countdownTimer);

    const gameSel = $('arcadeGame');
    if (!gameSel.options.length) {
      Object.entries(overview.games).forEach(([id, title]) => gameSel.add(new Option(title, id)));
    }
    const boardSel = $('arcadeBoardGame');
    if (!boardSel.options.length) {
      Object.entries(overview.games).forEach(([id, title]) => boardSel.add(new Option(title, id)));
    }

    if (active) {
      $('arcadeActiveTitle').textContent = `${active.title} · ${active.game_title}`;
      $('arcadeActiveEnds').textContent = fmtDate(active.ends_at);
      const tick = () => {
        const ms = new Date(active.ends_at).getTime() - Date.now();
        if (ms <= 0) { $('arcadeActiveLeft').textContent = 'finished'; clearInterval(countdownTimer); load(); return; }
        const s = Math.floor(ms / 1000);
        const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
        $('arcadeActiveLeft').textContent = (d ? d + 'd ' : '') + `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      };
      tick();
      countdownTimer = setInterval(tick, 1000);
    } else if (!$('arcadeEnds').value) {
      // Default end: tomorrow at 20:00 local time.
      const d = new Date(Date.now() + 86400000);
      d.setHours(20, 0, 0, 0);
      const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      $('arcadeEnds').value = local;
    }
  }

  $('arcadeStartBtn').addEventListener('click', async () => {
    setMsg('');
    const endsLocal = $('arcadeEnds').value;
    if (!endsLocal) { setMsg('Pick an end date and time.', true); return; }
    const ends = new Date(endsLocal);
    const gameTitle = $('arcadeGame').selectedOptions[0].textContent;
    if (!confirm(`Start tournament day on ${gameTitle}?\n\nThe arcade switches to its tournament look for every visitor until ${ends.toLocaleString()}.`)) return;
    try {
      const data = await api('/api/arcade/admin/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ game_id: $('arcadeGame').value, title: $('arcadeTitle').value, ends_at: ends.toISOString() })
      });
      shownTournamentId = data.id;
      setMsg('Tournament day is on!');
      load();
    } catch (err) { setMsg(err.message, true); }
  });

  $('arcadeStopBtn').addEventListener('click', async () => {
    if (!overview || !overview.active) return;
    if (!confirm('Stop the tournament now?\n\nThe standings are frozen as they are and the arcade goes back to normal.')) return;
    try {
      await api(`/api/arcade/admin/tournaments/${overview.active.id}/stop`, { method: 'POST' });
      setMsg('Tournament stopped.');
      load();
    } catch (err) { setMsg(err.message, true); }
  });

  // ---------------------------------------------------------------- standings
  function renderHistory() {
    const sel = $('arcadeHistory');
    const keep = shownTournamentId;
    sel.innerHTML = '';
    overview.tournaments.forEach(t => {
      const state = t.active ? 'RUNNING' : 'ended ' + fmtDate(t.ended_at);
      sel.add(new Option(`#${t.id} ${t.title} · ${t.game_title} · ${state} · ${t.players} player(s)`, t.id));
    });
    if (keep) sel.value = String(keep);
  }
  $('arcadeHistory').addEventListener('change', e => loadStandings(parseInt(e.target.value, 10)));

  async function loadStandings(id) {
    shownTournamentId = id;
    $('arcadeHistory').value = String(id);
    const body = $('arcadeStandingsBody');
    body.innerHTML = cellMsg(8, 'Loading...');
    try {
      const data = await api(`/api/arcade/admin/tournaments/${id}`);
      if (!data.data.length) { body.innerHTML = cellMsg(8, 'Nobody has joined yet.'); return; }
      let rank = 0;
      body.innerHTML = data.data.map(r => {
        const hasScore = r.score !== null;
        if (hasScore) rank++;
        const crown = hasScore && rank === 1 ? ' &#x1F3C6;' : '';
        return `
        <tr${hasScore && rank === 1 ? ' style="background:#FFF8DC;"' : ''}>
          <td>${hasScore ? rank : '-'}</td>
          <td><strong>${esc(r.display_name)}</strong>${crown}</td>
          <td>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '<span style="color:#999;">removed</span>'}</td>
          <td>${esc(r.phone) || '-'}</td>
          <td><strong>${hasScore ? fmtScore(r.score) : '-'}</strong></td>
          <td>${r.plays}</td>
          <td>${fmtDate(r.joined_at)}</td>
          <td>${hasScore ? `<button class="action-btn delete" data-arcade-remove="${r.score_id}" data-arcade-label="${esc(r.display_name)}: ${fmtScore(r.score)}">Remove score</button>` : ''}</td>
        </tr>`;
      }).join('');
    } catch (err) {
      body.innerHTML = cellMsg(8, err.message, '#c00');
    }
  }

  $('arcadeExportBtn').addEventListener('click', async () => {
    if (!shownTournamentId) { setMsg('No tournament to export yet.', true); return; }
    try {
      const res = await Auth.apiFetch(`/api/arcade/admin/tournaments/${shownTournamentId}/export`);
      if (!res.ok) throw new Error('Export failed.');
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement('a');
      a.href = url; a.download = `ak-arcade-tournament-${shownTournamentId}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) { setMsg(err.message, true); }
  });

  // ---------------------------------------------------------------- all-time boards
  function renderBoard() {
    const game = $('arcadeBoardGame').value || Object.keys(overview.games)[0];
    const rows = overview.boards[game] || [];
    const body = $('arcadeBoardBody');
    if (!rows.length) { body.innerHTML = cellMsg(6, 'No scores saved for this game yet.'); return; }
    body.innerHTML = rows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${esc(r.name)}</strong>${r.display_name ? ` <span style="color:#999;">(${esc(r.display_name)})</span>` : ''}</td>
        <td><strong>${fmtScore(r.score)}</strong></td>
        <td>${r.email ? `<a href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : '<span style="color:#999;">-</span>'}</td>
        <td>${fmtDate(r.created_at)}</td>
        <td><button class="action-btn delete" data-arcade-remove="${r.id}" data-arcade-label="${esc(r.name)}: ${fmtScore(r.score)}">Remove score</button></td>
      </tr>`).join('');
  }
  $('arcadeBoardGame').addEventListener('change', renderBoard);

  // one handler for every "Remove score" button
  panel.addEventListener('click', async e => {
    const btn = e.target.closest('[data-arcade-remove]');
    if (!btn) return;
    if (!confirm(`Remove this score?\n\n${btn.dataset.arcadeLabel}\n\nThis cannot be undone.`)) return;
    try {
      await api(`/api/arcade/admin/scores/${btn.dataset.arcadeRemove}`, { method: 'DELETE' });
      setMsg('Score removed.');
      load();
    } catch (err) { setMsg(err.message, true); }
  });

  $('arcadeRefreshBtn').addEventListener('click', () => { setMsg(''); load(); });
  tabBtn.addEventListener('click', load);
});
