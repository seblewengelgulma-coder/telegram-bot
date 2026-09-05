require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// --- 1. የሞንጎዲቢ ግንኙነት (MongoDB Connection) ---
const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    console.error('❌ MONGODB_URI is not defined in environment variables!');
    process.exit(1);
}

mongoose.connect(MONGO_URI)
.then(() => {
    console.log('📦 Connected to MongoDB successfully!');
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});

// --- 2. ዳታቤዝ ስኬማዎች (Schemas) ---
const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    userName: { type: String },
    phone: { type: String, default: null },
    balance: { type: Number, default: 0 },
    totalGames: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    level: { type: Number, default: 1 }
});
const User = mongoose.model('User', userSchema);

const requestSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    userName: { type: String },
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    details: { type: String, required: true },
    photoUniqueId: { type: String, unique: true, sparse: true }, 
    photoId: { type: String, sparse: true }, 
    date: { type: Date, default: Date.now }
});
const RequestModel = mongoose.model('Request', requestSchema);

const commentSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    userName: { type: String },
    message: { type: String, required: true },
    photoId: { type: String, default: null },
    adminReply: { type: String, default: null },
    adminPhotoId: { type: String, default: null },
    date: { type: Date, default: Date.now }
});
const CommentModel = mongoose.model('Comment', commentSchema);

const takenNumberSchema = new mongoose.Schema({
    number: { type: Number, unique: true, required: true },
    userId: { type: Number, required: true },
    userName: { type: String }
});
const TakenNumber = mongoose.model('TakenNumber', takenNumberSchema);

// --- 3. ቦት እና አድሚን ማዋቀር ---
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
    console.error('❌ BOT_TOKEN is not defined!');
    process.exit(1);
}

const bot = new Telegraf(TOKEN);
const ADMIN_ID = 380035906;

const ADMIN_PAYMENT_INFO = `🏦 **የአድሚን የክፍያ አካውንቶች (ለዲፖዚት)**\n\n` +
    `1. **ንግድ ባንክ (CBE):** 10005741880 (ቴዎድሮስ / እፉዬ)\n` +
    `2. **ቴሌብር (Telebirr):** 0929441620 (ቴዎድሮስ)\n\n`;

let userSteps = {}; 
let activeGames = {}; 
let waitingRoom = {}; 
let kenoSessions = {}; 

async function getOrCreateUser(userId, userName = 'ተጫዋች') {
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId, userName, balance: 0 });
        await user.save();
    }
    return user;
}

