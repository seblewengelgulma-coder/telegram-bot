import { pickBingoNumberAPI, fetchBingoStatusAPI, sendBingoTimeoutAPI } from './api.js';

let selectedBingoCost = 10;
let waitingInterval = null;

export function getFormattedBingoNum(num) {
    if (num >= 1 && num <= 15) return `B${num}`;
    if (num >= 16 && num <= 30) return `I${num}`;
    if (num >= 31 && num <= 45) return `N${num}`;
    if (num >= 46 && num <= 60) return `G${num}`;
    if (num >= 61 && num <= 75) return `O${num}`;
    return `${num}`;
}

export function setBingoBet(cost, targetBtn) {
    selectedBingoCost = cost;
    document.querySelectorAll('.bingo-bet-btn').forEach(btn => {
        btn.classList.remove('btn-neon-purple', 'text-white', 'active');
        btn.classList.add('glass-card', 'text-gray-300');
    });
    if (targetBtn) {
        targetBtn.classList.remove('glass-card', 'text-gray-300');
        targetBtn.classList.add('btn-neon-purple', 'text-white', 'active');
    }
    document.getElementById('bingo-room-info').innerText = `ክፍል: ETB ${cost}`;
}

export function initBingoPicker(onPickCallback) {
    let container = document.getElementById('bingo-1to75-picker');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 1; i <= 75; i++) {
        let btn = document.createElement('button');
        btn.className = 'glass-card py-1.5 rounded-lg text-xs font-bold text-gray-200 hover:border-amber-400';
        btn.innerText = getFormattedBingoNum(i);
        btn.onclick = () => onPickCallback(i);
        container.appendChild(btn);
    }
}

export async function pickBingoNumber(num, currentUser, updateHeaderFn) {
    if (currentUser.balance < selectedBingoCost) {
        alert('❌ በቂ ባላንስ የለዎትም!');
        return;
    }

    try {
        let data = await pickBingoNumberAPI(currentUser.telegramId, selectedBingoCost, num);
        if (data.success) {
            currentUser.balance = data.newBalance;
            updateHeaderFn();

            document.getElementById('bingo-bet-selector').classList.add('hidden');
            document.getElementById('bingo-pick-section').classList.add('hidden');
            document.getElementById('bingo-waiting-card').classList.remove('hidden');
            document.getElementById('bingo-status-badge').innerText = 'በመጠበቅ ላይ';

            startWaitingCountdown(data.gameId, currentUser, updateHeaderFn);
        } else {
            alert(data.message || 'ስህተት ተፈጥሯል');
        }
    } catch (e) {
        console.error(e);
    }
}

export function startWaitingCountdown(gameId, currentUser, updateHeaderFn) {
    let countdown = 30;
    if (waitingInterval) clearInterval(waitingInterval);

    waitingInterval = setInterval(async () => {
        countdown--;
        let timerElem = document.getElementById('bingo-waiting-timer');
        if (timerElem) {
            timerElem.innerHTML = `⏱ የቀረው ጊዜ: <span class="font-bold text-amber-400 text-sm">${countdown}</span> ሰከንድ`;
        }

        try {
            let data = await fetchBingoStatusAPI(currentUser.telegramId, gameId);
            if (data.success && data.status === 'active') {
                clearInterval(waitingInterval);
                showBingoLiveBoard(data);
            }
        } catch (e) {}

        if (countdown <= 0) {
            clearInterval(waitingInterval);
            sendBingoTimeoutAPI(currentUser.telegramId, gameId).then(data => {
                if (data.success) {
                    currentUser.balance = data.newBalance;
                    updateHeaderFn();
                }
            });

            document.getElementById('bingo-waiting-card').classList.add('hidden');
            document.getElementById('bingo-bet-selector').classList.remove('hidden');
            document.getElementById('bingo-pick-section').classList.remove('hidden');
            document.getElementById('bingo-status-badge').innerText = 'ተሰርዟል';
            alert('⚠️ በቂ ተጫዋች ባለመገኘቱ ጨዋታው ተሰርዟል! ገንዘብዎ ተመልሷል።');
        }
    }, 1000);
}

export function showBingoLiveBoard(data) {
    document.getElementById('bingo-waiting-card').classList.add('hidden');
    document.getElementById('bingo-live-board').classList.remove('hidden');
    document.getElementById('bingo-status-badge').innerText = 'ንቁ ጨዋታ';

    document.getElementById('bingo-current-ball').innerText = data.currentBall || '--';
    document.getElementById('bingo-history-balls').innerText = data.history?.join(', ') || '-';

    let grid = document.getElementById('bingo-matrix-grid');
    grid.innerHTML = '';
    data.matrix.forEach((row) => {
        row.forEach((cell) => {
            let div = document.createElement('div');
            div.className = `bingo-cell glass-card rounded-xl flex items-center justify-center text-xs font-bold ${cell.marked ? 'marked' : ''}`;
            div.innerText = cell.display;
            div.onclick = () => {
                cell.marked = !cell.marked;
                div.classList.toggle('marked');
            };
            grid.appendChild(div);
        });
    });
}

export function claimBingo() {
    alert('🎯 ቢንጎ አረጋግጥ ተጫኗል!');
}