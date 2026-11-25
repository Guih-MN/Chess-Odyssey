'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => s.replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');

/* ---------- PROGRESSO (localStorage) ---------- */
const S = Object.assign({ name: 'Player', named: false, done: 0, xp: 0, coins: 0, daily: '', own: [], theme: 'classic', avatar: 'pawn' }, JSON.parse(localStorage.getItem('chessOdyssey') || '{}'));
const save = () => localStorage.setItem('chessOdyssey', JSON.stringify(S));
/* ---------- NÍVEIS E XP ---------- */
const TOTAL = 100;                  // quantidade de fases no mapa
const isBoss = n => n % 5 === 0;   // a cada 5 fases há um chefe
// Dificuldade da CPU: r = rating exibido | d = profundidade da busca | n = "erro" aleatório (maior = mais fraca)
const cfg = n => ({
  r: Math.round((100 + 33 * (n - 1)) / 10) * 10,
  d: Math.min(3, (n < 4 ? 1 : n < 13 ? 2 : 3) + (isBoss(n) ? 1 : 0)),
  n: isBoss(n) ? 0 : Math.max(0, 300 - n * 26)
});
const xpReward = n => 30 + 10 * n;          // quanto mais alta a fase, mais XP (fase 1 = 40, fase 30 = 330)
const xpNeed = lv => 100 + 50 * (lv - 1);   // quanto maior o nível, mais XP para o próximo (1→2 = 100, 2→3 = 150...)
function xpInfo(total) {                    // transforma o XP total em { nível, XP dentro do nível, XP necessário }
  let lv = 1, rest = total, need = xpNeed(1);
  while (rest >= need) { rest -= need; lv++; need = xpNeed(lv); }
  return { lv, into: rest, need };
}
// Refazer uma fase já vencida rende só 25% da recompensa
const rewardFor = n => {
  const first = n > S.done, f = first ? 1 : 0.25;
  return { first, xp: Math.round(xpReward(n) * f), coins: Math.round(25 * n * f) };
};

/* ---------- NAVEGAÇÃO / MODAL ---------- */
function go(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  if (id === 'challenge') renderChallenge();
  if (id === 'shop') renderShop();
  if (id === 'map') {
    renderMap();
    if (animFrom) {   // após vencer: começa na fase anterior e sobe até a nova
      centerOn(animFrom, false);
      setTimeout(() => centerOn(Math.min(S.done + 1, TOTAL), true), 350);
      animFrom = null;
    } else centerOn(sel, false);
  }
}
const dlg = $('#modal');
function modal(html, btns = [['OK']]) {
  $('#mBody').innerHTML = html;
  const box = $('#mBtns'); box.innerHTML = '';
  btns.forEach(([label, fn, cls]) => {
    const b = document.createElement('button');
    b.className = 'btn sm ' + (cls || ''); b.textContent = label;
    b.onclick = () => { dlg.close(); if (fn) fn(); };
    box.append(b);
  });
  dlg.showModal();
}
const MODALS = {
  profile: () => modal(`<h3>${esc(S.name)}</h3><p>Player level ${xpInfo(S.xp).lv} &middot; ${S.xp} XP total</p><p>Coins: ${S.coins}</p><p>Levels completed: ${S.done} / ${TOTAL}</p>`),
  settings: () => {
    modal(`<h3>Settings</h3><p>Player name</p><input id="nm" maxlength="14">`, [
      ['Save', () => { const v = $('#nm').value.trim(); if (v) { if (v !== S.name) S.named = true; S.name = v; } save(); renderHud(); }],
      ['Reset', () => { if (confirm('Erase all progress?')) { Object.assign(S, { done: 0, xp: 0, coins: 0, daily: '', own: [], theme: 'classic', avatar: 'pawn' }); save(); applyLook(); sel = 1; renderMap(); } }, 'red']
    ]);
    $('#nm').value = S.name;
  }
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-go],[data-modal]');
  if (!t) return;
  t.dataset.go ? go(t.dataset.go) : MODALS[t.dataset.modal]();
});

/* ---------- MAPA (rola na vertical, fase 1 embaixo, como no Candy Crush) ---------- */
const GAP = 96, PAD = 100, MAP_H = TOTAL * GAP + PAD * 2;
const xOf = n => 50 + 27 * Math.sin(n * 0.95);   // % da largura: caminho em zigue-zague
const yOf = n => MAP_H - PAD - (n - 1) * GAP;     // px a partir do topo
let sel = Math.min(S.done + 1, TOTAL), xpFrom = null, animFrom = null;
$('#mapArea').style.height = MAP_H + 'px';