app.get('/', (req, res) => {
  res.send('Efuye Bingo & Keno Ultimate Bot Server is running!');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// የኬኖ ኪቦርድ ማመንጫ
function getKenoKeyboard(selectedNumbers = [], betAmount = 10) {
    let keyboard = [];
    let row = [];
    for (let i = 1; i <= 80; i++) {
        let isSelected = selectedNumbers.includes(i);
        let btnText = isSelected ? `✅ ${i}` : `${i}`;
        row.push(Markup.button.callback(btnText, `keno_num_${i}`));
        if (row.length === 8) {
            keyboard.push(row);
            row = [];
        }
    }
    keyboard.push([Markup.button.callback('📊 የሽልማት ሰንጠረዥ (Payout Table)', 'view_payout_table')]);
    keyboard.push([Markup.button.callback('🎲 ኬኖ ጨዋታ ጀምር (Draw)', 'start_keno_draw')]);
    keyboard.push([Markup.button.callback('🔙 ወደ ዋናው ሜኑ', 'back_to_main_menu')]);
    return Markup.inlineKeyboard(keyboard);
}

// የኬኖ ሁኔታ (አጠቃላይ የሚገኘው ገንዘብ: ያስያዙት + (ያስያዙት * ማባዣ) ሆኖ ከነጥብ ነጻ ተደርጓል)
function getKenoStatusText(selectedNumbers, betAmount, userBalance) {
    let count = selectedNumbers.length;
    let multiplier = 0;

    if (count === 10) { multiplier = 20; }
    else if (count === 9) { multiplier = 10; }
    else if (count === 8) { multiplier = 6; }
    else if (count === 7) { multiplier = 3.5; }
    else if (count === 6) { multiplier = 2; }
    else if (count === 5) { multiplier = 1.2; }
    else if (count === 4) { multiplier = 0.8; }
    else if (count === 3) { multiplier = 0.5; }
    else if (count === 2) { multiplier = 0.3; }
    else if (count === 1) { multiplier = 0.2; }

    // ያስያዙት ገንዘብ ሲደመር (ያስያዙት በ ማባዣ ተባዝቶ) አጠቃላይ የሚመለሰው ገንዘብ
    let potentialWin = Math.round(betAmount + (betAmount * multiplier));

    let desc = "";
    if (count === 0) {
        desc = "💡 *እባክዎ ከ 1 እስከ 10 ቁጥሮች ይምረጡ።*";
    } else {
        desc = `✨ **ሁኔታ:** ${count} ቁጥር መርጠዋል (ማባዣው **${multiplier}x** ነው)`;
    }

    return `🎲 **ኬኖ ጨዋታ (የውርርድ መጠን: ${betAmount} ETB)**\n\n` +
           `የመረጧቸው ቁጥሮች: [ **${selectedNumbers.sort((a,b)=>a-b).join(', ')}** ] (${count}/10)\n\n` +
           `${desc}\n\n` +
           `💰 ሙሉውን ሲያሸንፉ የሚደርስዎት ጠቅላላ ሽልማት: **ETB ${potentialWin}**\n` +
           `አካውንት ባላንስ: **ETB ${userBalance}**`;
}

// የቢንጎ 1-100 ቁጥሮች ሰሌዳ
async function getBingo1to100Keyboard() {
    let keyboard = [];
    let row = [];
    
    let takenDocs = await TakenNumber.find({});
    let takenMap = {};
    takenDocs.forEach(doc => { takenMap[doc.number] = true; });

    for (let i = 1; i <= 100; i++) {
        if (takenMap[i]) {
            row.push(Markup.button.callback(`✅ ${i}`, `b_taken_${i}`));
        } else {
            row.push(Markup.button.callback(`${i}`, `b_pick_${i}`));
        }

        if (row.length === 10) {
            keyboard.push(row);
            row = [];
        }
    }
    keyboard.push([Markup.button.callback('🔙 ወደ ዋናው ሜኑ', 'back_to_main_menu')]);
    return Markup.inlineKeyboard(keyboard);
}

function generateRandomBingoCard() {
    let numbers = [];
    while (numbers.length < 24) {
        let rand = Math.floor(Math.random() * 100) + 1;
        if (!numbers.includes(rand)) numbers.push(rand);
    }
    
    let matrix = [];
    let idx = 0;
    for (let r = 0; r < 5; r++) {
        let row = [];
        for (let c = 0; c < 5; c++) {
            if (r === 2 && c === 2) {
                row.push({ number: '⭐', marked: true, isFree: true });
            } else {
                row.push({ number: numbers[idx++], marked: false, isFree: false });
            }
        }
        matrix.push(row);
    }
    return matrix;
}

function getBingoKeyboard(matrix) {
    let keyboard = [];
    keyboard.push([
        Markup.button.callback(' B ', 'noop'),
        Markup.button.callback(' I ', 'noop'),
        Markup.button.callback(' N ', 'noop'),
        Markup.button.callback(' G ', 'noop'),
        Markup.button.callback(' O ', 'noop')
    ]);

    matrix.forEach((row, rIndex) => {
        let rowButtons = [];
        row.forEach((cell, cIndex) => {
            let text = cell.marked ? `🟩 ${cell.number}` : `⬜ ${cell.number}`;
            rowButtons.push(Markup.button.callback(text, `cell_${rIndex}_${cIndex}`));
        });
        keyboard.push(rowButtons);
    });
    keyboard.push([Markup.button.callback('🎯 BINGO (ቢንጎ አረጋግጥ)', 'check_bingo')]);
    return Markup.inlineKeyboard(keyboard);
}

function checkWinCondition(matrix) {
    for (let r = 0; r < 5; r++) {
        if (matrix[r].every(cell => cell.marked)) return true;
    }
    for (let c = 0; c < 5; c++) {
        let winCol = true;
        for (let r = 0; r < 5; r++) {
            if (!matrix[r][c].marked) { winCol = false; break; }
        }
        if (winCol) return true;
    }
    let diag1 = true, diag2 = true;
    for (let i = 0; i < 5; i++) {
        if (!matrix[i][i].marked) diag1 = false;
        if (!matrix[i][4 - i].marked) diag2 = false;
    }
    return diag1 || diag2;
}

const mainKeyboard = Markup.keyboard([
    ['🎮 ፕለይ (Play)'],
    ['💰 ዲፖዚት (Deposit)', '💳 ዊዝድሮ (Withdraw)'],
    ['👤 ፕሮፋይል (Profile)', '💬 ኮሜንት (Comment)'],
    ['📖 መመሪያ (Instructions)']
]).resize();

const adminKeyboard = Markup.keyboard([
    ['📊 የአድሚን ባላንስ ማየት', '👥 የተጫዋቾች ዝርዝር (Player List)'],
    ['📥 የዲፖዚት/ዊዝድሮ ጥያቄዎች', '💬 የተጫዋቾች ኮሜንቶች'],
    ['💵 አድሚን ዲፖዚት ማድረግ', '🎮 አድሚን መጫወቻ (Admin Play)'],
    ['🔙 ወደ ዋናው ሜኑ ተመለስ']
]).resize();

bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'ወዳጄ';
    let user = await getOrCreateUser(userId, userName);

    if (userId === ADMIN_ID) {
        return ctx.reply(`👑 **ሰላም አድሚን ${userName}!**\nወደ አስተዳዳሪ ፓነል በደህና መጡ።`, adminKeyboard);
    }

    if (!user.phone) {
        return ctx.reply(
            `🎲 **እፉዬ ጨዋታዎች ማዕከል** - እንኳን ደህና መጡ ${userName}!\n\nቦቱን ለመጠቀም እባክዎ ከታች ያለውን አዝራር በመጫን **ስልክ ቁጥርዎን** ያጋሩ:`,
            Markup.keyboard([[Markup.button.contactRequest('📱 ስልክ ቁጥር አጋራ (Share Contact)')]]).resize()
        );
    }

    await ctx.reply(`🎲 **እፉዬ ጨዋታዎች ማዕከል** - እንኳን ደህና መጡ እንደገና ${userName}!\n\nእባክዎ የሚፈልጉትን አማራጭ ከታች ካለው ሜኑ ይምረጡ።`, mainKeyboard);
});

bot.on('contact', async (ctx) => {
    const userId = ctx.from.id;
    const phone = ctx.message.contact.phone_number;
    let user = await getOrCreateUser(userId);
    user.phone = phone;
    await user.save();
    ctx.reply(`✅ ስልክ ቁጥርዎ በተሳካ ሁኔታ ተመዝግቧል!`, mainKeyboard);
});

bot.hears('🎮 ፕለይ (Play)', (ctx) => {
    ctx.reply(
        `🎮 **እባክዎ መጫወት የሚፈልጉትን ጨዋታ ይምረጡ፦**`,
        Markup.inlineKeyboard([
            [Markup.button.callback('🎯 ቢንጎ ጨዋታ (Bingo)', 'select_bingo_main')],
            [Markup.button.callback('🎲 ኬኖ ጨዋታ (Keno)', 'select_keno')]
        ])
    );
});

