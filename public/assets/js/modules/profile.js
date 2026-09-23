/**
 * Profile and Header UI Management
 */
import { fetchUserProfile } from './api.js';
import { showNotification, triggerHaptic } from '../utils/ui.js';
import { formatCurrency } from '../utils/helpers.js';

// 1. የዩዘር ፕሮፋይል መረጃን ከ API ጭኖ UI ላይ ማሳየት
export async function loadUserProfile() {
    try {
        const userData = await fetchUserProfile();
        if (!userData) return;

        // Header ላይ የሚታዩ መረጃዎችን ማዘመን
        const usernameEl = document.getElementById('user-name');
        const balanceEl = document.getElementById('user-balance');
        const avatarEl = document.getElementById('user-avatar');

        if (usernameEl) usernameEl.textContent = userData.username || userData.firstName || 'ተጫዋች';
        if (balanceEl) balanceEl.textContent = formatCurrency(userData.balance || 0);
        if (avatarEl && userData.photoUrl) avatarEl.src = userData.photoUrl;

        // Profile Tab ላይ የሚታዩ ዝርዝሮችን ማዘመን
        updateProfilePageUI(userData);

    } catch (error) {
        console.error('Profile loading error:', error);
        showNotification('የፕሮፋይል መረጃ መጫን አልተቻለም', 'error');
    }
}

// 2. በ Profile ገጽ/Tab ላይ ዝርዝር መረጃዎችን መሙላት
function updateProfilePageUI(user) {
    const profileIdEl = document.getElementById('profile-telegram-id');
    const profilePhoneEl = document.getElementById('profile-phone');
    const profileGamesEl = document.getElementById('profile-total-games');
    const referralLinkInput = document.getElementById('referral-link-input');

    if (profileIdEl) profileIdEl.textContent = user.telegramId || '-';
    if (profilePhoneEl) profilePhoneEl.textContent = user.phoneNumber || 'አልተመዘገበም';
    if (profileGamesEl) profileGamesEl.textContent = user.totalGamesPlayed || 0;

    // የሪፈራል ሊንክ ማዘጋጀት
    if (referralLinkInput && user.telegramId) {
        const botUsername = window.Telegram?.WebApp?.initDataUnsafe?.bot_username || 'ebuye_bingo_bot';
        referralLinkInput.value = `https://t.me/${botUsername}?start=ref_${user.telegramId}`;
    }
}

// 3. የሪፈራል ሊንክ ኮፒ ማድረጊያ ፋንክሽን
export function setupReferralCopy() {
    const copyBtn = document.getElementById('copy-ref-btn');
    const refInput = document.getElementById('referral-link-input');

    if (copyBtn && refInput) {
        copyBtn.addEventListener('click', () => {
            refInput.select();
            navigator.clipboard.writeText(refInput.value);
            triggerHaptic('success');
            showNotification('የሪፈራል ሊንክ ተኮፒ አድርጓል!', 'success');
        });
    }
}