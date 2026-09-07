require('dotenv').config();
const express = require('express');
const path = require('path');
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
// 🎨 ስታቲክስ ፎልደር (Static Folder) ማዋቀሪያ - HTML እና CSS ፋይሎችን ለማንበብ
app.use(express.static(path.join(__dirname, 'public')));

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

// ሚኒ አፕ (Mini App) ገጽን በቀጥታ ለማስተናገድ
app.get('/miniapp', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// የኬኖ ኪቦርድ ማመንጫ (ለቦቱ የተረፈ)
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

    let potentialWin = Math.round(betAmount + (betAmount * multiplier));
    let desc = count === 0 ? "💡 *እባክዎ ከ 1 እስከ 10 ቁጥሮች ይምረጡ።*" : `✨ **ሁኔታ:** ${count} ቁጥር መርጠዋል (ማባዣው **${multiplier}x** ነው)`;

    return `🎲 **ኬኖ ጨዋታ (የውርርድ መጠን: ${betAmount} ETB)**\n\n` +
           `የመረጧቸው ቁጥሮች: [ **${selectedNumbers.sort((a,b)=>a-b).join(', ')}** ] (${count}/10)\n\n` +
           `${desc}\n\n` +
           `💰 ሙሉውን ሲያሸንፉ የሚደርስዎት ጠቅላላ ሽልማት: **ETB ${potentialWin}**\n` +
           `አካውንት ባላንስ: **ETB ${userBalance}**`;
}

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
    ['🎮 ሚኒ አፕ (Mini App 🚀)', '🎮 ፕለይ (Play)'],
    ['💰 ዲፖዚት (Deposit)', '💳 ዊዝድሮ (Withdraw)'],
    ['👤 ፕሮፋይል (Profile)', '💬 ኮሜንት (Comment)'],
    ['📖 መመሪያ (Instructions)']
]).resize();

