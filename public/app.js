const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const $= s => document.querySelector(s),$$ = s => [...document.querySelectorAll(s)];
let userId = tg?.initDataUnsafe?.user?.id || localStorage.getItem('mini_user_id'); 
let state = {
    user: null,
    bingo: { gameId: null, cost: null },
    keno: { bet: 10, selected: [] },
    poll: null
};

function toast(m) {
    const e = $('#toast');     if(!e) return;     e.textContent = m;     e.classList.remove('hidden');     setTimeout(() => e.classList.add('hidden'), 2200); }  function showTab(name) {     $$('.tabpage').forEach(x => x.classList.add('hidden'));
    const target = $('#' + name);     if(target) target.classList.remove('hidden');     $$('nav .tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
    if (name === 'wallet') loadPaymentAdmin();
}

function api(path, opt = {}) {
    opt.headers = { ...(opt.headers || {}), 'Content-Type': 'application/json' };
    if (tg?.initData) opt.headers['X-Telegram-Init-Data'] = tg.initData;
    return fetch(path, opt).then(async r => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.message || 'Request failed');
        return d;
    });
}

async function load() {
    try {
        if (!userId) throw new Error('Open this page from Telegram Mini App.');
        localStorage.setItem('mini_user_id', userId);
        const d = await api('/api/user/profile?userId=' + encodeURIComponent(userId));
        state.user = d.user;
        renderUser();
        $('#loading').classList.add('hidden');
        $('#main').classList.remove('hidden');
        buildBingoNumbers();
        buildKeno();
        loadPaymentAdmin();
        pollBingo();
    } catch (e) {
        $('#loading').classList.add('hidden');
        $('#error').classList.remove('hidden');
        $('#errorText').textContent = e.message;
    }
}

function renderUser() {
    const u = state.user;
    if(!u) return;
    $('#balance').textContent = 'ETB ' + Number(u.balance || 0).toFixed(2);
    $('#name').textContent = u.userName || 'Player';
    $('#stats').textContent = `${u.totalGames || 0} games · ${u.wins || 0} wins`;
    $('#profileName').textContent = u.userName || 'Player';
    $('#profileId').textContent = 'Telegram ID: ' + u.telegramId;
    $('#level').textContent = u.level || 1;
    $('#games').textContent = u.totalGames || 0;
    $('#wins').textContent = u.wins || 0;
}

function buildBingoNumbers() {
    const e = $('#bingoNumbers');
    if (!e) return;
    e.innerHTML = '';
    for (let i = 1; i <= 75; i++) {
        const b = document.createElement('button');
        b.textContent = i;
        b.onclick = () => pickBingo(i);
        e.appendChild(b);
    }
}

async function pickBingo(n) {
    if (!state.bingo.cost) return toast('እባክዎ በመጀመሪያ የሰአት/የጨዋታ ዋጋ ይምረጡ');
    try {
        const d = await api('/api/bingo/pick', {
            method: 'POST',
            body: JSON.stringify({ userId, cost: state.bingo.cost, number: n })
        });
        state.bingo.gameId = d.gameId;
        state.bingo.matrix = d.matrix;
        state.user.balance = d.newBalance;
        renderUser();
        $('#bingoSetup').classList.add('hidden');
        $('#bingoWaiting').classList.remove('hidden');
        toast('በ ETB ' + d.cost + ' ክፍል ተቀላቅለዋል');
        pollBingo();
    } catch (e) {
        toast(e.message);
    }
}

function selectStake(cost) {
    state.bingo.cost = cost;
    if ($('#bingoCost')) $('#bingoCost').textContent = 'ETB ' + cost;     $$('#bingo .stakes button').forEach(b => b.classList.toggle('selected', Number(b.dataset.cost) === cost));
    toast('አሁን ቁጥር ይምረጡ (ETB ' + cost + ')');
}