bot.action('select_bingo_main', (ctx) => {
    ctx.editMessageText(
        `🎯 **የቢንጎ ጨዋታ - የውርርድ መጠን ይምረጡ:**\n\nእባክዎ መጫወት የሚፈልጉትን የብር መጠን ይምረጡ:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('Play 10 ETB', 'play_10'), Markup.button.callback('Play 20 ETB', 'play_20')],
            [Markup.button.callback('Play 50 ETB', 'play_50'), Markup.button.callback('Play 100 ETB', 'play_100')],
            [Markup.button.callback('🔙 ወደ ዋናው ሜኑ', 'back_to_main_menu')]
        ])
    );
});

bot.action(/play_(\d+)/, async (ctx) => {
    const cost = parseInt(ctx.match[1]);
    let keyboard = await getBingo1to100Keyboard();
    ctx.editMessageText(
        `🎯 **የቢንጎ ጨዋታ (ETB ${cost})**\n\nከዚህ በታች ካሉት **ከ 1 እስከ 100** ቁጥሮች ውስጥ የሚፈልጉትን አንድ ቁጥር ይምረጡ:`,
        keyboard
    );
});

bot.action(/b_taken_(\d+)/, async (ctx) => {
    const num = parseInt(ctx.match[1]);
    return ctx.answerCbQuery(`⚠️ ይቅርታ! ቁጥር ${num} በሌላ ተጫዋች ተይዟል!`, { show_alert: true });
});

bot.action(/b_pick_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'ተጫዋች';
    const num = parseInt(ctx.match[1]);

    try {
        let existing = await TakenNumber.findOne({ number: num });
        if (existing) {
            let updatedKb = await getBingo1to100Keyboard();
            await ctx.editMessageText(`⚠️ ይህ ቁጥር አሁን በሌላ ተጫዋች ተይዟል!`, updatedKb);
            return ctx.answerCbQuery(`❌ ቁጥሩ ተይዟል!`, { show_alert: true });
        }

        await TakenNumber.create({ number: num, userId, userName });

        let user = await getOrCreateUser(userId);
        let cost = 10; 

        if (userId !== ADMIN_ID && user.balance < cost) {
            await TakenNumber.findOneAndDelete({ number: num });
            return ctx.answerCbQuery('❌ በቂ ባላንስ የለዎትም!', { show_alert: true });
        }

        if (userId !== ADMIN_ID) {
            user.balance -= cost;
            user.totalGames += 1;
            await user.save();
        }

        let matrix = generateRandomBingoCard();
        if (!waitingRoom[cost]) waitingRoom[cost] = [];
        waitingRoom[cost].push({ userId, ctx, matrix, cost });

        await ctx.editMessageText(
            `⏳ **ቁጥር ${num} ተመርጧል! ተጫዋቾችን በመጠበቅ ላይ (30 ሰከንድ)...**`,
            Markup.inlineKeyboard([])
        );

        runBingoQueue(cost);

    } catch (e) {
        return ctx.answerCbQuery(`❌ ስህተት ተፈጥሯል!`, { show_alert: true });
    }
});

function runBingoQueue(cost) {
    setTimeout(async () => {
        let room = waitingRoom[cost];
        if (!room) return;

        if (room.length < 2) {
            for (let p of room) {
                if (p.userId !== ADMIN_ID) {
                    let pUser = await getOrCreateUser(p.userId);
                    pUser.balance += p.cost; 
                    pUser.totalGames -= 1;
                    await pUser.save();
                }
                try {
                    await p.ctx.editMessageText(`⚠️ **በቂ ተጫዋች ባለመገኘቱ ጨዋታው ተሰርዟል! ገንዘብዎ ተመልሷል።**`);
                } catch (e) {}
            }
            delete waitingRoom[cost];
            return;
        }

        delete waitingRoom[cost];

        let gameId = 'game_' + Date.now() + '_' + cost;
        let drawnHistory = [];
        let roomPlayers = room.map(p => p.userId);
        let totalPool = cost * roomPlayers.length;
        let adminCommission = totalPool * 0.10;
        let winnerReward = Math.round(totalPool - adminCommission);
        let availableNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
        
        let firstDrawn = availableNumbers.splice(Math.floor(Math.random() * availableNumbers.length), 1)[0];
        drawnHistory.push(firstDrawn);

        for (let p of room) {
            activeGames[p.userId] = { 
                gameId, matrix: p.matrix, cost: p.cost, 
                drawnNumber: firstDrawn, drawnHistory: [...drawnHistory],
                availableNumbers: [...availableNumbers], gameActive: true,
                roomPlayers, winnerReward, totalPool
            };

            try {
                await p.ctx.editMessageText(
                    `🎲 **የቢንጎ ጨዋታ ተጀምሯል! (ETB ${p.cost})**\n` +
                    `💰 አጠቃላይ ፖል: **ETB ${totalPool}** (ሽልማት: ${winnerReward})\n` +
                    `📜 **ታሪክ:** [ ${drawnHistory.join(', ')} ]\n` +
                    `🟢 **አሁንቁጥር: [ ${firstDrawn} ]**`,
                    getBingoKeyboard(p.matrix)
                );
            } catch (e) {}

            let interval = setInterval(async () => {
                let currentGame = activeGames[p.userId];
                if (!currentGame || !currentGame.gameActive || currentGame.gameId !== gameId || currentGame.availableNumbers.length === 0) {
                    clearInterval(interval);
                    return;
                }
                let newNum = currentGame.availableNumbers.splice(Math.floor(Math.random() * currentGame.availableNumbers.length), 1)[0];
                currentGame.drawnNumber = newNum;
                currentGame.drawnHistory.push(newNum);

                try {
                    await p.ctx.editMessageText(
                        `🎲 **ጨዋታ በሂደት ላይ... (ETB ${p.cost})**\n` +
                        `📜 **ታሪክ:** [ ${currentGame.drawnHistory.join(', ')} ]\n` +
                        `🟢 **አሁንቁጥር: [ ${newNum} ]**`,
                        getBingoKeyboard(currentGame.matrix)
                    );
                } catch (e) {}
            }, 6000);
        }
    }, 30000);
}

bot.action('select_keno', (ctx) => {
    ctx.editMessageText(
        `🎲 **የኬኖ ጨዋታ - የውርርድ መጠን ይምረጡ:**\n\nእባክዎ መጫወት የሚፈልጉትን የብር መጠን ይምረጡ:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('10 ETB', 'keno_bet_10'), Markup.button.callback('20 ETB', 'keno_bet_20')],
            [Markup.button.callback('50 ETB', 'keno_bet_50'), Markup.button.callback('100 ETB', 'keno_bet_100')],
            [Markup.button.callback('🔙 ወደ ዋናው ሜኑ', 'back_to_main_menu')]
        ])
    );
});