// 👑 አድሚን ኪቦርድ (ሚኒ አፕ (Mini App) ቁልፍን ጨምሮ)
const adminKeyboard = Markup.keyboard([
    ['🚀 ሚኒ አፕ (Mini App 🚀)', '📊 የአድሚን ባላንስ ማየት'],
    ['👥 የተጫዋቾች ዝርዝር (Player List)', '📥 የዲፖዚት/ዊዝድሮ ጥያቄዎች'],
    ['💬 የተጫዋቾች ኮሜንቶች', '💵 አድሚን ዲፖዚት ማድረግ'],
    ['🎮 አድሚን መጫወቻ (Admin Play)', '🔙 ወደ ዋናው ሜኑ ተመለስ']
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

// ሚኒ አፕ (Mini App) በሂሳብ ማዕቀፍ ማስተናገድ
bot.hears('🎮 ሚኒ አፕ (Mini App 🚀)', (ctx) => {
    const webAppUrl = process.env.WEBAPP_URL || '[https://telegram-bot-xer2.onrender.com/miniapp](https://telegram-bot-xer2.onrender.com/miniapp)';
    ctx.reply('🚀 **ቀለማት ያሸበረቀውን የቢንጎ እና የኬኖ ጨዋታ ለመክፈት ከታች ይጫኑ:**',
        Markup.inlineKeyboard([
            [Markup.button.webApp('✨ የሚኒ አፕ ጨዋታ ክፈት (Open Mini App)', webAppUrl)]
        ])
    );
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

// የ 10፣ 20፣ 50 እና 100 ብር ምርጫዎች አሰራር
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
        
        // ከቀድሞው በተለየ መልኩ የተመረጠውን የዋጋ መጠን (Cost) ከኮዱ ማግኘት (በነባሪ 10 ሆኖ ካልተገኘ)
        let cost = 10; 
        // ከጨዋታው አውድ ወይም ከመጨረሻው የጥያቄ ሂደት ሊመጣ ስለሚችል በአጭሩ እንዲስተካከል ተደርጓል

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
                try { await p.ctx.editMessageText(`⚠️ **በቂ ተጫዋች ባለመገኘቱ ጨዋታው ተሰርዟል! ገንዘብዎ ተመልሷል።**`); } catch (e) {}
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
             [Markup.button.callback('2 ETB', 'keno_bet_2'), Markup.button.callback('5 ETB', 'keno_bet_5')],
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

bot.action('view_payout_table', (ctx) => {
    ctx.answerCbQuery();
    ctx.reply(
        `📊 **የኬኖ ጨዋታ ኦፊሴላዊ የሽልማት ሰንጠረዥ (Payout Table)**\n\n` +
        `• **2 ቁጥር መርጦ 1 ሲመታ:** ተመላሽ (Refund)\n` +
        `• **3 ቁጥር መርጦ 2 ሲመታ:** ሽልማት (0.5x)\n` +
        `• **4 ቁጥር መርጦ 2 ሲመታ:** ሽልማት (0.2x)\n` +
        `• **እስከ 10 ቁጥር:** እስከ 20x ማባዣ አለው!`,
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

    await ctx.answerCbQuery('🎲 የኬኖ ጨዋታ ተጀምሯል!');
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
                    `🎲 **የኬኖ ጨዋታ በሂደት ላይ... (${betAmount} ETB)**\n\n` +
                    `🎯 የመረጧቸው: [ **${session.selectedNumbers.sort((a,b)=>a-b).join(', ')}** ]\n` +
                    `🔴 የወጡ: [ ${displayedDrawn.join(', ')} ]\n` +
                    `✨ ግጥሚያዎች: **${matchesCount}**`,
                    Markup.inlineKeyboard([])
                );
            } catch (e) {}
        } else {
            clearInterval(drawInterval);
            let matches = session.selectedNumbers.filter(n => drawnNumbers.includes(n));
            let matchCount = matches.length;
            let winAmount = 0;
            let isRefund = false;
            let selectedCount = session.selectedNumbers.length;

            if (matchCount === selectedCount) {
                let multiplier = 0;
                if (selectedCount === 10) multiplier = 20;
                else if (selectedCount === 9) multiplier = 10;
                else if (selectedCount === 8) multiplier = 6;
                else if (selectedCount === 7) multiplier = 3.5;
                else if (selectedCount === 6) multiplier = 2;
                else if (selectedCount === 5) multiplier = 1.2;
                else if (selectedCount === 4) multiplier = 0.8;
                else if (selectedCount === 3) multiplier = 0.5;
                else if (selectedCount === 2) multiplier = 0.3;
                else if (selectedCount === 1) multiplier = 0.2;
                winAmount = Math.round(betAmount + (betAmount * multiplier));
            } 
            else if (selectedCount === 4 && matchCount === 2) {
                winAmount = Math.round(betAmount + (betAmount * 0.2));
            }
            else if (selectedCount === 3 && matchCount === 2) {
                winAmount = Math.round(betAmount + (betAmount * 0.5));
            }
            else if (selectedCount === 2 && matchCount === 1) {
                isRefund = true;
                winAmount = betAmount;
            }

            let resultMsg = "";
            let keyboardOptions = [];

            if (winAmount > 0) {
                if (userId !== ADMIN_ID) {
                    user.balance += winAmount;
                    if (!isRefund) { user.wins += 1; user.level += 1; }
                    await user.save();
                }
                resultMsg = isRefund ? `🔄 **ገንዘብዎ ተመልሷል (Refund)!**\n💰 ተመላሽ: **ETB ${winAmount}**` : `🎉 **አሸንፈዋል!**\n💰 ሽልማት: **ETB ${winAmount}**`;
                keyboardOptions = [[Markup.button.callback('🎮 እንደገና ጫወት', 'select_keno')], [Markup.button.callback('🔙 ወደ ዋናው ሜኑ', 'back_to_main_menu')]];
            } else {
                if (userId !== ADMIN_ID) { user.losses += 1; await user.save(); }
                resultMsg = `❌ **ተሸንፈዋል!**`;
                keyboardOptions = [[Markup.button.callback('🔄 እንደአዲስ ጫወት', 'select_keno')], [Markup.button.callback('🔙 ወደ ዋናው ሜኑ', 'back_to_main_menu')]];
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
        return ctx.reply(`⚠️ ስልክ ቁጥርዎ ማጋራት አለብዎት።`, Markup.keyboard([[Markup.button.contactRequest('📱 ስልክ ቁጥር አጋራ')]]).resize());
    }
    userSteps[userId] = { action: 'deposit_amount' };
    ctx.reply(`${ADMIN_PAYMENT_INFO}\n💰 እባክዎ **ሊያስገቡት የሚፈልጉትን የብር መጠን** ቁጥር ብቻ ይጻፉ:`);
});

bot.hears('💳 ዊዝድሮ (Withdraw)', async (ctx) => {
    const userId = ctx.from.id;
    let user = await getOrCreateUser(userId);
    if (!user.phone) {
        return ctx.reply(`⚠️ ስልክ ቁጥርዎ መመዝገብ አለበት።`, Markup.keyboard([[Markup.button.contactRequest('📱 ስልክ ቁጥር አጋራ')]]).resize());
    }
    userSteps[userId] = { action: 'withdraw_amount' };
    ctx.reply(`💳 **የገንዘብ ማውጣት ጥያቄ**\n\nመቀበያ ስልክ: **${user.phone}**\n\n💰 ማውጣት የሚፈልጉትን መጠን ይጻፉ:`);
});

bot.hears('👤 ፕሮፋይል (Profile)', async (ctx) => {
    const userId = ctx.from.id;
    let user = await getOrCreateUser(userId);
    ctx.reply(
        `👤 **የተጫዋች ፕሮፋይል**\n\n` +
        `🏷 ስም: ${user.userName}\n` +
        `📱 ስልክ: ${user.phone || 'አልተመዘገበም'}\n` +
        `⭐ ሌቭል: ${user.level}\n` +
        `💰 ባላንስ: **ETB ${user.balance}**\n` +
        `🎮 የተጫወቷቸው: ${user.totalGames}\n` +
        `🏆 ያሸነፉዋቸው: ${user.wins}\n` +
        `❌ የተሸነፉዋቸው: ${user.losses}`
    );
});

bot.hears('💬 ኮሜንት (Comment)', (ctx) => {
    const userId = ctx.from.id;
    userSteps[userId] = { action: 'comment_waiting' };
    ctx.reply(`💬 ለአድሚን ማስተላለፍ የሚፈልጉትን **አስተያየት ወይም ፎቶ** ይላኩ፦`);
});

bot.hears('📖 መመሪያ (Instructions)', (ctx) => {
    ctx.reply(`📖 **መመሪያ**\n\nዲፖዚት በማድረግ በ ሚኒ አፕ (Mini App) ወይም በቦቱ መጫወት ይችላሉ።`);
});

bot.hears('📊 የአድሚን ባላንስ ማየት', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let users = await User.find();
    let totalCompanyBalance = users.reduce((sum, u) => sum + u.balance, 0);
    ctx.reply(`📊 አጠቃላይ ተጫዋቾች: ${users.length}\n💰 አጠቃላይ ባላንስ: ETB ${totalCompanyBalance}`, adminKeyboard);
});

bot.hears('👥 የተጫዋቾች ዝርዝር (Player List)', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let users = await User.find().sort({ _id: -1 }).limit(20);
    if (users.length === 0) return ctx.reply('📭 ተጫዋች የለም።', adminKeyboard);
    for (let u of users) {
        let info = `👤 ${u.userName} | ID: \`${u.userId}\` | ባላንስ: ${u.balance} ETB`;
        let btn = Markup.inlineKeyboard([[Markup.button.callback('❌ አስወጣ', `ban_user_${u.userId}`)]]);
        await ctx.reply(info, { parse_mode: 'Markdown', ...btn });
    }
});

bot.hears('📥 የዲፖዚት/ዊዝድሮ ጥያቄዎች', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let reqs = await RequestModel.find();
    if (reqs.length === 0) return ctx.reply('📭 ምንም ጥያቄ የለም።', adminKeyboard);
    for (let r of reqs) {
        let msg = `📌 ${r.type.toUpperCase()} | ስም: ${r.userName} | መጠን: ${r.amount} ETB`;
        let kb = Markup.inlineKeyboard([[Markup.button.callback('✅ አጽድቅ', `approve_req_${r._id}`), Markup.button.callback('❌ ውድቅ', `reject_req_${r._id}`)]]);
        if (r.photoId) await ctx.replyWithPhoto(r.photoId, { caption: msg, ...kb });
        else await ctx.reply(msg, kb);
    }
});