function renderHud() {
  const i = xpInfo(S.xp), fill = $('#xpFill');
  $('#pName').textContent = S.name;
  $('#pLvl').textContent = 'Lv ' + i.lv;
  $('#pCoins').textContent = S.coins;
  $('#xpText').textContent = `${i.need - i.into} XP to Lv ${i.lv + 1}`;
  if (xpFrom !== null) {                          // anima a barra a partir do valor antigo
    fill.style.transition = 'none'; fill.style.width = xpFrom + '%'; fill.offsetWidth; fill.style.transition = ''; xpFrom = null;
  }
  fill.style.width = (i.into / i.need * 100) + '%';
}
const seg = k => {
  const x1 = xOf(k), y1 = yOf(k), x2 = xOf(k + 1), y2 = yOf(k + 1);
  return `M${x1} ${y1}C${x1} ${y1 - GAP / 2} ${x2} ${y2 + GAP / 2} ${x2} ${y2}`;
};
function renderMap() {
  const cur = Math.min(S.done + 1, TOTAL);
  if (sel > cur) sel = cur;
  let all = '', done = '', deco = '', nodes = '';
  for (let k = 1; k < TOTAL; k++) { all += seg(k); if (k <= S.done) done += seg(k); }
  for (let i = 0; i < MAP_H / 230; i++) {          // peças decorativas por todo o mapa
    const w = 44 + (i * 17) % 28, side = i % 2 ? 'right' : 'left';
    deco += `<i class="ghost" style="${side}:${2 + (i * 7) % 9}%;top:${90 + i * 230}px;width:${w}px;transform:rotate(${(i % 5 - 2) * 9}deg)">${pc('kqnbrp'[i % 6], '')}</i>`;
  }
  for (let n = 1; n <= TOTAL; n++) {
    const locked = n > S.done + 1;
    const badge = n <= S.done ? '\u2713' : locked ? '\uD83D\uDD12' : isBoss(n) ? '\u2620' : '';
    const cls = [locked ? 'locked' : '', isBoss(n) ? 'boss' : '', n === sel ? 'sel' : ''].join(' ');
    nodes += `<button class="node ${cls}" style="left:${xOf(n)}%;top:${yOf(n)}px" data-l="${n}" aria-label="Level ${n}"><span data-b="${badge}">${n}</span></button>`;
  }
  $('#mapArea').innerHTML = deco +
    `<svg viewBox="0 0 100 ${MAP_H}" preserveAspectRatio="none"><path d="${all}"/><path class="done" d="${done || 'M0 0'}"/></svg>` + nodes;
  $('#infoTitle').textContent = 'LEVEL ' + sel + (isBoss(sel) ? ' \u2620' : '');
  $('#infoSub').innerHTML = `OPPONENT: CPU (RATING ${cfg(sel).r})<br>REWARD: +${rewardFor(sel).xp} XP`;
  renderHud();
}
const centerOn = (n, smooth) => {
  const sc = $('#mapScroll');
  sc.scrollTo({ top: Math.max(0, yOf(n) - sc.clientHeight / 2), behavior: smooth ? 'smooth' : 'auto' });
};
$('#mapArea').addEventListener('click', e => {
  const n = e.target.closest('.node');
  if (!n) return;
  const l = +n.dataset.l;
  if (l > S.done + 1) return modal(`<h3>Level ${l} is locked</h3><p>Beat level ${l - 1} to unlock it.</p>`);
  sel = l; renderMap();
});
$('#startLevel').onclick = () => startLevel(sel);

/* ---------- MOTOR DE XADREZ ---------- */
// Maiúscula = brancas (jogador) | minúscula = pretas (CPU). Sem roque nem en passant; peão promove a rainha.
// Peças: imagens embutidas em pieces.js (PIECE_DATA). Maiúscula = brancas, minúscula = pretas
const SRC = {};
for (const k of ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP', 'home']) {
  try {   // usa as imagens embutidas em pieces.js; se ele faltar ou estiver quebrado, usa a pasta pieces/
    const bin = atob(PIECE_DATA[k]), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    SRC[k] = URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  } catch (e) {
    SRC[k] = `pieces/${k === 'home' ? 'king-home' : k}.png`;
  }
}
const pc = (p, cls = p.toUpperCase()) =>
  `<img class="pc ${cls}" src="${SRC[(isW(p) ? 'w' : 'b') + p.toUpperCase()]}" alt="" draggable="false">`;
const INIT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
const isW = p => p === p.toUpperCase();
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]], DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const KN = [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]];