bot.action(/keno_bet_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    const betAmount = parseInt(ctx.match[1]);
    let user = await getOrCreateUser(userId);

    if (userId !== ADMIN_ID && user.balance < betAmount) {
        return ctx.answerCbQuery(`❌ በቂ ባላንስ የለዎትም!`, { show_alert: true });
    }

    kenoSessions[userId] = { selectedNumbers: [], betAmount: betAmount };

    let textMsg = getKenoStatusText([], betAmount, user.balance);
    ctx.editMessageText(textMsg, getKenoKeyboard([], betAmount));
});

// የሽልማት ሰንጠረዥ (Payout Table) ማሳያ
bot.action('view_payout_table', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply(
        `📊 **የኬኖ ጨዋታ ኦፊሴላዊ የሽልማት ሰንጠረዥ (Payout Table)**\n\n` +
        `• **1 ቁጥር መርጦ:** 0.2x\n` +
        `• **2 ቁጥር መርጦ:** 0.3x\n` +
        `• **3 ቁጥር መርጦ:** 0.5x\n` +
        `• **4 ቁጥር መርጦ:** 0.8x\n` +
        `• **5 ቁጥር መርጦ:** 1.2x\n` +
        `• **6 ቁጥር መርጦ:** 2.0x\n` +
        `• **7 ቁጥር መርጦ:** 3.5x\n` +
        `• **8 ቁጥር መርጦ:** 6.0x\n` +
        `• **9 ቁጥር መርጦ:** 10.0x\n` +
        `• **10 ቁጥር መርጦ:** 20.0x`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 ወደ ኬኖ መጫወቻ ተመለስ', 'back_to_keno')]])
    );
});

bot.action('back_to_keno', async (ctx) => {
    const userId = ctx.from.id;
    let session = kenoSessions[userId] || { selectedNumbers: [], betAmount: 10 };
    let user = await getOrCreateUser(userId);

    let textMsg = getKenoStatusText(session.selectedNumbers, session.betAmount, user.balance);
    ctx.editMessageText(textMsg, getKenoKeyboard(session.selectedNumbers, session.betAmount));
});

bot.action(/keno_num_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    const num = parseInt(ctx.match[1]);
    if (!kenoSessions[userId]) kenoSessions[userId] = { selectedNumbers: [], betAmount: 10 };

    let session = kenoSessions[userId];
    let index = session.selectedNumbers.indexOf(num);

    if (index > -1) {
        session.selectedNumbers.splice(index, 1);
    } else {
        if (session.selectedNumbers.length >= 10) {
            return ctx.answerCbQuery('⚠️ ቢበዛ 10 ቁጥሮች ብቻ መምረጥ ይችላሉ!', { show_alert: true });
        }
        session.selectedNumbers.push(num);
    }

    let user = await getOrCreateUser(userId);
    let textMsg = getKenoStatusText(session.selectedNumbers, session.betAmount, user.balance);

    ctx.editMessageText(textMsg, getKenoKeyboard(session.selectedNumbers, session.betAmount)).catch(()=>{});
});

