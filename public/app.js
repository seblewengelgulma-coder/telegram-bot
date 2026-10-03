const tg = window.Telegram?.WebApp;
tg?.ready();
tg?.expand();

const $= s => document.querySelector(s),$$ = s => [...document.querySelectorAll(s)];
let userId = tg?.initDataUnsafe?.user?.id || localStorage.getItem('mini_user_id'); 
let state = {
    user: null,
    bingo: { gameId: null, cost: null, matrix: null },
    keno: { bet: 10, selected: [] },
    poll: null
};

function toast(m) {
    const e = $('#toast');      if(!e) return;          e.textContent = m;          e.classList.remove('hidden');          setTimeout(() => e.classList.add('hidden'), 2200);  }  function showTab(name) {          $$('.tabpage').forEach(x => x.classList.add('hidden'));
    const target = $('#' + name);          if(target) target.classList.remove('hidden');          $$('nav .tab').forEach(x => x.classList.toggle('active', x.dataset.tab === name));
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
        if (!userId) throw new Error('እባክዎ ይህንን ሊንክ ከቴሌግራም ሚኒ አፕ ይክፈቱት።');
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
    $('#name').textContent = u.userName || 'ተጫዋች';
    $('#stats').textContent = `${u.totalGames || 0} ጨዋታዎች · ${u.wins || 0} ድሎች`;
    $('#profileName').textContent = u.userName || 'ተጫዋች';
    $('#profileId').textContent = 'Telegram ID: ' + u.telegramId;
}

// --- 💰 ዲፖዚት እና ዊዝድሮ ክፍሎች ---
async function loadPaymentAdmin() {
    try {
        const res = await api('/api/user/payment-admin?userId=' + userId);
        if(res.success && res.admin) {
            const a = res.admin;
            const box = $('#paymentAdminInfo');
            if(box) {
                box.innerHTML = `
                    <b>አድሚን:</b> ${a.adminName}<br>
                    <b>ንግድ ባንክ (CBE):</b> <code>${a.cbeAccount || 'የለም'}</code><br>
                    <b>ቴሌብር (Telebirr):</b> <code>${a.telebirr || 'የለም'}</code>
                `;
            }
        }
    } catch (err) { console.error(err); }
}

async function submitDeposit() {
    const amount = Number($('#depositAmount').value);
    const details = $('#depositDetails').value.trim();
    if(!amount || amount <= 0 || !details) {
        return toast('እባክዎ ትክክለኛ መጠን እና የትራንዛክሽን መረጃ ያስገቡ!');
    }
    try {
        const res = await api('/api/deposit', {
            method: 'POST',
            body: JSON.stringify({ userId, amount, transactionDetails: details })
        });
        if(res.success) {
            toast('✅ የዲፖዚት ጥያቄዎ ለአድሚን ተልኳል!');
            $('#depositAmount').value = '';
            $('#depositDetails').value = '';
        }
    } catch (e) { toast(e.message); }
}

async function submitWithdraw() {
    const amount = Number($('#withdrawAmount').value);
    const phone = $('#withdrawPhone').value.trim();
    if(!amount || amount <= 0 || !phone) {
        return toast('እባክዎ ትክክለኛ የብር መጠን እና ስልክ ቁጥር ያስገቡ!');
    }
    try {
        const res = await api('/api/withdraw', {
            method: 'POST',
            body: JSON.stringify({ userId, amount, phone })
        });
        if(res.success) {
            toast('✅ የዊዝድሮ ጥያቄዎ ተልኳል!');
            state.user.balance = res.balance;
            renderUser();
            $('#withdrawAmount').value = '';
        }
    } catch (e) { toast(e.message); }
}

// --- 🎯 ቢንጎ ጨዋታ መዋቅር ---
function buildBingoNumbers() {
    const grid = $('#bingoNumbersGrid');
    if(!grid) return;
    grid.innerHTML = '';
    for(let i = 1; i <= 75; i++) {
        const btn = document.createElement('button');
        btn.className = 'bingo-num-btn';
        btn.textContent = i;
        btn.onclick = () => pickBingoNumber(i, btn);
        grid.appendChild(btn);
    }
}

async function pickBingoNumber(number, btnElement) {
    const cost = Number($('#bingoCostSelect').value || 10);
    try {
        const res = await api('/api/bingo/pick', {
            method: 'POST',
            body: JSON.stringify({ userId, cost, number })
        });
        if(res.success) {
            state.bingo.gameId = res.gameId;
            state.bingo.cost = cost;
            state.user.balance = res.newBalance;
            renderUser();
            toast('✅ ቁጥሩ ተይዟል! ጨዋታው በመጀመር ላይ ነው...');
            btnElement.classList.add('selected');
        }
    } catch (e) { toast(e.message); }
}

async function pollBingo() {
    setInterval(async () => {
        if(!state.bingo.gameId) return;
        try {
            const res = await api(`/api/bingo/status?userId=${userId}&gameId=${state.bingo.gameId}`);
            if(res.success && res.status === 'active') {
                $('#bingoStatusText').textContent = `አሁን የተጠራው ቁጥር: ${res.currentBall} | ፖል: ETB ${res.pool}`;
            }
        } catch (e) {}
    }, 4000);
}

// --- 🎲 ኬኖ ጨዋታ መዋቅር ---
function buildKeno() {
    const grid = $('#kenoGrid');
    if(!grid) return;
    grid.innerHTML = '';
    for(let i = 1; i <= 80; i++) {
        const btn = document.createElement('button');
        btn.className = 'keno-btn';
        btn.textContent = i;
        btn.onclick = () => {
            const idx = state.keno.selected.indexOf(i);
            if(idx > -1) {
                state.keno.selected.splice(idx, 1);
                btn.classList.remove('active');
            } else {
                if(state.keno.selected.length >= 10) return toast('ቢበዛ 10 ቁጥሮች መምረጥ ይችላሉ!');
                state.keno.selected.push(i);
                btn.classList.add('active');
            }
        };
        grid.appendChild(btn);
    }
}

async function playKeno() {
    const betAmount = Number($('#kenoBetSelect')?.value || 10);
    const selectedNumbers = state.keno.selected;
    if(selectedNumbers.length === 0) return toast('እባክዎ ቢያንስ 1 ቁጥር ይምረጡ!');
    
    try {
        const res = await api('/api/keno/play', {
            method: 'POST',
            body: JSON.stringify({ userId, betAmount, selectedNumbers })
        });
        if(res.success) {
            state.user.balance = res.newBalance;
            renderUser();
            toast(`🎉 ውጤት: ${res.matchesCount} ተመቷል! ማሸነፊያ: ETB ${res.winAmount}`);
            $('#kenoResult').textContent = `የወጡ ቁጥሮች: [${res.drawnNumbers.join(', ')}] | ያሸነፉት: ${res.winAmount} ETB`;
        }
    } catch (e) { toast(e.message); }
}

window.onload = load;