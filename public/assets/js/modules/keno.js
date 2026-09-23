import { playKenoAPI } from './api.js';

let kenoSelectedNumbers = [];
let kenoBetAmount = 10; // ቤዝ ውርርድ
let isGameRunning = false;

// 📌 0. በፍሮንትኤንድ ለ Payout Modal ማሳያ ብቻ የሚያገለግል የማባዣ ማትሪክስ (ከባክኤንድ ጋር ተመሳሳይ)
const KENO_PAYOUT_TABLE = {
    1: { 1: "0.5x" },
    2: { 1: "0.5x", 2: "1.2x" },
    3: { 2: "1.0x", 3: "1.6x" },
    4: { 2: "0.5x", 3: "1.2x", 4: "2.2x" },
    5: { 3: "1.2x", 4: "1.8x", 5: "2.8x" },
    6: { 3: "1.0x", 4: "1.5x", 5: "2.2x", 6: "3.5x" },
    7: { 4: "1.2x", 5: "2.0x", 6: "3.0x", 7: "4.5x" },
    8: { 4: "1.0x", 5: "1.8x", 6: "3.0x", 7: "4.5x", 8: "6.0x" },
    9: { 5: "1.5x", 6: "2.5x", 7: "4.5x", 8: "7.0x", 9: "10.0x" },
    10: { 5: "1.0x", 6: "2.0x", 7: "4.0x", 8: "8.0x", 9: "12.0x", 10: "20.0x" }
};

// 📌 1. የውርርድ መጠን ማስተካከያ እና UI ማዘመኛ
export function setKenoBet(amount, targetBtn) {
    if (isGameRunning) return;

    kenoBetAmount = parseFloat(amount);
    updateBetDisplay();

    document.querySelectorAll('.keno-bet-btn').forEach(btn => {
        btn.classList.remove('btn-neon-purple', 'text-white', 'active');
        btn.classList.add('glass-card', 'text-gray-300');
    });
    
    if (targetBtn) {
        targetBtn.classList.remove('glass-card', 'text-gray-300');
        targetBtn.classList.add('btn-neon-purple', 'text-white', 'active');
    }
}

// 📌 2. የጠቅላላ ውርርድ እና የቁጥሮች ብዛት ማሳያ
function updateBetDisplay() {
    let betDisplay = document.getElementById('keno-current-bet-display');
    let countElem = document.getElementById('keno-selected-count');

    let count = kenoSelectedNumbers.length;
    let totalBet = count > 0 ? kenoBetAmount * count : kenoBetAmount;

    if (betDisplay) {
        betDisplay.innerText = `ETB ${totalBet}`;
    }
    if (countElem) {
        countElem.innerText = count;
    }
}

export function resetKenoBet(defaultAmount = 10) {
    if (isGameRunning) return;
    kenoBetAmount = defaultAmount;
    updateBetDisplay();
}

// 📌 3. የ 80 ቁጥሮች ግሪድ ማዘጋጃ
export function initKenoGrid() {
    let grid = document.getElementById('keno-80-grid');
    if (!grid) return;
    grid.innerHTML = '';
    for (let i = 1; i <= 80; i++) {
        let btn = document.createElement('button');
        btn.className = 'keno-num-btn glass-card rounded-lg text-gray-200 border border-purple-900 p-2 text-center font-bold transition-all';
        btn.innerText = i;
        btn.id = `keno-btn-${i}`;
        btn.onclick = () => toggleKenoNum(i, btn);
        grid.appendChild(btn);
    }
}

// 📌 4. ቁጥር መምረጫ / መሰረዣ
export function toggleKenoNum(num, btn) {
    if (isGameRunning) return;

    let idx = kenoSelectedNumbers.indexOf(num);
    if (idx > -1) {
        kenoSelectedNumbers.splice(idx, 1);
        btn.classList.remove('selected', 'bg-pink-600', 'text-white');
    } else {
        if (kenoSelectedNumbers.length >= 10) {
            alert('⚠️ ቢበዛ 10 ቁጥሮች ብቻ መምረጥ ይችላሉ!');
            return;
        }
        kenoSelectedNumbers.push(num);
        btn.classList.add('selected', 'bg-pink-600', 'text-white');
    }
    
    updateBetDisplay();
}

// 📌 5. የተመረጡ ቁጥሮችን ማፅጃ
export function clearKenoSelection() {
    if (isGameRunning) return;

    kenoSelectedNumbers = [];
    document.querySelectorAll('.keno-num-btn').forEach(b => {
        b.classList.remove('selected', 'bg-pink-600', 'text-white', 'drawn-hit', 'drawn-miss', 'opacity-40');
    });
    
    updateBetDisplay();

    let drawnContainer = document.getElementById('keno-drawn-container');
    if (drawnContainer) drawnContainer.innerHTML = '';
}

