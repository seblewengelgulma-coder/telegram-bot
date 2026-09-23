import { playKenoAPI } from './api.js';

let kenoSelectedNumbers = [];
let kenoBetAmount = 10; // ቋሚ የውርርድ መጠን
let isGameRunning = false;

// 📌 0. የኬኖ የማባዣ ማትሪክስ (Payout Multiplier Matrix)
const KENO_PAYOUT_TABLE = {
    1: { 1: "3.8x" },
    2: { 2: "15.0x" },
    3: { 2: "2.0x", 3: "46.0x" },
    4: { 2: "1.0x", 3: "5.0x", 4: "100.0x" },
    5: { 3: "3.0x", 4: "15.0x", 5: "300.0x" },
    6: { 3: "1.0x", 4: "10.0x", 5: "70.0x", 6: "1800.0x" },
    7: { 4: "2.0x", 5: "20.0x", 6: "100.0x", 7: "5000.0x" },
    8: { 4: "2.0x", 5: "12.0x", 6: "50.0x", 7: "1000.0x", 8: "15000.0x" },
    9: { 4: "1.0x", 5: "6.0x", 6: "25.0x", 7: "200.0x", 8: "4000.0x", 9: "40000.0x" },
    10: { 5: "5.0x", 6: "15.0x", 7: "80.0x", 8: "500.0x", 9: "10000.0x", 10: "100000.0x" }
};

// 📌 1. የውርርድ መጠን ማስተካከያ
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

// 📌 2. የውርርድ መጠን እና የተመረጡ ቁጥሮች ብዛት ማሳያ
function updateBetDisplay() {
    let betDisplay = document.getElementById('keno-current-bet-display');
    let countElem = document.getElementById('keno-selected-count');

    let count = kenoSelectedNumbers.length;

    if (betDisplay) {
        betDisplay.innerText = `ETB ${kenoBetAmount}`;
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
        btn.className = 'keno-num-btn glass-card rounded-lg text-gray-200 border border-purple-900 p-2 text-center font-bold transition-all hover:border-amber-400';
        btn.innerText = i;
        btn.id = `keno-btn-${i}`;
        btn.onclick = () => toggleKenoNum(i, btn);
        grid.appendChild(btn);
    }
}

// 📌 4. ቁጥር መምረጫ / መሰረዣ
export function toggleKenoNum(num, btn) {
    if (isGameRunning) return;

    let targetNum = Number(num);
    let idx = kenoSelectedNumbers.indexOf(targetNum);
    
    if (idx > -1) {
        kenoSelectedNumbers.splice(idx, 1);
        btn.classList.remove('selected', 'bg-pink-600', 'text-white');
    } else {
        if (kenoSelectedNumbers.length >= 10) {
            alert('⚠️ ቢበዛ 10 ቁጥሮች ብቻ መምረጥ ይችላሉ!');
            return;
        }
        kenoSelectedNumbers.push(targetNum);
        btn.classList.add('selected', 'bg-pink-600', 'text-white');
    }
    
    updateBetDisplay();
}

// 📌 5. የተመረጡ ቁጥሮችን ማፅጃ
export function clearKenoSelection() {
    if (isGameRunning) return;

    kenoSelectedNumbers = [];
    document.querySelectorAll('.keno-num-btn').forEach(b => {
        b.classList.remove('selected', 'bg-pink-600', 'text-white', 'drawn-hit', 'drawn-miss', 'opacity-40', 'bg-green-500', 'text-black', 'ring-4', 'ring-amber-400');
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

// 📌 6. ጨዋታ ማስጀመሪያ
export async function startKenoDraw(currentUser, updateHeaderFn) {
    if (isGameRunning) return;

    if (kenoSelectedNumbers.length === 0) {
        alert('❌ ቢያንስ አንድ ቁጥር ይምረጡ!');
        return;
    }

    if (currentUser.balance < kenoBetAmount) {
        alert(`❌ በቂ ባላንስ የለዎትም! የሚፈልገው: ETB ${kenoBetAmount}`);
        return;
    }

    try {
        let data = await playKenoAPI(currentUser.telegramId || currentUser.userId, kenoBetAmount, kenoSelectedNumbers);
        
        if (!data.success) {
            alert(data.message || 'ስህተት ተፈጥሯል');
            return;
        }

        isGameRunning = true;
        setGridLock(true);

        // የውርርዱ መጠን ከባላንስ ላይ ተቀንሶ ለጊዜው ይታያል
        currentUser.balance -= kenoBetAmount;
        updateHeaderFn();

        // የቀደሙ የውጤት ምልክቶችን ማፅዳት
        document.querySelectorAll('.keno-num-btn').forEach(b => {
            b.classList.remove('drawn-hit', 'drawn-miss', 'opacity-40', 'bg-green-500', 'text-black', 'ring-4', 'ring-amber-400');
        });
        
        let drawnContainer = document.getElementById('keno-drawn-container');
        if (drawnContainer) drawnContainer.innerHTML = '';

        let drawnNumbers = data.drawnNumbers || [];
        let currentIndex = 0;

        const DRAW_SPEED_MS = 600; // ለተሻለ አኒሜሽን ፍጥነቱ ወደ 600ms ዝቅ ተደርጓል

        let drawInterval = setInterval(() => {
            if (currentIndex < drawnNumbers.length) {
                let num = Number(drawnNumbers[currentIndex]);
                let isHit = kenoSelectedNumbers.includes(num);

                let btn = document.getElementById(`keno-btn-${num}`);
                if (btn) {
                    if (isHit) {
                        btn.classList.remove('bg-pink-600');
                        btn.classList.add('drawn-hit', 'bg-green-500', 'text-black', 'font-extrabold', 'ring-4', 'ring-amber-400');
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

                // ጨዋታው ሲያልቅ የመጨረሻው ትክክለኛ ባላንስ ከሰርቨር ይዘመናል
                if (data.newBalance !== undefined) {
                    currentUser.balance = data.newBalance;
                    updateHeaderFn();
                }

                setTimeout(() => {
                    if (data.winAmount > 0) {
                        alert(`🎉 እንኳን ደስ አለዎት!\n✨ የተመቱ ቁጥሮች: ${data.matchesCount}\n🔥 ማባዣ: ${data.multiplierUsed}x\n💰 ያሸነፉት: ETB ${data.winAmount}`);
                    } else {
                        alert(`🎲 ጨዋታው ተጠናቀቀ!\n✨ የተመቱ ቁጥሮች: ${data.matchesCount}\n❌ በዚህ ዙር አላሸነፉም። እንደገና ይሞክሩ!`);
                    }
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

// 📌 7. የ Payout Modal ማሳያ
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