bot.action('start_keno_draw', async (ctx) => {
    const userId = ctx.from.id;
    let session = kenoSessions[userId];
    if (!session || session.selectedNumbers.length === 0) {
        return ctx.answerCbQuery('❌ ቢያንስ አንድ ቁጥር መምረጥ አለብዎት!', { show_alert: true });
    }

    let user = await getOrCreateUser(userId);
    let betAmount = session.betAmount;

    if (userId !== ADMIN_ID && user.balance < betAmount) {
        return ctx.answerCbQuery('❌ በቂ ባላንስ የለዎትም!', { show_alert: true });
    }

    if (userId !== ADMIN_ID) {
        user.balance -= betAmount;
        user.totalGames += 1;
        await user.save();
    }

    await ctx.answerCbQuery('🎲 የኬኖ ጨዋታ ተጀምሯል! ቁጥሮች በየ 3 ሰከንድ ይወጣሉ...');

    let allNums = Array.from({length: 80}, (_, i) => i + 1);
    let drawnNumbers = [];
    while(drawnNumbers.length < 20) {
        let rIdx = Math.floor(Math.random() * allNums.length);
        drawnNumbers.push(allNums.splice(rIdx, 1)[0]);
    }

    let currentDrawnIndex = 0;
    let displayedDrawn = [];

    let drawInterval = setInterval(async () => {
        if (currentDrawnIndex < drawnNumbers.length) {
            displayedDrawn.push(drawnNumbers[currentDrawnIndex]);
            currentDrawnIndex++;

            let matchesCount = session.selectedNumbers.filter(n => displayedDrawn.includes(n)).length;

            try {
                await ctx.editMessageText(
                    `🎲 **የኬኖ ጨዋታ በሂደት ላይ... (የውርርድ መጠን: ${betAmount} ETB)**\n\n` +
                    `🎯 የመረጧቸው: [ **${session.selectedNumbers.sort((a,b)=>a-b).join(', ')}** ]\n` +
                    `🔴 የወጡ ቁጥሮች: [ ${displayedDrawn.join(', ')} ]\n` +
                    `✨ ትክክለኛ ግጥሚያዎች: **${matchesCount}** ቁጥር`,
                    Markup.inlineKeyboard([])
                );
            } catch (e) {}
        } else {
            clearInterval(drawInterval);

            let matches = session.selectedNumbers.filter(n => drawnNumbers.includes(n));
            let matchCount = matches.length;
            let winAmount = 0;
            let selectedCount = session.selectedNumbers.length;

            if (matchCount === selectedCount) {
                let multiplier = 0;
                if (selectedCount === 10) { multiplier = 20; }
                else if (selectedCount === 9) { multiplier = 10; }
                else if (selectedCount === 8) { multiplier = 6; }
                else if (selectedCount === 7) { multiplier = 3.5; }
                else if (selectedCount === 6) { multiplier = 2; }
                else if (selectedCount === 5) { multiplier = 1.2; }
                else if (selectedCount === 4) { multiplier = 0.8; }
                else if (selectedCount === 3) { multiplier = 0.5; }
                else if (selectedCount === 2) { multiplier = 0.3; }
                else if (selectedCount === 1) { multiplier = 0.2; }

                // ጠቅላላ የሚመለሰው ገንዘብ = ያስያዙት ብር + (ያስያዙት ብር * ማባዣ)
                winAmount = Math.round(betAmount + (betAmount * multiplier));
            }

            let resultMsg = "";
            let keyboardOptions = [];

            if (winAmount > 0) {
                if (userId !== ADMIN_ID) {
                    user.balance += winAmount;
                    user.wins += 1;
                    user.level += 1;
                    await user.save();
                }

                resultMsg = `🎉 **እንኳን ደስ አሎት! አሸንፈዋል!** 🏆\n\n` +
                    `🎯 የመረጧቸው: [ ${session.selectedNumbers.sort((a,b)=>a-b).join(', ')} ]\n` +
                    `✨ ግጥሚያዎች: **${matchCount}/${selectedCount}** ሙሉውን ጠርተዋል!\n` +
                    `💰 ያሸነፉት ጠቅላላ ገንዘብ: **ETB ${winAmount}**\n\n` +
                    `💼 ባላንስዎ: **ETB ${user.balance}**`;

                keyboardOptions = [
                    [Markup.button.callback('🎮 እንደገና ጫወት (Play Again)', 'select_keno')],
                    [Markup.button.callback('🔙 ወደ ዋናው ሜኑ', 'back_to_main_menu')]
                ];
            } else {
                if (userId !== ADMIN_ID) {
                    user.losses += 1;
                    await user.save();
                }

                resultMsg = `❌ **አሳዛኝ ሁኔታ! ተሸንፈዋል!**\n\n` +
                    `🎯 የመረጧቸው: [ ${session.selectedNumbers.sort((a,b)=>a-b).join(', ')} ]\n` +
                    `✨ የገጠሙት: **${matchCount}** ከ ${selectedCount}\n\n` +
                    `💼 የቀረ ባላንስ: **ETB ${user.balance}**`;

                keyboardOptions = [
                    [Markup.button.callback('🔄 እንደአዲስ ጫወት (Try Again)', 'select_keno')],
                    [Markup.button.callback('🔙 ወደ ዋናው ሜኑ', 'back_to_main_menu')]
                ];
            }

            delete kenoSessions[userId];
            await ctx.editMessageText(resultMsg, Markup.inlineKeyboard(keyboardOptions));
        }
    }, 3000);
});

bot.action('back_to_main_menu', (ctx) => {
    ctx.editMessageText(`🎲 **እፉዬ ጨዋታዎች ማዕከል**\n\nእባክዎ የሚፈልጉትን ጨዋታ ይምረጡ፦`, Markup.inlineKeyboard([
        [Markup.button.callback('🎯 ቢንጎ ጨዋታ (Bingo)', 'select_bingo_main')],
        [Markup.button.callback('🎲 ኬኖ ጨዋታ (Keno)', 'select_keno')]
    ]));
});

bot.hears('💰 ዲፖዚት (Deposit)', async (ctx) => {
    const userId = ctx.from.id;
    let user = await getOrCreateUser(userId);
    
    if (!user.phone) {
        return ctx.reply(
            `⚠️ ዲፖዚት ከማድረግዎ በፊት ስልክ ቁጥርዎ ማጋራት አለብዎት።`,
            Markup.keyboard([[Markup.button.contactRequest('📱 ስልክ ቁጥር አጋራ (Share Contact)')]]).resize()
        );
    }

    userSteps[userId] = { action: 'deposit_amount' };
    ctx.reply(`${ADMIN_PAYMENT_INFO}\n💰 እባክዎ **ሊያስገቡት (ዲፖዚት ላደረጉት) የሚፈልጉትን የብር መጠን** ቁጥር ብቻ ይጻፉ:`);
});

bot.hears('💳 ዊዝድሮ (Withdraw)', async (ctx) => {
    const userId = ctx.from.id;
    let user = await getOrCreateUser(userId);
    if (!user.phone) {
        return ctx.reply(
            `⚠️ የዊዝድሮ ጥያቄ ከማቅረብዎ በፊት ስልክ ቁጥርዎ መመዝገብ አለበት።`,
            Markup.keyboard([[Markup.button.contactRequest('📱 ስልክ ቁጥር አጋራ (Share Contact)')]]).resize()
        );
    }
    userSteps[userId] = { action: 'withdraw_amount' };
    ctx.reply(`💳 **የገንዘብ ማውጣት ጥያቄ**\n\nመቀበያ ስልክ ቁጥርዎ: **${user.phone}**\n\n💰 ማውጣት የሚፈልጉትን **የብር መጠን** ብቻ ቁጥር አድርገው ይጻፉ:`);
});