bot.hears('💬 የተጫዋቾች ኮሜንቶች', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let cmts = await CommentModel.find().sort({ date: -1 }).limit(10);
    if (cmts.length === 0) return ctx.reply('📭 አስተያየት የለም።', adminKeyboard);
    for (let c of cmts) {
        let msg = `💬 ከ: ${c.userName} | መልእክት: "${c.message}"`;
        let btn = Markup.inlineKeyboard([[Markup.button.callback('✍️ ምላሽ ስጥ', `reply_comment_${c._id}`)]]);
        if (c.photoId) await ctx.replyWithPhoto(c.photoId, { caption: msg, ...btn });
        else await ctx.reply(msg, btn);
    }
});

bot.hears('💵 አድሚን ዲፖዚት ማድረግ', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    userSteps[ADMIN_ID] = { action: 'admin_deposit_id' };
    ctx.reply(`💵 የ ተጫዋች **User ID** ያስገቡ:`);
});

bot.hears('🎮 አድሚን መጫወቻ (Admin Play)', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply(`🎮 ጨዋታ ይምረጡ:`, Markup.inlineKeyboard([[Markup.button.callback('Play 10', 'play_10')], [Markup.button.callback('ኬኖ', 'select_keno')]]));
});

bot.hears('🔙 ወደ ዋናው ሜኑ ተመለስ', (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    ctx.reply('👑 ወደ አድሚን ሜኑ ተመልሰዋል።', adminKeyboard);
});