function pseudo(b, i) {
  const p = b[i], w = isW(p), t = p.toLowerCase(), r = i >> 3, c = i & 7, out = [];
  const add = (R, C) => {
    if (R < 0 || R > 7 || C < 0 || C > 7) return false;
    const q = b[R * 8 + C];
    if (!q) { out.push(R * 8 + C); return true; }
    if (isW(q) !== w) out.push(R * 8 + C);
    return false;
  };
  const ray = ds => ds.forEach(([a, d]) => { for (let k = 1; add(r + a * k, c + d * k); k++); });
  if (t === 'n') KN.forEach(([a, d]) => add(r + a, c + d));
  else if (t === 'k') {
    [...ORTH, ...DIAG].forEach(([a, d]) => add(r + a, c + d));
    const cr = b.cr | 0, home = w ? 60 : 4, R = w ? 'R' : 'r';   // roque: casas livres e torre no lugar (xeque é verificado em legal)
    if (i === home) {
      if ((cr & (w ? 1 : 4)) && !b[home + 1] && !b[home + 2] && b[home + 3] === R) out.push(home + 2);
      if ((cr & (w ? 2 : 8)) && !b[home - 1] && !b[home - 2] && !b[home - 3] && b[home - 4] === R) out.push(home - 2);
    }
  }
  else if (t === 'r') ray(ORTH);
  else if (t === 'b') ray(DIAG);
  else if (t === 'q') ray([...ORTH, ...DIAG]);
  else {
    const f = w ? -1 : 1;
    if (!b[(r + f) * 8 + c]) {
      out.push((r + f) * 8 + c);
      if (r === (w ? 6 : 1) && !b[(r + 2 * f) * 8 + c]) out.push((r + 2 * f) * 8 + c);
    }
    [-1, 1].forEach(d => {
      const q = b[(r + f) * 8 + c + d];
      if (c + d >= 0 && c + d < 8 && ((q && isW(q) !== w) || (!q && (r + f) * 8 + c + d === b.ep))) out.push((r + f) * 8 + c + d);
    });
  }
  return out;
}
function make(b, i, t, promo = 'Q') {   // promo: peça escolhida na promoção (Q, R, B ou N); a CPU sempre usa a dama
  const n = b.slice(), p = n[i], lo = p.toLowerCase();
  n.cr = (b.cr | 0) & ~((LOSE[i] | 0) | (LOSE[t] | 0));   // rei ou torre que sai do lugar (ou é capturada) perde o roque
  n.ep = lo === 'p' && Math.abs(t - i) === 16 ? (i + t) / 2 : -1;
  if (lo === 'p' && !n[t] && (i & 7) !== (t & 7)) n[(i & 56) + (t & 7)] = '';   // en passant: remove o peão capturado
  if (lo === 'k' && Math.abs(t - i) === 2) {                                    // roque: a torre pula para o outro lado do rei
    const row = i & 56;
    if (t > i) { n[row + 5] = n[row + 7]; n[row + 7] = ''; } else { n[row + 3] = n[row]; n[row] = ''; }
  }
  n[t] = (p === 'P' && t < 8) ? promo : (p === 'p' && t > 55) ? promo.toLowerCase() : p;
  n[i] = '';
  return n;
}
const LOSE = { 4: 12, 0: 8, 7: 4, 60: 3, 56: 2, 63: 1 };   // casa -> direitos de roque perdidos se algo sai dela ou chega nela
function inCheck(b, w) {
  const k = b.indexOf(w ? 'K' : 'k'), f = w ? 1 : -1;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || isW(p) === w) continue;
    if (p.toLowerCase() === 'p') {
      if ((k >> 3) === (i >> 3) + f && Math.abs((k & 7) - (i & 7)) === 1) return true;
    } else if (pseudo(b, i).includes(k)) return true;
  }
  return false;
}
const legal = (b, i) => {
  const w = isW(b[i]), king = b[i].toLowerCase() === 'k';
  return pseudo(b, i).filter(t => {
    if (king && Math.abs(t - i) === 2 && (inCheck(b, w) || inCheck(make(b, i, (i + t) / 2), w))) return false;
    return !inCheck(make(b, i, t), w);
  });
};
function allMoves(b, w) {
  const out = [];
  b.forEach((p, i) => { if (p && isW(p) === w) legal(b, i).forEach(t => out.push([i, t])); });
  return out;
}

/* ---------- CPU ---------- */
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
function evaluate(b) {
  return b.reduce((s, p, i) => {
    if (!p) return s;
    const t = p.toLowerCase();
    const v = VAL[t] + (t === 'p' || t === 'k' ? 0 : (7 - Math.abs(7 - 2 * (i >> 3)) - Math.abs(7 - 2 * (i & 7))) * 2);
    return s + (isW(p) ? v : -v);
  }, 0);
}
function search(b, w, d, a, be) {
  if (!d) return (w ? 1 : -1) * evaluate(b);
  const ms = allMoves(b, w);
  if (!ms.length) return inCheck(b, w) ? -99999 - d : 0;
  let best = -Infinity;
  for (const [i, t] of ms) {
    const s = -search(make(b, i, t), !w, d - 1, -be, -a);
    if (s > best) best = s;
    if (best > a) a = best;
    if (a >= be) break;
  }
  return best;
}
function cpuMove(b, L) {
  let best = null, bs = -Infinity;
  allMoves(b, false).forEach(([i, t]) => {
    const s = -search(make(b, i, t), true, L.d - 1, -Infinity, Infinity) + Math.random() * L.n;
    if (s > bs) { bs = s; best = [i, t]; }
  });
  return best;
}