function renderMatrix(matrix, history) {
    const root = $('#matrix');
    if (!root) return;
    root.innerHTML = '';
    const hs = new Set((history || []).map(String));
    matrix.forEach((row, ri) => row.forEach(cell => {
        const d = document.createElement('div');
        d.className = 'cell';
        const val = typeof cell === 'object' ? cell.display : cell;
        d.textContent = ri === 2 && cell?.free ? 'FREE' : val;
        if (ri === 2 && cell?.free) d.classList.add('free');
        if (hs.has(String(val))) d.classList.add('called');
        root.appendChild(d);
    }));
}

async function pollBingo() {
    try {
        const q = new URLSearchParams({ userId });
        if (state.bingo.gameId) q.set('gameId', state.bingo.gameId);
        const d = await api('/api/bingo/status?' + q);
        
        if (d.status === 'waiting') {
            state.bingo.gameId = d.gameId;
            state.bingo.cost = d.cost;
            $('#bingoSetup').classList.add('hidden');
            $('#bingoWaiting').classList.remove('hidden');
            $('#bingoActive').classList.add('hidden');
            $('#countdown').textContent = d.remainingSeconds;
            $('#waitingText').textContent = `${d.playersCount} player(s) · Pool ETB ${d.pool}`;
            $('#progress').style.width = Math.max(0, d.remainingSeconds / 30 * 100) + '%';
        } else if (d.status === 'active') {
            state.bingo.gameId = d.gameId;
            state.bingo.cost = d.cost;
            $('#bingoSetup').classList.add('hidden');
            $('#bingoWaiting').classList.add('hidden');
            $('#bingoActive').classList.remove('hidden');
            $('#currentBall').textContent = d.currentBall;
            $('#poolText').textContent = `ETB ${d.cost} · Pool ETB ${d.pool}`;
            $('#nextDraw').textContent = 'Next draw: ' + d.nextDrawInSeconds + 's';
            renderMatrix(d.matrix, d.history);
            $('#history').innerHTML = (d.history || []).map(x => `<span>${x}</span>`).join('');
        } else {
            $('#bingoWaiting').classList.add('hidden');
            $('#bingoActive').classList.add('hidden');
        }
    } catch (e) {} finally {
        clearTimeout(state.poll);
        state.poll = setTimeout(pollBingo, 1000);
    }
}

function buildKeno() {
    const e = $('#kenoNumbers');
    if (!e) return;
    e.innerHTML = '';
    for (let i = 1; i <= 80; i++) {
        const b = document.createElement('button');
        b.textContent = i;
        b.onclick = () => {
            const s = state.keno.selected;
            if (s.includes(i)) {
                state.keno.selected = s.filter(x => x !== i);
            } else if (s.length < 10) {
                s.push(i);
            } else {
                return toast('ከ 10 ቁጥር በላይ መምረጥ አይቻልም');
            }
            b.classList.toggle('mine', state.keno.selected.includes(i));
            if($('#kcount')) $('#kcount').textContent = state.keno.selected.length;
        };
        e.appendChild(b);
    }
}

async function playKeno() {
    if (!state.keno.selected.length) return toast('እባክዎ ቢያንስ አንድ ቁጥር ይምረጡ');
    try {
        const d = await api('/api/keno/play', {
            method: 'POST',
            body: JSON.stringify({ userId, betAmount: state.keno.bet, selectedNumbers: state.keno.selected })
        });
        $('#kenoResult').classList.remove('hidden');
        $('#kenoResult').innerHTML = `<b>ውጤት ደርሷል</b><p>${d.message || ''}</p><div class="chips">${(d.drawnNumbers || []).map(x => `<span>${x}</span>`).join('')}</div>`;
        if (d.newBalance != null) {
            state.user.balance = d.newBalance;
            renderUser();
        }
    } catch (e) {
        toast(e.message);
    }
}

async function loadPaymentAdmin() {
    if (!userId) return;
    try {
        const d = await api('/api/user/payment-admin?userId=' + userId);
        const a = d.admin;
        $('#paymentAdmin').innerHTML = `<b>የተመደበልዎ የአስተዳደር አካውንት</b><p>👤 ${a.adminName}</p><p>📱 Telebirr: <code>${a.telebirr || '—'}</code> <button class="secondary" data-copy="${a.telebirr || ''}">ኮፒ አድርግ</button></p><p>🏦 CBE: <code>${a.cbeAccount || '—'}</code> <button class="secondary" data-copy="${a.cbeAccount || ''}">ኮፒ አድርግ</button></p>`;
    } catch (e) {
        $('#paymentAdmin').innerHTML = '<b>የተመደበልዎ የአስተዳደር አካውንት</b><p>' + e.message + '</p>';
    }
}