bot.hears('👤 ፕሮፋይል (Profile)', async (ctx) => {
    const userId = ctx.from.id;
    let user = await getOrCreateUser(userId);
    ctx.reply(
        `👤 **የተጫዋች ፕሮፋይል**\n\n` +
        `🏷 ስም: ${user.userName}\n` +
        `📱 ስልክ: ${user.phone || 'አልተመዘገበም'}\n` +
        `⭐ ሌቭል: ${user.level}\n` +
        `💰 አካውንት ባላንስ: **ETB ${user.balance}**\n` +
        `🎮 አጠቃላይ የተጫወቷቸው: ${user.totalGames}\n` +
        `🏆 ያሸነፉዋቸው: ${user.wins}\n` +
        `❌ የተሸነፉዋቸው: ${user.losses}`
    );
});

bot.hears('💬 ኮሜንት (Comment)', (ctx) => {
    const userId = ctx.from.id;
    userSteps[userId] = { action: 'comment_waiting' };
    ctx.reply(`💬 ለአድሚን ማስተላለፍ የሚፈልጉትን **አስተያየት፣ ጥያቄ ወይም ስክሪንሾት ፎቶ** ይላኩ፦`);
});

bot.hears('📖 መመሪያ (Instructions)', (ctx) => {
    ctx.reply(
        `📖 **የጨዋታዎች አጨዋወት መመሪያ**\n\n` +
        `1. ዲፖዚት በመጫን ገንዘብ ገቢ በማድረግ ስክሪንሾት ፎቶ ይላኩ።\n` +
        `2. ፕለይ በመጫን **ቢንጎ** ወይም **ኬኖ** መጫወት ይችላሉ።`
    );
});

bot.hears('📊 የአድሚን ባላንስ ማየት', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let users = await User.find();
    let totalCompanyBalance = users.reduce((sum, u) => sum + u.balance, 0);
    ctx.reply(`📊 **የአድሚን ባላንስ እና ስታቲስቲክስ**\n\n👥 አጠቃላይ ተጫዋቾች: ${users.length} ሰው\n💰 የተጫዋቾች አጠቃላይ ባላንስ: ETB ${totalCompanyBalance}`, adminKeyboard);
});

bot.hears('👥 የተጫዋቾች ዝርዝር (Player List)', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let users = await User.find().sort({ _id: -1 }).limit(20);
    if (users.length === 0) return ctx.reply('📭 እስካሁን የተመዘገበ ተጫዋች የለም።', adminKeyboard);
    ctx.reply(`👥 **የተጫዋቾች ዝርዝር:**`, adminKeyboard);
    for (let [index, u] of users.entries()) {
        let playerInfo = `👤 **${index + 1}. ስም:** ${u.userName}\n🆔 **ID:** \`${u.userId}\`\n📱 **ስልክ:** ${u.phone || 'N/A'}\n💰 **ባላንስ:** ETB ${u.balance}`;
        let removeButton = Markup.inlineKeyboard([[Markup.button.callback('❌ ከቦቱ አስወጣ', `ban_user_${u.userId}`)]]);
        await ctx.reply(playerInfo, { parse_mode: 'Markdown', ...removeButton });
    }
});

bot.hears('📥 የዲፖዚት/ዊዝድሮ ጥያቄዎች', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let reqs = await RequestModel.find();
    if (reqs.length === 0) return ctx.reply('📭 ምንም የሚጠብቅ ጥያቄ የለም።', adminKeyboard);
    for (let r of reqs) {
        let msg = `📌 **አይነት:** ${r.type.toUpperCase()}\n👤 **ስም:** ${r.userName} (ID: \`${r.userId}\`)\n💰 **መጠን:** ETB ${r.amount}\n📱 **አካውንት:** \`${r.details}\``;
        let keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ አጽድቅ', `approve_req_${r._id}`), Markup.button.callback('❌ ውድቅ አድርግ', `reject_req_${r._id}`)]
        ]);
        if (r.photoId) {
            await ctx.replyWithPhoto(r.photoId, { caption: msg, parse_mode: 'Markdown', ...keyboard });
        } else {
            await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
        }
    }
});

bot.hears('💬 የተጫዋቾች ኮሜንቶች', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let comments = await CommentModel.find().sort({ date: -1 }).limit(15);
    if (comments.length === 0) return ctx.reply('📭 ምንም አስተያየት የለም።', adminKeyboard);
    
    for (let c of comments) {
        let replyStatus = c.adminReply ? `\n✅ **ምላሽ:** ${c.adminReply}` : `\n❌ ምላሽ አልተሰጠበትም`;
        let msg = `📌 **ከ:** ${c.userName} (ID: \`${c.userId}\`)\n💬 **መልእክት:** "${c.message}"${replyStatus}`;
        let replyBtn = Markup.inlineKeyboard([[Markup.button.callback('✍️ ምላሽ ስጥ', `reply_comment_${c._id}`)]]);
        
        if (c.photoId) {
            await ctx.replyWithPhoto(c.photoId, { caption: msg, parse_mode: 'Markdown', ...replyBtn });
        } else {
            await ctx.reply(msg, { parse_mode: 'Markdown', ...replyBtn });
        }
    }
});

bot.hears('💵 አድሚን ዲፖዚት ማድረግ', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    userSteps[ADMIN_ID] = { action: 'admin_deposit_id' };
    ctx.reply(`💵 ገንዘብ ገቢ ሊደረግለት የሚገባውን የተጫዋች **User ID** ያስገቡ:`);
});

bot.hears('🎮 አድሚን መጫወቻ (Admin Play)', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply(
        `🎮 **ለአድሚን የመጫወቻ መጠን ይምረጡ:**`,
        Markup.inlineKeyboard([
            [Markup.button.callback('Play 10 ETB', 'play_10'), Markup.button.callback('Play 20 ETB', 'play_20')],
            [Markup.button.callback('Play 50 ETB', 'play_50'), Markup.button.callback('Play 100 ETB', 'play_100')],
            [Markup.button.callback('🎲 ኬኖ ጨዋታ (Keno)', 'select_keno')]
        ])
    );
});