/* ---------- PARTIDA (fases, treino, 2 jogadores e desafios usam a mesma tela) ---------- */
let g = null, lastOpts = null;
const fromFen = (f, cr = 0) => {   // cr: direitos de roque (puzzles e testes começam sem roque)
  const a = f.replace(/\d/g, n => '.'.repeat(n)).replace(/\//g, '').split('').map(c => c === '.' ? '' : c);
  a.cr = cr; a.ep = -1;
  return a;
};
const say = msg => { $('#status').textContent = msg; };

// o = { mode: level | practice | local | challenge, back (tela ao sair), title, l1, l2 (card do oponente), L (CPU), lvl, b (posição inicial) }
function startGame(o) {
  lastOpts = o;
  g = { ...o, b: o.b || fromFen(INIT, 15), turn: 'w', sel: -1, hints: [], last: null, over: false, busy: false };
  g.start = g.b.slice();
  $('#gTitle').textContent = o.title;
  $('#gL1').textContent = o.l1;
  $('#gL2').textContent = o.l2;
  $('#btnGive').innerHTML = o.mode === 'local' || o.mode === 'challenge' ? '&#10005; EXIT' : '&#10005; GIVE UP';
  showBoard(true);
  go('game');
  draw();
}
const startLevel = l => startGame({ mode: 'level', back: 'map', title: 'LEVEL ' + l, l1: 'OPPONENT: CPU', l2: 'RATING ' + cfg(l).r, L: cfg(l), lvl: l });

// Promoção: 4 quadradinhos sobre a coluna de destino (dama, torre, bispo, cavalo), a partir da casa da promoção
const promoMenu = () => {
  if (!g.promo) return '';
  const { white, to } = g.promo;
  return `<div class="pp ${white ? '' : 'rev'}" style="left:${(to & 7) * 12.5}%;top:${white ? 0 : 50}%">` +
    [...'QRBN'].map(t => `<button class="${white ? 'w' : 'b'}" data-t="${t}" aria-label="Promote to ${t}">${pc(white ? t : t.toLowerCase(), '')}</button>`).join('') + '</div>';
};
function draw() {
  const wTurn = g.turn === 'w';
  const checked = w => inCheck(g.b, w) ? g.b.indexOf(w ? 'K' : 'k') : -1;
  const kingChk = g.over ? Math.max(checked(true), checked(false)) : checked(wTurn);
  const ks = g.sel >= 0 && g.b[g.sel].toLowerCase() === 'k';
  const cd = ks ? pseudo(g.b, g.sel).filter(t => Math.abs(t - g.sel) === 2) : [];   // roques que o tabuleiro permite
  const okC = cd.filter(t => g.hints.includes(t));                                  // roques realmente legais
  const rooks = okC.map(t => t > g.sel ? g.sel + 3 : g.sel - 4);                    // torres envolvidas (ganham uma marca)
  $('#board').innerHTML = g.b.map((p, i) => {
    const cls = ['sq', ((i >> 3) + (i & 7)) % 2 ? 'd' : 'l'];
    const ep = !p && g.sel >= 0 && g.b[g.sel].toLowerCase() === 'p' && (g.sel & 7) !== (i & 7);   // en passant: casa vazia, mas é uma captura
    if (p) cls.push(isW(p) ? 'w' : 'b');
    if (g.last && g.last.includes(i)) cls.push('last');
    if (i === g.sel) cls.push('pick');
    if (g.hints.includes(i)) cls.push('hint', p || ep ? 'cap' : 'x');
    if (rooks.includes(i)) cls.push('rk');
    if (i === kingChk) cls.push('chk');
    return `<div class="${cls.join(' ')}" data-i="${i}">${p ? pc(p) : ''}</div>`;
  }).join('') + promoMenu();
  $('#board').classList.toggle('picking', !!g.promo);
  if (g.over) return;
  const cpu = !wTurn && g.mode !== 'local';
  const note = okC.length ? 'Castling: tap the dotted square or the marked rook.'
    : cd.length ? "Can't castle now: the king is in check or would cross an attacked square." : '';
  say(note || (cpu ? 'CPU is thinking\u2026'
    : g.mode === 'local' ? `${wTurn ? 'White' : 'Black'} to move${kingChk >= 0 ? ' \u2013 check!' : ''}`
    : g.mode === 'challenge' ? 'White to move: find the checkmate in 1'
    : kingChk >= 0 ? 'Check! Protect your king.' : 'Your turn'));
}
$('#board').addEventListener('click', e => {
  if (g.promo) {   // escolhendo a peça: tocar numa opção escolhe; tocar fora cancela
    const opt = e.target.closest('.pp button'), pr = g.promo;
    g.promo = null;
    if (opt) pr.commit(opt.dataset.t); else draw();
    return;
  }
  const sq = e.target.closest('.sq');
  if (!sq || g.over || g.busy || (g.turn === 'b' && g.mode !== 'local')) return;
  const i0 = +sq.dataset.i, p = g.b[i0];
  // rei selecionado + toque na própria torre (a1/h1/a8/h8) = roque (igual a tocar na casa a duas do rei)
  const castle = g.sel >= 0 && g.b[g.sel].toLowerCase() === 'k' && p && p.toLowerCase() === 'r' && isW(p) === isW(g.b[g.sel]) &&
    (i0 === g.sel + 3 || i0 === g.sel - 4) && g.hints.includes(i0 > g.sel ? g.sel + 2 : g.sel - 2);
  const i = castle ? (i0 > g.sel ? g.sel + 2 : g.sel - 2) : i0;
  if (!castle && p && isW(p) === (g.turn === 'w')) { g.sel = i; g.hints = legal(g.b, i); }
  else if (g.sel >= 0 && g.hints.includes(i)) {
    const from = g.sel, pawn = g.b[from];
    const commit = pr => g.mode === 'challenge' ? tryPuzzle(from, i, pr) : play(from, i, pr);
    // peão chegando à última fileira: o jogador escolhe a peça
    return (pawn === 'P' && i < 8) || (pawn === 'p' && i > 55) ? askPromo(isW(pawn), i, commit) : commit();
  }
  else { g.sel = -1; g.hints = []; }
  draw();
});
const askPromo = (white, to, commit) => { g.promo = { white, to, commit }; draw(); };
function play(i, t, promo) {
  g.b = make(g.b, i, t, promo);
  g.last = [i, t]; g.sel = -1; g.hints = [];
  g.turn = g.turn === 'w' ? 'b' : 'w';
  const w = g.turn === 'w';
  if (!allMoves(g.b, w).length) {
    g.over = true; draw();
    return finish(inCheck(g.b, w) ? (w ? 'lose' : 'win') : 'draw');
  }
  draw();
  if (g.turn === 'b' && g.mode !== 'local') setTimeout(() => { const m = cpuMove(g.b, g.L); if (m && !g.over) play(...m); }, 450);
}

/* XP: soma, detecta subida de n\u00edvel e prepara a anima\u00e7\u00e3o da barra */
function award(xp, coins = 0) {
  const a = xpInfo(S.xp);
  S.xp += xp; S.coins += coins; save();
  const b = xpInfo(S.xp), up = b.lv > a.lv;
  xpFrom = up ? 0 : a.into / a.need * 100;
  return { b, up };
}
const xpBlock = ({ b, up }) => (up ? `<p>Level up! You are now player level ${b.lv}.</p>` : '') +
  `<div class="bar big"><i style="width:${b.into / b.need * 100}%"></i></div><p class="sub">${b.into} / ${b.need} XP &middot; ${b.need - b.into} to Lv ${b.lv + 1}</p>`;

/* Fim de partida: mostra o resultado; "View board" fecha a janela para o jogador rever o tabuleiro */
const showEnd = () => modal(g.end.html, [...g.end.btns, ['View board', null, 'alt full']]);
function endModal(html, btns, status) {
  g.end = { html, btns };
  showBoard(true);
  say(status);
  $('#btnMoves').innerHTML = '&#8593; RESULT';   // reabre a janela do resultado
  $('#btnGive').innerHTML = '&#8592; BACK';       // sai da partida (g.over já trata isso)
  showEnd();
}
function finish(res, resigned) {   // res vista pelas brancas: win | lose | draw
  g.over = true;
  const back = () => go(g.back);
  if (g.mode === 'level' && res === 'win') {
    const { first, xp, coins } = rewardFor(g.lvl);
    S.done = Math.max(S.done, g.lvl);
    const r = award(xp, coins);
    if (first) animFrom = g.lvl;
    sel = Math.min(S.done + 1, TOTAL);
    endModal(`<h3 class="win">Checkmate!</h3><p>+${xp} XP &nbsp; +${coins} coins</p>` + xpBlock(r), [['Back to map', back]], 'Checkmate! You won.');
  } else if (g.mode === 'level') {
    endModal(res === 'draw' ? '<h3>Stalemate</h3><p>No legal moves left. This one is a draw, so try again.</p>'
      : '<h3>Defeat</h3><p>You can retry this level any time.</p>', [['Back to map', back]],
      res === 'draw' ? 'Stalemate: draw.' : resigned ? 'You gave up.' : 'Checkmate: you lost.');
  } else {   // treino e 2 jogadores: sem XP
    const local = g.mode === 'local';
    const title = res === 'draw' ? 'Stalemate' : local ? (res === 'win' ? 'White wins!' : 'Black wins!') : res === 'win' ? 'You won!' : 'You lost';
    endModal(`<h3 class="${res === 'win' || (local && res === 'lose') ? 'win' : ''}">${title}</h3><p>${res === 'draw' ? 'No legal moves left: it is a draw.' : resigned ? 'You gave up.' : 'Checkmate.'}</p>`,
      [['Back', back], ['Play again', () => startGame(lastOpts)]],
      res === 'draw' ? 'Stalemate: draw.' : resigned ? 'You gave up.' : `Checkmate: ${local ? (res === 'win' ? 'White' : 'Black') + ' wins.' : res === 'win' ? 'you won.' : 'you lost.'}`);
  }
}
$('#btnGive').onclick = () => {
  if (g.over) return go(g.back);
  const exit = g.mode === 'local' || g.mode === 'challenge';
  modal(exit ? '<h3>Leave?</h3><p>This game will be lost.</p>' : '<h3>Give up?</h3><p>You will lose this match.</p>',
    [['Stay'], [exit ? 'Leave' : 'Give up', () => { if (exit) { g.over = true; go(g.back); } else finish('lose', true); }, 'red']]);
};

/* ---------- PRACTICE: dificuldade da CPU ou 2 jogadores no mesmo aparelho ---------- */
const DIFFS = [['EASY', cfg(1)], ['MEDIUM', cfg(8)], ['HARD', cfg(16)], ['EXPERT', cfg(30)]];
$('#diffs').innerHTML = DIFFS.map(([n, c], i) => `<button class="opt" data-d="${i}">${n}<small>RATING ${c.r}</small></button>`).join('');
$('#diffs').addEventListener('click', e => {
  const b = e.target.closest('[data-d]');
  if (!b) return;
  const [n, c] = DIFFS[+b.dataset.d];
  startGame({ mode: 'practice', back: 'practice', title: 'PRACTICE', l1: `OPPONENT: CPU (${n})`, l2: 'RATING ' + c.r, L: c });
});
$('#local').onclick = () => startGame({ mode: 'local', back: 'practice', title: 'LOCAL MATCH', l1: 'OPPONENT: PLAYER 2', l2: 'BLACK PIECES (TOP)' });

/* ---------- CHALLENGE: mate em 1 (um desafio por dia + extras para treinar) ---------- */
const DAILY_XP = 80;   // XP do desafio do dia (os extras não dão XP)
const PUZ = [       // brancas jogam e existe exatamente um xeque-mate em 1 lance (do mais fácil ao mais difícil)
  '4k3/8/8/4BQ2/4R3/3BP3/1P1NKP2/8',
  '8/7k/2p5/ppP5/5P2/P4R2/4K1R1/8',
  '4kr2/4pp2/5p2/8/1p2B3/5K2/2PQ4/4R3',
  '2k5/8/8/1BPN4/5Q2/7P/P2K1P2/R1B5',
  '3rk3/2p1pp2/p6R/8/2P5/8/4PP2/3QK3',
  '2N2k2/5p2/5P2/8/7p/8/P3NPP1/3RKR2',
  '8/r2b4/1pp1p3/6B1/p3N3/3P1K1k/PP6/4R3',
  'k1b2Q2/p2p2p1/8/1p5p/8/5P2/P2b2P1/3R2KR',
  '3k4/2p2P2/p4P2/3p4/1r6/4P2B/P1P2P2/RN1K2N1',
  'RB1k1r2/3p1ppp/8/1B6/6P1/5P2/2PK1P1P/3Q3R',
  '8/2pbQ3/R7/2p2pp1/6k1/1P4P1/2P1PP1P/2B1KB1R',
  '2bqkb1r/3pp1pp/1p6/8/4N3/3n1P2/2KP1P1P/2B1R3',
  '5b1r/4pp1p/1p4p1/p2n4/1k1P1P1P/6N1/PP6/3QK2R',
  '8/p1p2p2/1p6/B2Qp1p1/k7/P4PPP/4P3/RN2KBNR',
  '2bqkb1r/3pp1pp/1p5n/8/4N3/5P2/r1PPQP1P/2B1K2R'
];
const todayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const dayNumber = () => { const d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); };
const dailyIndex = () => (dayNumber() * 7) % PUZ.length;   // passo 7: passa por todos fora de ordem e recomeça quando acabam
let lastExtra = -1;
function extraIndex() {   // aleatório, sem repetir o anterior nem entregar o desafio do dia
  let i;
  do i = Math.floor(Math.random() * PUZ.length); while (i === lastExtra || i === dailyIndex());
  return (lastExtra = i);
}
const dailyDone = () => S.daily === todayKey();
const startChallenge = (i, daily) => startGame({
  mode: 'challenge', back: 'challenge', title: 'CHALLENGE', l1: 'MATE IN 1',
  l2: daily ? `DAILY \u00b7 +${DAILY_XP} XP` : 'EXTRA \u00b7 NO XP', b: fromFen(PUZ[i]), pz: i, daily, day: todayKey()
});
function renderChallenge() {
  const done = dailyDone(), now = new Date(), left = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now;
  const h = Math.floor(left / 36e5), m = Math.floor(left % 36e5 / 6e4);
  $('#chXp').textContent = done ? 'Completed \u2713' : `+${DAILY_XP} XP`;
  $('#chNext').textContent = done ? `Next daily puzzle in ${h}h ${m}m` : `Resets in ${h}h ${m}m`;
  $('#chStart').textContent = done ? 'DONE FOR TODAY' : 'START DAILY';
  $('#chStart').disabled = done;
}
$('#chStart').onclick = () => startChallenge(dailyIndex(), true);
$('#chExtra').onclick = () => startChallenge(extraIndex(), false);
function tryPuzzle(i, t, promo) {
  g.b = make(g.b, i, t, promo); g.last = [i, t]; g.sel = -1; g.hints = [];
  if (inCheck(g.b, false) && !allMoves(g.b, false).length) {   // acertou: xeque-mate
    g.over = true; draw();
    const first = g.daily && S.daily !== g.day;
    if (first) S.daily = g.day;
    const r = first ? award(DAILY_XP) : null;
    const note = first ? `+${DAILY_XP} XP` : g.daily ? 'Daily challenge already completed: no XP this time.' : 'Extra puzzles give no XP: just practice.';
    endModal(`<h3 class="win">Checkmate!</h3><p>${note}</p>` + (r ? xpBlock(r) : ''),
      [['Back', () => go('challenge')], [g.daily ? 'Extra puzzle' : 'Next puzzle', () => startChallenge(extraIndex(), false)]], 'Checkmate!');
  } else {                                                    // errou: mostra o lance e volta a posição
    g.busy = true; draw(); say('Not checkmate. Try again!');
    setTimeout(() => { g.b = g.start.slice(); g.last = null; g.busy = false; draw(); }, 1100);
  }
}