// 🔒 ጨዋታው ሲጀመር ሰሌዳውን መቆለፊያ
function setGridLock(lock) {
    let grid = document.getElementById('keno-80-grid');
    let controls = document.querySelectorAll('.keno-bet-btn, #start-keno-draw-btn, #start-keno-btn, #clear-keno-btn');

    if (grid) {
        if (lock) {
            grid.classList.add('pointer-events-none', 'opacity-60');
        } else {
            grid.classList.remove('pointer-events-none', 'opacity-60');
        }
    }

    controls.forEach(ctrl => {
        if (ctrl) {
            ctrl.disabled = lock;
            if (lock) ctrl.classList.add('opacity-50', 'cursor-not-allowed');
            else ctrl.classList.remove('opacity-50', 'cursor-not-allowed');
        }
    });
}

// 📌 6. ጨዋታ ማስጀመሪያ (Interval)
export async function startKenoDraw(currentUser, updateHeaderFn) {
    if (isGameRunning) return;

    if (kenoSelectedNumbers.length === 0) {
        alert('❌ ቢያንስ አንድ ቁጥር ይምረጡ!');
        return;
    }

    let calculatedTotalBet = kenoBetAmount * kenoSelectedNumbers.length;

    if (currentUser.balance < calculatedTotalBet) {
        alert(`❌ በቂ ባላንስ የለዎትም! የሚፈልገው: ETB ${calculatedTotalBet}`);
        return;
    }

    try {
        let data = await playKenoAPI(currentUser.telegramId, calculatedTotalBet, kenoSelectedNumbers);
        
        if (!data.success) {
            alert(data.message || 'ስህተት ተፈጥሯል');
            return;
        }

        isGameRunning = true;
        setGridLock(true);

        currentUser.balance = data.newBalance;
        updateHeaderFn();

        document.querySelectorAll('.keno-num-btn').forEach(b => {
            b.classList.remove('drawn-hit', 'drawn-miss', 'opacity-40', 'bg-green-500', 'text-black');
        });
        
        let drawnContainer = document.getElementById('keno-drawn-container');
        if (drawnContainer) drawnContainer.innerHTML = '';

        let drawnNumbers = data.drawnNumbers || [];
        let currentIndex = 0;

        const DRAW_SPEED_MS = 1500; 

        let drawInterval = setInterval(() => {
            if (currentIndex < drawnNumbers.length) {
                let num = drawnNumbers[currentIndex];
                let isHit = kenoSelectedNumbers.includes(num);

                let btn = document.getElementById(`keno-btn-${num}`);
                if (btn) {
                    if (isHit) {
                        btn.classList.add('drawn-hit', 'bg-green-500', 'text-black');
                    } else {
                        btn.classList.add('drawn-miss', 'opacity-40');
                    }
                }

                if (drawnContainer) {
                    let numBadge = document.createElement('div');
                    numBadge.className = `w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full font-bold text-white shadow-lg transition-transform transform scale-110 ${
                        isHit ? 'bg-amber-400 text-black font-extrabold ring-2 ring-white animate-bounce' : 'bg-purple-700'
                    }`;
                    numBadge.innerText = num;
                    drawnContainer.appendChild(numBadge);
                    
                    drawnContainer.scrollLeft = drawnContainer.scrollWidth;
                }

                currentIndex++;
            } else {
                clearInterval(drawInterval);
                isGameRunning = false;
                setGridLock(false);

                if (data.winAmount > 0) {
                    currentUser.balance += data.winAmount;
                    updateHeaderFn();
                }

                setTimeout(() => {
                    alert(`🎲 የኬኖ ጨዋታ ተጠናቀቀ!\n✨ ትክክለኛ ግጥሚያ: ${data.matchesCount}\n💰 ያሸነፉት: ETB ${data.winAmount}`);
                }, 400);
            }
        }, DRAW_SPEED_MS);

    } catch (e) {
        isGameRunning = false;
        setGridLock(false);
        console.error(e);
        alert('❌ ሰርቨር ጋር መገናኘት አልተቻለም');
    }
}

// 📌 7. የ Payout Modal ማሳያና ይዘት ማዘጋጃ
export function toggleKenoPayoutModal(show) {
    let modal = document.getElementById('keno-payout-modal');
    if (!modal) return;

    if (show) {
        let contentContainer = document.getElementById('keno-payout-table-content');
        if (contentContainer) {
            let html = `<div class="overflow-x-auto"><table class="w-full text-sm text-left text-gray-300 border-collapse">
                <thead>
                    <tr class="border-b border-purple-800 text-purple-300">
                        <th class="p-2">የተመረጡ (Selected)</th>
                        <th class="p-2">የመቱት (Hits)</th>
                        <th class="p-2">ማባዣ (Multiplier)</th>
                    </tr>
                </thead>
                <tbody>`;

            for (let selectCount in KENO_PAYOUT_TABLE) {
                let hitsObj = KENO_PAYOUT_TABLE[selectCount];
                for (let hitCount in hitsObj) {
                    html += `<tr class="border-b border-purple-900/50 hover:bg-purple-900/20">
                        <td class="p-2 font-semibold">${selectCount} ቁጥሮች</td>
                        <td class="p-2">${hitCount} ግጥሚያ</td>
                        <td class="p-2 text-amber-400 font-bold">${hitsObj[hitCount]}</td>
                    </tr>`;
                }
            }

            html += `</tbody></table></div>`;
            contentContainer.innerHTML = html;
        }
        modal.classList.remove('hidden');
    } else {
        modal.classList.add('hidden');
    }
}