bot.hears('🔙 ወደ ዋናው ሜኑ ተመለስ', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply('👑 ወደ አድሚን ዋና ሜኑ ተመልሰዋል።', adminKeyboard);
});

bot.action(/ban_user_(\d+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let targetUserId = parseInt(ctx.match[1]);
    await User.findOneAndDelete({ userId: targetUserId });
    ctx.editMessageText(`✅ ዩዘር ID \`${targetUserId}\` ያለው ተጫዋች ተወግዷል!`, { parse_mode: 'Markdown' });
});

bot.action(/cell_(\d+)_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    if (!activeGames[userId] || !activeGames[userId].gameActive) {
        return ctx.answerCbQuery('❌ ንቁ ጨዋታ የለዎትም!', { show_alert: true });
    }
    const r = parseInt(ctx.match[1]);
    const c = parseInt(ctx.match[2]);
    let game = activeGames[userId];
    let cell = game.matrix[r][c];

    if (cell.isFree) return ctx.answerCbQuery('⭐ ይህ ነፃ ካርድ ነው!', { show_alert: true });

    if (game.drawnHistory.includes(cell.number)) {
        cell.marked = !cell.marked;
        ctx.editMessageText(
            `🎲 **ጨዋታ በሂደት ላይ...**\n📜 **ታሪክ:** [ ${game.drawnHistory.join(', ')} ]\n🟢 **አሁንቁጥር: [ ${game.drawnNumber} ]**`,
            getBingoKeyboard(game.matrix)
        ).catch(() => {});
    } else {
        return ctx.answerCbQuery(`❌ ይህ ቁጥር ገና አልተጠራም!`, { show_alert: true });
    }
});

bot.action('check_bingo', async (ctx) => {
    const userId = ctx.from.id;
    if (!activeGames[userId] || !activeGames[userId].gameActive) {
        return ctx.answerCbQuery('❌ ንቁ ጨዋታ የለም!', { show_alert: true });
    }
    let game = activeGames[userId];
    if (checkWinCondition(game.matrix)) {
        let winnerUser = await getOrCreateUser(userId);
        winnerUser.balance += game.winnerReward;
        winnerUser.wins += 1;
        winnerUser.level += 1; 
        await winnerUser.save();

        for (let pId of game.roomPlayers) {
            if (activeGames[pId]) {
                activeGames[pId].gameActive = false;
                delete activeGames[pId];
            }
            let msg = (pId === userId) ? `🎉 **እንኳን ደስ አሎት! BINGO ብለዋል!**\n💰 ሽልማት: **ETB ${game.winnerReward}**` : `🏁 ጨዋታው አልቋል! ሌላ ተጫዋች አሸንፏል።`;
            bot.telegram.sendMessage(pId, msg).catch(()=>{});
        }
        ctx.answerCbQuery('🏆 እንኳን ደስ አሎት!');
    } else {
        return ctx.answerCbQuery('❌ ገና BINGO አልሞሉም!', { show_alert: true });
    }
});

bot.action(/approve_req_(.+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let reqId = ctx.match[1];
    let req = await RequestModel.findById(reqId);
    if (!req) return ctx.answerCbQuery('❌ ጥያቄው አልተገኘም!');

    let user = await getOrCreateUser(req.userId);
    if (req.type === 'deposit') {
        user.balance += req.amount;
        await user.save();
        bot.telegram.sendMessage(req.userId, `🎉 የ ${req.amount} ETB የዲፖዚት ጥያቄዎ ጸድቋል! 💰`).catch(()=>{});
    }

    await RequestModel.findByIdAndDelete(reqId);
    ctx.editMessageText(`✅ ጥያቄው ጸድቋል!`);
});

bot.action(/reject_req_(.+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let reqId = ctx.match[1];
    let req = await RequestModel.findById(reqId);
    if (!req) return ctx.answerCbQuery('❌ ጥያቄው አልተገኘም!');

    if (req.type === 'withdraw') {
        let user = await getOrCreateUser(req.userId);
        user.balance += req.amount; 
        await user.save();
    }

    bot.telegram.sendMessage(req.userId, `❌ የ ${req.type.toUpperCase()} ጥያቄዎ ውድቅ ተደርጓል።`).catch(()=>{});
    await RequestModel.findByIdAndDelete(reqId);
    ctx.editMessageText(`❌ ጥያቄው ውድቅ ተደርጓል!`);
});

bot.action(/reply_comment_(.+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let commentId = ctx.match[1];
    userSteps[ADMIN_ID] = { action: 'admin_reply_comment', commentId };
    ctx.answerCbQuery();
    ctx.reply(`✍️ ለዚህ ኮሜንት የሚሰጡትን ምላሽ ይላኩ፦`);
});

bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'ተጫዋች';
    let photo = ctx.message.photo[ctx.message.photo.length - 1];
    let photoId = photo.file_id;
    let photoUniqueId = photo.file_unique_id;

    if (userId === ADMIN_ID && userSteps[ADMIN_ID] && userSteps[ADMIN_ID].action === 'admin_reply_comment') {
        let commentId = userSteps[ADMIN_ID].commentId;
        let replyText = ctx.message.caption || 'ምላሽ';
        delete userSteps[ADMIN_ID];

        let comment = await CommentModel.findById(commentId);
        if (!comment) return ctx.reply('❌ ኮሜንቱ አልተገኘም!');

        comment.adminReply = replyText;
        comment.adminPhotoId = photoId;
        await comment.save();

        await bot.telegram.sendPhoto(comment.userId, photoId, {
            caption: `📥 **ከአድሚን የተሰጠ ምላሽ:**\n\n${replyText}`,
            parse_mode: 'Markdown'
        }).catch(()=>{});

        return ctx.reply(`✅ የምላሽ ፎቶ ተልኳል!`);
    }

    if (userSteps[userId] && userSteps[userId].action === 'comment_waiting') {
        let messageText = ctx.message.caption || 'ፎቶ';
        delete userSteps[userId];

        let newComment = new CommentModel({ userId, userName, message: messageText, photoId });
        await newComment.save();

        ctx.reply(`✅ ፎቶዎ ለአድሚን ተልኳል!`, mainKeyboard);
        let adminMsg = `📌 **አዲስ የኮሜንት ፎቶ መጣ!**\n\n👤 **ከ:** ${userName} (ID: \`${userId}\`)`;
        let replyBtn = Markup.inlineKeyboard([[Markup.button.callback('✍️ ምላሽ ስጥ', `reply_comment_${newComment._id}`)]]);
        return bot.telegram.sendPhoto(ADMIN_ID, photoId, { caption: adminMsg, parse_mode: 'Markdown', ...replyBtn }).catch(()=>{});
    }

    if (userSteps[userId] && userSteps[userId].action === 'deposit_screenshot') {
        let amount = userSteps[userId].amount;
        let uploadDate = new Date();

        let existingRequest = await RequestModel.findOne({ photoUniqueId });
        if (existingRequest) {
            delete userSteps[userId];
            return ctx.reply(`❌ ይህ ስክሪንሾት ከዚህ በፊት ጥቅም ላይ ውሏል!`);
        }

        delete userSteps[userId];
        let newReq = new RequestModel({
            userId, userName, type: 'deposit', amount,
            details: 'Telegram Screenshot Deposit',
            photoUniqueId, photoId, date: uploadDate
        });
        await newReq.save();

        ctx.reply(`⏳ የዲፖዚት ጥያቄዎ ደርሷል! እባክዎ ይጠብቁ።`);

        let adminMsg = `📥 **አዲስ የዲፖዚት ጥያቄ!**\n\n👤 **ስም:** ${userName} (ID: \`${userId}\`)\n💰 **መጠን:** ETB ${amount}`;
        let adminKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ አጽድቅ', `approve_req_${newReq._id}`), Markup.button.callback('❌ ውድቅ አድርግ', `reject_req_${newReq._id}`)]
        ]);

        bot.telegram.sendPhoto(ADMIN_ID, photoId, { caption: adminMsg, parse_mode: 'Markdown', ...adminKeyboard }).catch(()=>{});
    }
});

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    
    if (userId === ADMIN_ID && userSteps[ADMIN_ID]) {
        let step = userSteps[ADMIN_ID];
        if (step.action === 'admin_deposit_id') {
            userSteps[ADMIN_ID] = { action: 'admin_deposit_amount', targetId: parseInt(text) };
            return ctx.reply(`💵 የብር መጠን ያስገቡ:`);
        } else if (step.action === 'admin_deposit_amount') {
            let targetUser = await getOrCreateUser(step.targetId);
            targetUser.balance += parseInt(text);
            await targetUser.save();
            delete userSteps[ADMIN_ID];
            ctx.reply(`✅ ዲፖዚቱ ተሳክቷል!`);
            return bot.telegram.sendMessage(step.targetId, `🎉 አድሚን አካውንትዎን ሞልቶታል። 💰`).catch(()=>{});
        } else if (step.action === 'admin_reply_comment') {
            let commentId = step.commentId;
            delete userSteps[ADMIN_ID];

            let comment = await CommentModel.findById(commentId);
            if (!comment) return ctx.reply('❌ ኮሜንቱ አልተገኘም!');

            comment.adminReply = text;
            await comment.save();

            await bot.telegram.sendMessage(comment.userId, `📥 **ከአድሚን የተሰጠ ምላሽ:**\n\n${text}`).catch(()=>{});
            return ctx.reply(`✅ መልእክቱ ተልኳል!`);
        }
    }

    if (userSteps[userId]) {
        let stepInfo = userSteps[userId];
        
        if (stepInfo.action === 'deposit_amount') {
            const amount = parseInt(text.match(/\d+/)?.[0] || 0);
            if (amount <= 0) return ctx.reply(`❌ ትክክለኛ የብር መጠን ያስገቡ።`);
            
            userSteps[userId] = { action: 'deposit_screenshot', amount };
            return ctx.reply(`📸 እባክዎ **የክፍያ ስክሪንሾት (Screenshot)** ፎቶ ይላኩልን:`);
        }

        if (stepInfo.action === 'withdraw_amount') {
            const amount = parseInt(text.match(/\d+/)?.[0] || 0);
            delete userSteps[userId];
            let user = await getOrCreateUser(userId);
            if (user.balance < amount) return ctx.reply(`❌ በቂ ባላንስ የለዎትም!`);
            user.balance -= amount;
            await user.save();
            let newReq = new RequestModel({ userId, userName: user.userName, type: 'withdraw', amount, details: user.phone });
            await newReq.save();
            ctx.reply(`⏳ የዊዝድሮ ጥያቄዎ ለአድሚን ተልኳል!`);
            return;
        }

        if (userSteps[userId]?.action === 'comment_waiting') {
            delete userSteps[userId];
            let newComment = new CommentModel({ userId, userName: ctx.from.first_name, message: text });
            await newComment.save();
            
            ctx.reply(`✅ አስተያየትዎ ለአድሚን ተልኳል!`, mainKeyboard);
            
            let adminMsg = `📌 **አዲስ ኮሜንት!**\n\n👤 **ከ:** ${ctx.from.first_name} (ID: \`${userId}\`)\n💬 "${text}"`;
            let replyBtn = Markup.inlineKeyboard([[Markup.button.callback('✍️ ምላሽ ስጥ', `reply_comment_${newComment._id}`)]]);
            return bot.telegram.sendMessage(ADMIN_ID, adminMsg, { parse_mode: 'Markdown', ...replyBtn }).catch(()=>{});
        }
    }
});

bot.launch();
console.log('🤖 Bot is running with Correct Total Payout Formula (Bet + Bet*Multiplier)!');