/* ---------- SHOP: visuais (tabuleiros e avatares) — tudo da loja fica neste bloco ---------- */
// [id, nome, preço, cor clara, cor escura]
const THEMES = [
  ['classic', 'Classic', 0, '#5ee27d', '#2a2a2a'], ['ocean', 'Ocean', 150, '#7db4e0', '#2b5d8a'], ['wood', 'Wood', 200, '#d9b27c', '#8b5a2b'],
  ['violet', 'Violet', 300, '#b9a2e8', '#4f3a86'], ['midnight', 'Midnight', 400, '#5f6f82', '#1b2128']
];
// [id, nome, preço, peça, cor do anel]
const AVATARS = [
  ['pawn', 'Pawn', 0, 'P', '#5ee27d'], ['knight', 'Knight', 75, 'N', '#7db4e0'], ['bishop', 'Bishop', 100, 'B', '#b9a2e8'],
  ['rook', 'Rook', 150, 'R', '#d9b27c'], ['queen', 'Queen', 250, 'Q', '#f08fb4'], ['king', 'King', 350, 'K', '#ffd84a']
];
const isOwned = (kind, id, price) => price === 0 || S.own.includes(kind + ':' + id);
function applyLook() {   // aplica o tabuleiro e o avatar equipados
  const t = THEMES.find(x => x[0] === S.theme) || THEMES[0], a = AVATARS.find(x => x[0] === S.avatar) || AVATARS[0];
  $('#board').style.setProperty('--lt', t[3]);
  $('#board').style.setProperty('--dk', t[4]);
  $$('.avatar').forEach(e => { e.innerHTML = pc(a[3], ''); e.style.borderColor = a[4]; });
}
function renderShop() {
  $('#shopCoins').textContent = S.coins;
  const card = (kind, id, name, price, preview) => {
    const own = isOwned(kind, id, price), on = S[kind] === id;
    return `<button class="item${on ? ' on' : ''}${!own && S.coins < price ? ' cant' : ''}" data-k="${kind}" data-id="${id}">${preview}<b>${name}</b>` +
      `<small>${on ? 'EQUIPPED' : own ? 'OWNED' : '<i class="gd">\u25CF</i> ' + price}</small></button>`;
  };
  $('#shopThemes').innerHTML = THEMES.map(([id, n, p, l, d]) => card('theme', id, n, p, `<i class="sw" style="--lt:${l};--dk:${d}"></i>`)).join('');
  $('#shopAvatars').innerHTML = AVATARS.map(([id, n, p, ch, col]) => card('avatar', id, n, p, `<i class="av" style="border-color:${col}">${pc(ch, '')}</i>`)).join('');
}
$('#shop').addEventListener('click', e => {
  const it = e.target.closest('.item');
  if (!it) return;
  const k = it.dataset.k, id = it.dataset.id, [, name, price] = (k === 'theme' ? THEMES : AVATARS).find(x => x[0] === id);
  if (isOwned(k, id, price)) { S[k] = id; save(); applyLook(); return renderShop(); }   // já é seu: equipa
  if (S.coins < price) return modal(`<h3>Not enough coins</h3><p>${name} costs ${price} coins. You need ${price - S.coins} more.</p>`);
  modal(`<h3>Buy ${name}?</h3><p>It costs ${price} coins.</p>`, [['Cancel'], ['Buy', () => {
    S.coins -= price; S.own.push(k + ':' + id); S[k] = id; save(); applyLook(); renderShop(); renderHud();
  }]]);
});

