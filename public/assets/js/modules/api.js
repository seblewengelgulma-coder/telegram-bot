export async function fetchUserProfileAPI(telegramId, initData) {
    let res = await fetch(`/api/user/profile?userId=${telegramId}`, {
        headers: { 'x-telegram-init-data': initData || '' }
    });
    return await res.json();
}

export async function pickBingoNumberAPI(userId, cost, number) {
    let res = await fetch('/api/bingo/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, cost, number })
    });
    return await res.json();
}

export async function fetchBingoStatusAPI(userId, gameId) {
    let res = await fetch(`/api/bingo/status?userId=${userId}&gameId=${gameId}`);
    return await res.json();
}

export async function sendBingoTimeoutAPI(userId, gameId) {
    let res = await fetch('/api/bingo/timeout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, gameId })
    });
    return await res.json();
}

// 🎯 አዲስ የተጨመረ - የቢንጎ አሸናፊነት ማረጋገጫ API
export async function claimBingoAPI(userId, gameId, matrix) {
    let res = await fetch('/api/bingo/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, gameId, matrix })
    });
    return await res.json();
}

export async function playKenoAPI(userId, betAmount, selectedNumbers) {
    let res = await fetch('/api/keno/play', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, betAmount, selectedNumbers })
    });
    return await res.json();
}

export async function submitDepositAPI(userId, amount, transactionDetails) {
    let res = await fetch('/api/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount: Number(amount), transactionDetails })
    });
    return await res.json();
}

export async function submitWithdrawAPI(userId, amount) {
    let res = await fetch('/api/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, amount: Number(amount) })
    });
    return await res.json();
}