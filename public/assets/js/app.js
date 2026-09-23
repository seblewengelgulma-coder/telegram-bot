import { fetchUserProfileAPI } from './modules/api.js';
import { initBingoPicker, pickBingoNumber, setBingoBet, claimBingo } from './modules/bingo.js';
import { initKenoGrid, setKenoBet, clearKenoSelection, startKenoDraw, toggleKenoPayoutModal } from './modules/keno.js';
import { switchWalletTab, submitDeposit, submitWithdraw } from './modules/wallet.js';

let tg = window.Telegram?.WebApp;
if (tg) {
    tg.expand();
}

let currentUser = {
    telegramId: tg?.initDataUnsafe?.user?.id || 123456789,
    userName: tg?.initDataUnsafe?.user?.first_name || 'ተጫዋች',
    phone: '',
    balance: 0,
    dailyWins: 0,
    level: 1,
    wins: 0,
    totalGames: 0
};

window.addEventListener('DOMContentLoaded', () => {
    fetchUserProfile();
    initBingoPicker((num) => pickBingoNumber(num, currentUser, updateUIHeader));
    initKenoGrid();
    setupEventListeners();
});

async function fetchUserProfile() {
    try {
        let data = await fetchUserProfileAPI(currentUser.telegramId, tg?.initData);
        if (data.success && data.user) {
            currentUser = data.user;
            updateUIHeader();
        }
    } catch (e) {
        console.error("Profile fetch error:", e);
    }
}

function updateUIHeader() {
    document.getElementById('user-name').innerText = currentUser.userName;
    document.getElementById('user-avatar-initial').innerText = currentUser.userName.charAt(0).toUpperCase();
    document.getElementById('user-level-badge').innerText = `Lvl ${currentUser.level || 1}`;
    document.getElementById('daily-wins-text').innerText = `${currentUser.dailyWins || 0}/3`;
    document.getElementById('user-balance-display').innerText = `${Number(currentUser.balance || 0).toFixed(2)} ETB`;
    
    document.getElementById('prof-telegram-id').innerText = currentUser.telegramId;
    document.getElementById('prof-phone').innerText = currentUser.phone || 'አልተመዘገበም';
    document.getElementById('withdraw-user-phone').innerText = currentUser.phone || 'ስልክ ቁጥር አልተገኘም (ቦቱ ላይ Share Contact ያድርጉ)';
    document.getElementById('prof-level').innerText = currentUser.level || 1;
    document.getElementById('prof-total-games').innerText = currentUser.totalGames || 0;
    document.getElementById('prof-wins').innerText = currentUser.wins || 0;
}

function switchTab(tabName) {
    ['bingo', 'keno', 'wallet', 'profile'].forEach(t => {
        document.getElementById(`view-${t}`).classList.add('hidden');
        document.getElementById(`nav-btn-${t}`).classList.remove('text-amber-400', 'text-pink-400');
        document.getElementById(`nav-btn-${t}`).classList.add('text-gray-400');
    });

    document.getElementById(`view-${tabName}`).classList.remove('hidden');
    let activeNav = document.getElementById(`nav-btn-${tabName}`);
    activeNav.classList.remove('text-gray-400');
    activeNav.classList.add(tabName === 'keno' ? 'text-pink-400' : 'text-amber-400');
}

function setupEventListeners() {
    // Navigation
    document.getElementById('nav-btn-bingo').addEventListener('click', () => switchTab('bingo'));
    document.getElementById('nav-btn-keno').addEventListener('click', () => switchTab('keno'));
    document.getElementById('nav-btn-wallet').addEventListener('click', () => switchTab('wallet'));
    document.getElementById('nav-btn-profile').addEventListener('click', () => switchTab('profile'));

    // Bingo Bets
    [10, 20, 50, 100].forEach(cost => {
        let btn = document.getElementById(`bingo-bet-${cost}`);
        if (btn) btn.addEventListener('click', (e) => setBingoBet(cost, e.target));
    });
    document.getElementById('claim-bingo-btn').addEventListener('click', claimBingo);

    // Keno
    [2, 5, 10, 20, 50, 100].forEach(amt => {
        let btn = document.getElementById(`keno-bet-${amt}`);
        if (btn) btn.addEventListener('click', (e) => setKenoBet(amt, e.target));
    });
    document.getElementById('clear-keno-btn').addEventListener('click', clearKenoSelection);
    document.getElementById('start-keno-draw-btn').addEventListener('click', () => startKenoDraw(currentUser, updateUIHeader));
    document.getElementById('open-keno-payout-btn').addEventListener('click', () => toggleKenoPayoutModal(true));
    document.getElementById('close-keno-payout-btn').addEventListener('click', () => toggleKenoPayoutModal(false));
    document.getElementById('close-keno-payout-x').addEventListener('click', () => toggleKenoPayoutModal(false));

    // Wallet Tabs & Actions
    document.getElementById('tab-deposit-btn').addEventListener('click', () => switchWalletTab('deposit'));
    document.getElementById('tab-withdraw-btn').addEventListener('click', () => switchWalletTab('withdraw'));
    document.getElementById('submit-deposit-btn').addEventListener('click', () => submitDeposit(currentUser));
    document.getElementById('submit-withdraw-btn').addEventListener('click', () => submitWithdraw(currentUser, updateUIHeader));
}