/* ---------- MOVIMENTOS DAS PEÇAS (iniciantes) ---------- */
// [nome, peça, direções, desliza?, é captura?, legenda]
const MOVES = [
  ['PAWN', 'p', [[-1, 0], [-2, 0]], 0, 0, 'Forward 1, or 2 on its first move'],
  ['PAWN', 'p', [[-1, -1], [-1, 1]], 0, 1, 'Captures one step diagonally'],
  ['ROOK', 'r', ORTH, 1, 0, 'Any distance, straight lines'],
  ['BISHOP', 'b', DIAG, 1, 0, 'Any distance, diagonals'],
  ['KNIGHT', 'n', KN, 0, 0, 'L-shape; jumps over pieces'],
  ['QUEEN', 'q', [...ORTH, ...DIAG], 1, 0, 'Straight lines and diagonals'],
  ['KING', 'k', [...ORTH, ...DIAG], 0, 0, 'One square any direction'],
  ['CASTLING', 'k', [[0, 2], [0, -2]], 0, 0, 'King moves 2 toward a rook, which jumps over it'],
  ['EN PASSANT', 'p', [[-1, 1]], 0, 1, 'Capture a pawn that just moved 2 squares']
];
function miniBoard([name, t, mv, slide, cap, txt]) {
  const dots = new Map();
  mv.forEach(([a, d]) => {
    for (let k = 1; k <= (slide ? 3 : 1); k++) {
      const r = 3 + a * k, c = 3 + d * k;
      if (r >= 0 && r < 7 && c >= 0 && c < 7) dots.set(r * 7 + c, cap ? 'x' : 'o');
    }
  });
  let cells = '';
  for (let i = 0; i < 49; i++) {
    const cls = [((i % 7) + (i / 7 | 0)) % 2 ? 'd' : 'l', dots.get(i) || ''].join(' ');
    cells += `<i class="${cls}${i === 24 ? ' w' : ''}">${i === 24 ? pc(t.toUpperCase(), '') : ''}</i>`;
  }
  return `<div class="mc"><b>${name}</b><div class="mini">${cells}</div><small>${txt}</small></div>`;
}
$('#moves').innerHTML = MOVES.map(miniBoard).join('');
function showBoard(show) {
  $('#boardWrap').hidden = !show;
  $('#moves').hidden = show;
  $('#btnMoves').innerHTML = show ? '&#8593; MOVEMENTS' : '&#8595; BOARD';
}
$('#btnMoves').onclick = () => g.over ? showEnd() : showBoard($('#boardWrap').hidden);