function modal(title, body) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = body;
    $('#modal').classList.remove('hidden');
}

function walletAction(type) {
    if (type === 'deposit') {
        modal('💰 ገንዘብ ማስገባት (Deposit)', `<p>ከላይ በተሰጠው የአስተዳደር አካውንት ገንዘብ ከላኩ በኋላ ትራንዛክሽን ቁጥሩን ያስገቡ።</p><input id="amount" type="number" min="1" placeholder="መጠን (ETB)"><textarea id="details" placeholder="የትራንዛክሽን መረጃ / ዴቴልስ"></textarea><button id="sendDeposit" class="primary full">የገንዘብ ማስገቢያ ጥያቄ ይላኩ</button>`);
    } else {
        modal('💸 ገንዘብ ማውጣት (Withdraw)', `<input id="amount" type="number" min="1" placeholder="መጠን (ETB)"><input id="phone" placeholder="የቴሌብር / ስልክ ቁጥር"><button id="sendWithdraw" class="primary full">የማውጣት ጥያቄ ይላኩ</button>`);
    }
}

// Event Bindings
$('#retry').onclick = load;
$('#refreshBtn').onclick = () => location.reload();
$('#closeModal').onclick = () => $('#modal').classList.add('hidden');
$$('nav .tab').forEach(b => b.onclick = () => showTab(b.dataset.tab));$$
('[data-go]').forEach(b => b.onclick = () => showTab(b.dataset.go));
$$('[data-action]').forEach(b => b.onclick = () => walletAction(b.dataset.action));$$
('[data-cost]').forEach(b => b.onclick = () => selectStake(Number(b.dataset.cost)));

$$('[data-bet]').forEach(b => b.onclick = () => {     state.keno.bet = Number(b.dataset.bet);     $$
('[data-bet]').forEach(x => x.classList.toggle('selected', x === b));
    toast('የኪኖ ውርርድ መጠን: ETB ' + state.keno.bet);
});

$('#clearKeno').onclick = () => {
    state.keno.selected = [];
    buildKeno();
    $('#kcount').textContent = 0;
};
$('#playKeno').onclick = playKeno;

$('#leaveBingo').onclick = async () => {
    if (state.bingo.gameId) await api('/api/bingo/timeout', { method: 'POST', body: JSON.stringify({ userId, gameId: state.bingo.gameId }) }).catch(() => {});
    state.bingo = { gameId: null, cost: null };
    $('#bingoSetup').classList.remove('hidden');
    $('#bingoWaiting').classList.add('hidden');
    pollBingo();
};

document.body.onclick = async e => {
    const b = e.target.closest('[data-copy]');
    if (b) {
        await navigator.clipboard?.writeText(b.dataset.copy);
        toast('ተኮርጇል (Copied)');
    }
};

document.addEventListener('click', async e => {
    if (e.target.id === 'sendDeposit') {
        try {
            const amount = Number($('#amount').value), details = $('#details').value;
            await api('/api/deposit', { method: 'POST', body: JSON.stringify({ userId, amount, transactionDetails: details }) });
            $('#modal').classList.add('hidden');
            toast('የገንዘብ ማስገቢያ ጥያቄ ተልኳል');
        } catch (x) {
            toast(x.message);
        }
    }
    if (e.target.id === 'sendWithdraw') {
        try {
            const amount = Number($('#amount').value), phone = $('#phone').value;
            const d = await api('/api/withdraw', { method: 'POST', body: JSON.stringify({ userId, amount, phone }) });
            state.user.balance = d.balance;
            renderUser();
            $('#modal').classList.add('hidden');
            toast('የገንዘብ ማውጫ ጥያቄ ተልኳል');
        } catch (x) {
            toast(x.message);
        }
    }
});

load();