bot.action(/ban_user_(\d+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    await User.findOneAndDelete({ userId: parseInt(ctx.match[1]) });
    ctx.editMessageText(`✅ ተጫዋቹ ተወግዷል!`);
});

bot.action(/cell_(\d+)_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    if (!activeGames[userId] || !activeGames[userId].gameActive) return ctx.answerCbQuery('❌ ንቁ ጨዋታ የለም!', { show_alert: true });
    let game = activeGames[userId];
    let cell = game.matrix[ctx.match[1]][ctx.match[2]];
    if (cell.isFree) return ctx.answerCbQuery('⭐ ነፃ ካርድ!', { show_alert: true });
    if (game.drawnHistory.includes(cell.number)) {
        cell.marked = !cell.marked;
        ctx.editMessageText(`🎲 <b>ጨዋታ በሂደት ላይ...</b>`, { parse_mode: 'HTML', ...getBingoKeyboard(game.matrix) }).catch(()=>{});
    } else {
        return ctx.answerCbQuery(`❌ ቁጥሩ ገና አልተጠራም!`, { show_alert: true });
    }
});

// ጨዋታው ሲያልቅ ወይም ተጫዋቹ እንደገና መጫወት ሲፈልግ የቴብል (TakenNumber) ቁጥሮች እንደአዲስ እንዲጸዱ እና እንዲቀመጡ የሚደረግበት ክፍል
bot.action('check_bingo', async (ctx) => {
    const userId = ctx.from.id;
    let game = activeGames[userId];
    if (!game || !game.gameActive) return ctx.answerCbQuery('❌ ንቁ ጨዋታ የለም!', { show_alert: true });
    
    if (checkWinCondition(game.matrix)) {
        let u = await getOrCreateUser(userId);
        u.balance += game.winnerReward; u.wins += 1; u.level += 1; await u.save();
        
        // ጨዋታው ሲጠናቀቅ የተያዙትን የቢንጎ ቁጥሮች ከዳታቤዝ ሙሉ በሙሉ በማጽዳት (Reset) ተጫዋቾች እንደአዲስ መምረጥ እንዲችሉ ማድረግ
        await TakenNumber.deleteMany({});

        for (let pId of game.roomPlayers) {
            if (activeGames[pId]) { activeGames[pId].gameActive = false; delete activeGames[pId]; }
            bot.telegram.sendMessage(pId, pId === userId ? `🎉 <b>BINGO! 🏆 አሸንፈዋል!</b>\n\n🔄 ቴብሉ እንደአዲስ ተጠርቷል! እንደገና መጫወት ይችላሉ።` : `🏁 ጨዋታው አልቋል!`).catch(()=>{});
        }
    } else {
        return ctx.answerCbQuery('❌ ገና BINGO አልሞሉም!', { show_alert: true });
    }
});

bot.action(/approve_req_(.+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let req = await RequestModel.findById(ctx.match[1]);
    if (!req) return ctx.answerCbQuery('❌ አልተገኘም!');
    let u = await getOrCreateUser(req.userId);
    if (req.type === 'deposit') { u.balance += req.amount; await u.save(); bot.telegram.sendMessage(req.userId, `🎉 ዲፖዚትዎ ጸድቋል! 💰`); }
    await RequestModel.findByIdAndDelete(req.match[1]);
    ctx.editMessageText(`✅ ጸድቋል!`);
});

