import { submitDepositAPI, submitWithdrawAPI } from './api.js';

export function switchWalletTab(tab) {
    if (tab === 'deposit') {
        document.getElementById('wallet-deposit-pane').classList.remove('hidden');
        document.getElementById('wallet-withdraw-pane').classList.add('hidden');
        document.getElementById('tab-deposit-btn').className = 'flex-1 pb-2 text-xs font-bold text-amber-400 border-b-2 border-amber-400';
        document.getElementById('tab-withdraw-btn').className = 'flex-1 pb-2 text-xs font-bold text-gray-400';
    } else {
        document.getElementById('wallet-deposit-pane').classList.add('hidden');
        document.getElementById('wallet-withdraw-pane').classList.remove('hidden');
        document.getElementById('tab-withdraw-btn').className = 'flex-1 pb-2 text-xs font-bold text-pink-400 border-b-2 border-pink-400';
        document.getElementById('tab-deposit-btn').className = 'flex-1 pb-2 text-xs font-bold text-gray-400';
    }
}

export async function submitDeposit(currentUser) {
    let amount = document.getElementById('deposit-amount-input').value;
    let transactionDetails = document.getElementById('deposit-tx-input').value;
    
    if (!amount || amount <= 0 || !transactionDetails) {
        alert('❌ እባክዎ የብር መጠን እና የትራንዛክሽን መረጃውን በትክክል ይሙሉ');
        return;
    }

    try {
        let data = await submitDepositAPI(currentUser.telegramId, amount, transactionDetails);
        if (data.success) {
            alert('✅ የዲፖዚት ጥያቄዎ እና የትራንዛክሽን መረጃው ለአድሚን ተልኳል!');
            document.getElementById('deposit-amount-input').value = '';
            document.getElementById('deposit-tx-input').value = '';
        } else {
            alert(data.message);
        }
    } catch (e) {
        console.error(e);
    }
}

export async function submitWithdraw(currentUser, updateHeaderFn) {
    let amount = document.getElementById('withdraw-amount-input').value;
    if (!amount || amount <= 0) {
        alert('❌ እባክዎ ማውጣት የሚፈልጉትን ትክክለኛ የብር መጠን ያስገቡ');
        return;
    }

    try {
        let data = await submitWithdrawAPI(currentUser.telegramId, amount);
        if (data.success) {
            currentUser.balance = data.balance;
            updateHeaderFn();
            alert('✅ የዊዝድሮ ጥያቄዎ ተልኳል! በቅርቡ ይረጋገጣል።');
            document.getElementById('withdraw-amount-input').value = '';
        } else {
            alert(data.message || 'ስህተት ተፈጥሯል');
        }
    } catch (e) {
        console.error(e);
    }
}