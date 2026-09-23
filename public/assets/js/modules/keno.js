import { playKenoAPI } from './api.js';

let kenoSelectedNumbers = [];
let kenoBetAmount = 10;

export function setKenoBet(amount, targetBtn) {
    kenoBetAmount = amount;
    document.querySelectorAll('.keno-bet-btn').forEach(btn => {
        btn.classList.remove('btn-neon-purple', 'text-white', 'active');
        btn.classList.add('glass-card', 'text-gray-300');
    });
    if (targetBtn) {
        targetBtn.classList.remove('glass-card', 'text-gray-300');
        targetBtn.classList.add('btn-neon-purple', 'text-white', 'active');
    }
}

export function initKenoGrid() {
    let grid = document.getElementById('keno-80-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 1; i <= 80; i++) {
        let btn = document.createElement('button');
        btn.className = 'keno-num-btn glass-card rounded-lg text-gray-200 border border-purple-900';
        btn.innerText = i;
        btn.id = `keno-btn-${i}`;
        btn.onclick = () => toggleKenoNum(i, btn);
        grid.appendChild(btn);
    }
}

export function toggleKenoNum(num, btn) {
    let idx = kenoSelectedNumbers.indexOf(num);
    if (idx > -1) {
        kenoSelectedNumbers.splice(idx, 1);
        btn.classList.remove('selected');
    } else {
        if (kenoSelectedNumbers.length >= 10) {
            alert('⚠️ ቢበዛ 10 ቁጥሮች ብቻ መምረጥ ይችላሉ!');
            return;
        }
        kenoSelectedNumbers.push(num);
        btn.classList.add('selected');
    }
    document.getElementById('keno-selected-count').innerText = kenoSelectedNumbers.length;
}

export function clearKenoSelection() {
    kenoSelectedNumbers = [];
    document.querySelectorAll('.keno-num-btn').forEach(b => b.classList.remove('selected', 'drawn-hit', 'drawn-miss'));
    document.getElementById('keno-selected-count').innerText = 0;
}

export async function startKenoDraw(currentUser, updateHeaderFn) {
    if (kenoSelectedNumbers.length === 0) {
        alert('❌ ቢያንስ አንድ ቁጥር ይምረጡ!');
        return;
    }
    if (currentUser.balance < kenoBetAmount) {
        alert('❌ በቂ ባላንስ የለዎትም!');
        return;
    }

    try {
        let data = await playKenoAPI(currentUser.telegramId, kenoBetAmount, kenoSelectedNumbers);
        
        if (!data.success) {
            alert(data.message || 'ስህተት ተፈጥሯል');
            return;
        }

        currentUser.balance = data.newBalance;
        updateHeaderFn();

        document.querySelectorAll('.keno-num-btn').forEach(b => b.classList.remove('drawn-hit', 'drawn-miss'));

        let drawnNumbers = data.drawnNumbers;
        let currentIndex = 0;

        alert('🎲 የኬኖ ጨዋታ ተጀምሯል! ቁጥሮች በየ 3 ሰከንድ መውጣት ጀምረዋል...');

        let drawInterval = setInterval(() => {
            if (currentIndex < drawnNumbers.length) {
                let num = drawnNumbers[currentIndex];
                let btn = document.getElementById(`keno-btn-${num}`);
                
                if (btn) {
                    if (kenoSelectedNumbers.includes(num)) {
                        btn.classList.add('drawn-hit');
                    } else {
                        btn.classList.add('drawn-miss');
                    }
                }
                currentIndex++;
            } else {
                clearInterval(drawInterval);
                setTimeout(() => {
                    alert(`🎲 የኬኖ ጨዋታ ተጠናቀቀ!\n✨ ትክክለኛ ግጥሚያ: ${data.matchesCount}\n💰 ያሸነፉት: ETB ${data.winAmount}`);
                    clearKenoSelection();
                }, 500);
            }
        }, 3000);

    } catch (e) {
        console.error(e);
        alert('❌ ሰርቨር ጋር መገናኘት አልተቻለም');
    }
}

export function toggleKenoPayoutModal(show) {
    let modal = document.getElementById('keno-payout-modal');
    if (show) modal.classList.remove('hidden');
    else modal.classList.add('hidden');
}