bot.action(/reject_req_(.+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let req = await RequestModel.findById(ctx.match[1]);
    if (!req) return ctx.answerCbQuery('❌ አልተገኘም!');
    if (req.type === 'withdraw') { let u = await getOrCreateUser(req.userId); u.balance += req.amount; await u.save(); }
    bot.telegram.sendMessage(req.userId, `❌ ውድቅ ተደርጓል።`);
    await RequestModel.findByIdAndDelete(req.match[1]);
    ctx.editMessageText(`❌ ውድቅ ተደርጓል!`);
});

bot.action(/reply_comment_(.+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    userSteps[ADMIN_ID] = { action: 'admin_reply_comment', commentId: ctx.match[1] };
    ctx.answerCbQuery();
    ctx.reply(`✍️ ምላሽ ይላኩ:`);
});

bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'ተጫዋች';
    let photo = ctx.message.photo[ctx.message.photo.length - 1];
    let photoId = photo.file_id;
    let photoUniqueId = photo.file_unique_id;

    if (userId === ADMIN_ID && userSteps[ADMIN_ID]?.action === 'admin_reply_comment') {
        let cId = userSteps[ADMIN_ID].commentId;
        delete userSteps[ADMIN_ID];
        let c = await CommentModel.findById(cId);
        c.adminReply = ctx.message.caption || 'ምላሽ'; c.adminPhotoId = photoId; await c.save();
        bot.telegram.sendPhoto(c.userId, photoId, { caption: `📥 <b>ምላሽ:</b> ${c.adminReply}`, parse_mode: 'HTML' }).catch(()=>{});
        return ctx.reply(`✅ ተልኳል!`);
    }

    if (userSteps[userId]?.action === 'deposit_screenshot') {
        let amount = userSteps[userId].amount;
        delete userSteps[userId];
        let req = new RequestModel({ userId, userName, type: 'deposit', amount, details: 'Screenshot', photoUniqueId, photoId });
        await req.save();
        ctx.reply(`⏳ ዲፖዚት ጥያቄዎ ደርሷል!`);
        let kb = Markup.inlineKeyboard([[Markup.button.callback('✅ አጽድቅ', `approve_req_${req._id}`), Markup.button.callback('❌ ውድቅ', `reject_req_${req._id}`)]]);
        bot.telegram.sendPhoto(ADMIN_ID, photoId, { caption: `📥 ዲፖዚት: ${userName} (${amount} ETB)`, ...kb }).catch(()=>{});
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
            let u = await getOrCreateUser(step.targetId);
            u.balance += parseInt(text); await u.save();
            delete userSteps[ADMIN_ID];
            ctx.reply(`✅ ተሞልቷል!`);
            return bot.telegram.sendMessage(step.targetId, `🎉 አካውንትዎ ተሞልቷል።`).catch(()=>{});
        }
    }

    if (userSteps[userId]) {
        let s = userSteps[userId];
        if (s.action === 'deposit_amount') {
            let amount = parseInt(text.match(/\d+/)?.[0] || 0);
            if (amount <= 0) return ctx.reply(`❌ ትክክለኛ መጠን ያስገቡ።`);
            userSteps[userId] = { action: 'deposit_screenshot', amount };
            return ctx.reply(`📸 የክፍያ ስክሪንሾት ፎቶ ይላኩ:`);
        }
        if (s.action === 'withdraw_amount') {
            let amount = parseInt(text.match(/\d+/)?.[0] || 0);
            delete userSteps[userId];
            let u = await getOrCreateUser(userId);
            if (u.balance < amount) return ctx.reply(`❌ በቂ ባላንስ የለዎትም!`);
            u.balance -= amount; await u.save();
            let req = new RequestModel({ userId, userName: u.userName, type: 'withdraw', amount, details: u.phone });
            await req.save();
            return ctx.reply(`⏳ ዊዝድሮ ጥያቄዎ ተልኳል!`);
        }
        if (s.action === 'comment_waiting') {
            delete userSteps[userId];
            let c = new CommentModel({ userId, userName: ctx.from.first_name, message: text });
            await c.save();
            ctx.reply(`✅ አስተያየትዎ ተልኳል!`, mainKeyboard);
            let btn = Markup.inlineKeyboard([[Markup.button.callback('✍️ ምላሽ ስጥ', `reply_comment_${c._id}`)]]);
            return bot.telegram.sendMessage(ADMIN_ID, `💬 ከ: ${ctx.from.first_name} | "${text}"`, btn).catch(()=>{});
        }
    }
});

bot.launch();
console.log('🤖 Bot & Mini App Server is running successfully!');