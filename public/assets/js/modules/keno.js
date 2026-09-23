import { playKenoAPI } from './api.js';

let kenoSelectedNumbers = [];
let kenoBetAmount = 10; // ቤዝ ውርርድ
let isGameRunning = false;

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
    // የተደመረ ውርርድ = የተመረጡ ቁጥሮች ብዛት * የቋሚ ውርርድ መጠን (ከ 1 በላይ ከተመረጠ)
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

// 📌 4. ቁጥር መምረጫ / መሰረዣ (የተደመረውን ባላንስ ያሳያል)
export function toggleKenoNum(num, btn) {
    if (isGameRunning) return; // ጨዋታው ከጀመረ ቁጥር አይነካም

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
    
    // የተደመረውን ባላንስ እና ቁጥር ማዘመን
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

// 🔒 ጨዋታው ሲጀመር ሰሌዳውን መቆለፊያ (Disable UI)
function setGridLock(lock) {
    let grid = document.getElementById('keno-80-grid');
    // ሁሉንም አዝራሮች መቆለፋችንን ማረጋገጥ (#start-keno-draw-btn ጨምሮ)
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

        // 🔒 ጨዋታውን ማስመርመር እና ሰሌዳውን መቆለፍ
        isGameRunning = true;
        setGridLock(true);

        currentUser.balance = data.newBalance;
        updateHeaderFn();

        // ያለፈውን የጨዋታ ምልክቶች ማፅዳት
        document.querySelectorAll('.keno-num-btn').forEach(b => {
            b.classList.remove('drawn-hit', 'drawn-miss', 'opacity-40', 'bg-green-500', 'text-black');
        });
        
        let drawnContainer = document.getElementById('keno-drawn-container');
        if (drawnContainer) drawnContainer.innerHTML = '';

        let drawnNumbers = data.drawnNumbers || [];
        let currentIndex = 0;

        // ⏱ በየ 1.5 ሰከንዱ (1500ms) ቁጥሮችን ማውጣት (ከ 3000ms ወደ 1500ms ወይም እንደፍላጎትዎ ማስተካከል ይችላሉ)
        const DRAW_SPEED_MS = 1500; 

        let drawInterval = setInterval(() => {
            if (currentIndex < drawnNumbers.length) {
                let num = drawnNumbers[currentIndex];
                let isHit = kenoSelectedNumbers.includes(num);

                // ሀ) Grid ላይ ያለውን ቁጥር ከለር መቀየር
                let btn = document.getElementById(`keno-btn-${num}`);
                if (btn) {
                    if (isHit) {
                        btn.classList.add('drawn-hit', 'bg-green-500', 'text-black');
                    } else {
                        btn.classList.add('drawn-miss', 'opacity-40');
                    }
                }

                // ለ) ከታች በየተወሰነ ሰከንዱ የወጣውን ቁጥር ደርድሮ ማሳየት
                if (drawnContainer) {
                    let numBadge = document.createElement('div');
                    numBadge.className = `w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-full font-bold text-white shadow-lg transition-transform transform scale-110 ${
                        isHit ? 'bg-amber-400 text-black font-extrabold ring-2 ring-white animate-bounce' : 'bg-purple-700'
                    }`;
                    numBadge.innerText = num;
                    drawnContainer.appendChild(numBadge);
                    
                    // አዲስ የወጣው ቁጥር ሁልጊዜ እንዲታይ ወደ ቀኝ Scroll ማድረግ
                    drawnContainer.scrollLeft = drawnContainer.scrollWidth;
                }

                currentIndex++;
            } else {
                clearInterval(drawInterval);
                isGameRunning = false;
                setGridLock(false); // 🔓 ሰሌዳውን መክፈት

                // የአሸናፊነት ባላንስ ማዘመኛ
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

export function toggleKenoPayoutModal(show) {
    let modal = document.getElementById('keno-payout-modal');
    if (modal) {
        if (show) modal.classList.remove('hidden');
        else modal.classList.add('hidden');
    }
}