$('.king img').src = SRC.home;
applyLook();
$('#startLevel').innerHTML = pc('n', '') + ' START LEVEL';

renderHud();

// Abas de baixo (Map / Practice / Challenge), iguais nas três telas
$$('.tabs-main').forEach(n => {
  n.innerHTML = [['map', 'Map', 'i-map'], ['practice', 'Practice', 'i-grid'], ['challenge', 'Challenge', 'i-trophy'], ['shop', 'Shop', 'i-cart']]
    .map(([id, l, ic]) => `<button data-go="${id}"${n.dataset.on === id ? ' class="on"' : ''}><svg class="i"><use href="#${ic}"/></svg>${l}</button>`).join('');
});

// START JOURNEY: pede o nickname na primeira vez
function askName(warn) {
  modal(`<h3>Choose your nickname</h3><p>${warn || 'This is how you will appear on the map.'}</p><input id="nick" maxlength="14" placeholder="Your nickname" autocomplete="off">`,
    [['Cancel'], ['Start', () => {
      const v = $('#nick').value.trim();
      if (!v) return askName('Please type a nickname to start.');
      S.name = v; S.named = true; save(); go('map');
    }]]);
  const input = $('#nick');
  input.focus();
  input.onkeydown = e => { if (e.key === 'Enter') $('#mBtns .btn:last-child').click(); };
}
$('#startJourney').onclick = () => S.named ? go('map') : askName();