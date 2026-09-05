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
    console.error('❌ MONGODB_URI is not defined in environment variables! Please set it on your .env file.');
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
    balance: { type: Number, default: 0.00 },
    totalGames: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    level: { type: Number, default: 1 }
});
const User = mongoose.model('User', userSchema);

const requestSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    userName: { type: String },
    type: { type: String, required: true }, // 'deposit' or 'withdraw'
    amount: { type: Number, required: true },
    details: { type: String, required: true },
    status: { type: String, default: 'pending' }, // pending, approved, rejected
    date: { type: Date, default: Date.now }
});
const RequestModel = mongoose.model('Request', requestSchema);

const commentSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    userName: { type: String },
    message: { type: String, required: true },
    photo: { type: String, default: null }, // አዲስ፡ የኮሜንት ፎቶ file_id
    adminReply: { type: String, default: null },
    date: { type: Date, default: Date.now }
});
const CommentModel = mongoose.model('Comment', commentSchema);

// --- 3. ቦት እና አድሚን ማዋቀር ---
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
    console.error('❌ BOT_TOKEN is not defined in environment variables!');
    process.exit(1);
}

const bot = new Telegraf(TOKEN);
const ADMIN_ID = 380035906; // የአድሚን ID

const ADMIN_PAYMENT_INFO = `🏦 **የአድሚን የክፍያ አካውንቶች (ለዲፖዚት)**\n\n` +
    `1. **ንግድ ባንክ (CBE):** 10005741880 (ቴዎድሮስ / እፉዬ)\n` +
    `2. **ቴሌብር (Telebirr):** 0929441620 (ቴዎድሮስ)\n\n`;

let userSteps = {}; 
let activeGames = {}; 
let kenoSessions = {}; 
let bingoRooms = {}; 

async function getOrCreateUser(userId, userName = 'ተጫዋች') {
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId, userName, balance: 0.00 });
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

function getBingoTablesKeyboard(cost, takenTables = []) {
    let keyboard = [];
    let row = [];
    for (let i = 1; i <= 100; i++) {
        let isTaken = takenTables.includes(i);
        let btnText = isTaken ? `✅ ቴብል ${i}` : `🪑 ${i}`;
        row.push(Markup.button.callback(btnText, `btable_${cost}_${i}`));
        if (row.length === 5) {
            keyboard.push(row);
            row = [];
        }
    }
    keyboard.push([Markup.button.callback('🔙 ወደ ዋናው ሜኑ', 'back_to_main_menu')]);
    return Markup.inlineKeyboard(keyboard);
}

function getKenoKeyboard(selectedNumbers = []) {
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
    keyboard.push([Markup.button.callback('🎲 ኬኖ ጨዋታ ጀምር (Draw)', 'start_keno_draw')]);
    keyboard.push([Markup.button.callback('🔙 ወደ ዋናው ሜኑ', 'back_to_main_menu')]);
    return Markup.inlineKeyboard(keyboard);
}

function generateBingoCard() {
    let card = [];
    for (let col = 0; col < 5; col++) {
        let colNums = [];
        let min = col * 15 + 1;
        let max = min + 14;
        while (colNums.length < 5) {
            let rand = Math.floor(Math.random() * (max - min + 1)) + min;
            if (!colNums.includes(rand)) colNums.push(rand);
        }
        card.push(colNums);
    }
    let matrix = [];
    for (let r = 0; r < 5; r++) {
        let row = [];
        for (let c = 0; c < 5; c++) {
            if (r === 2 && c === 2) {
                row.push({ number: '⭐', marked: true, isFree: true });
            } else {
                row.push({ number: card[c][r], marked: false, isFree: false });
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
            `🎲 **እፉዬ ጨዋታዎች ማዕከል** - እንኳን ደህና መጡ ${userName}!\n\nቦቱን ለመጠቀም እባክዎ ከታች ያለውን አዝራር በመጫን **ስልክ ቁጥርዎን** ያጋሩ (Share Contact):`,
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

bot.hears('💰 ዲፖዚት (Deposit)', async (ctx) => {
    userSteps[ctx.from.id] = { action: 'deposit_amount' };
    await ctx.reply(
        ADMIN_PAYMENT_INFO +
        `📥 **ዲፖዚት ለማድረግ:**\nእባክዎ አካውንትዎ ላይ ማስገባት የሚፈልጉትን የብር መጠን (በቁጥር ብቻ) ይጻፉ (ለምሳሌ: 100):`,
        Markup.removeKeyboard()
    );
});

bot.hears('💳 ዊዝድሮ (Withdraw)', async (ctx) => {
    const userId = ctx.from.id;
    let user = await getOrCreateUser(userId);
    userSteps[userId] = { action: 'withdraw_amount' };
    await ctx.reply(
        `💳 **ዊዝድሮ ( ገንዘብ ማውጣት )**\n\n` +
        `ያሎት ጠቅላላ ባላንስ: **${user.balance} ETB**\n` +
        `እባክዎ ማውጣት የሚፈልጉትን የብር መጠን ይጻፉ:`,
        Markup.removeKeyboard()
    );
});

bot.hears('👤 ፕሮፋይል (Profile)', async (ctx) => {
    const userId = ctx.from.id;
    let user = await getOrCreateUser(userId);
    await ctx.reply(
        `👤 **የተጫዋች ፕሮፋይል**\n\n` +
        `🆔 መታወቂያ: \`${user.userId}\`\n` +
        `ስም: ${user.userName}\n` +
        `ስልክ: ${user.phone || 'ሳይያያዝ ቀርቷል'}\n` +
        `💰 ባላንስ: **ETB ${user.balance.toFixed(2)}**\n` +
        `🎮 የተጫወቷቸው ጨዋታዎች: ${user.totalGames}\n` +
        `🏆 ያሸነፉት: ${user.wins} | ❌ የተሸነፉት: ${user.losses}\n` +
        `⭐ ደረጃ (Level): ${user.level}`,
        mainKeyboard
    );
});

bot.hears('💬 ኮሜንት (Comment)', async (ctx) => {
    userSteps[ctx.from.id] = { action: 'comment_waiting' };
    await ctx.reply(`💬 እባክዎ ለአድሚን ማስተላለፍ የሚፈልጉትን አስተያየት, ጥያቄ ወይም **ፎቶ (Screenshot)** ይጻፉልን/ይላኩልን:`, Markup.removeKeyboard());
});

bot.hears('📖 መመሪያ (Instructions)', (ctx) => {
    ctx.reply(
        `📖 **የእፉዬ ጨዋታዎች ማዕከል መመሪያ**\n\n` +
        `1. **ዲፖዚት:** ከላይ ባለው የዲፖዚት አዝራር መሰረት ገንዘብ ገቢ በማድረግ የትራንዛክሽን ፎቶ (ደረሰኝ) በመላክ አካውንትዎን መሙላት ይችላሉ።\n` +
        `2. **ቢንጎ:** ከ 1 እስከ 100 ካሉት ቴብሎች በመምረጥ ከተቃራኒ ተጫዋቾች ጋር መወዳደር ይቻላል።\n` +
        `3. **ኬኖ:** ከ 1 እስከ 80 ካሉት ቁጥሮች በመምረጥ ዕድልዎን ይሞክሩ።`,
        mainKeyboard
    );
});

bot.action('select_bingo_main', (ctx) => {
    ctx.editMessageText(
        `🎯 **የቢንጎ ጨዋታ - የውርርድ መጠን ይምረጡ:**\n\nእባክዎ መጫወት የሚፈልጉትን የብር መጠን ይምረጡ:`,
        Markup.inlineKeyboard([
            [Markup.button.callback('Play 10 ETB', 'bingo_cost_10'), Markup.button.callback('Play 20 ETB', 'bingo_cost_20')],
            [Markup.button.callback('Play 50 ETB', 'bingo_cost_50'), Markup.button.callback('Play 100 ETB', 'bingo_cost_100')],
            [Markup.button.callback('🔙 ወደ ዋናው ሜኑ', 'back_to_main_menu')]
        ])
    );
});

bot.action(/bingo_cost_(\d+)/, async (ctx) => {
    const cost = parseInt(ctx.match[1]);
    const userId = ctx.from.id;
    let user = await getOrCreateUser(userId);

    if (userId !== ADMIN_ID && user.balance < cost) {
        return ctx.answerCbQuery(`❌ በቂ ባላንስ የለዎትም! (የመረጡት: ${cost} ብር)`, { show_alert: true });
    }

    if (!bingoRooms[cost]) bingoRooms[cost] = {};
    let takenTableIds = Object.keys(bingoRooms[cost]).map(Number);

    ctx.editMessageText(
        `🎯 **የ ETB ${cost} ቢንጎ ቴብል ምርጫ**\n\nከ **1 እስከ 100** ካሉት ቴብሎች ውስጥ የሚፈልጉትን ቴብል ቁጥር ይምረጡ (የተያዙት በ ✅ ምልክት ተደርገዋል):`,
        getBingoTablesKeyboard(cost, takenTableIds)
    );
});

bot.action(/btable_(\d+)_(\d+)/, async (ctx) => {
    const cost = parseInt(ctx.match[1]);
    const tableId = parseInt(ctx.match[2]);
    const userId = ctx.from.id;
    let user = await getOrCreateUser(userId);

    if (!bingoRooms[cost]) bingoRooms[cost] = {};

    if (bingoRooms[cost][tableId]) {
        if (bingoRooms[cost][tableId] === userId) {
            return ctx.answerCbQuery(`⚠️ ይህ ቴብል ቁጥር ${tableId} አስቀድሞ በእርስዎ ተይዟል! ጨዋታው እስኪጀመር ይጠብቁ።`, { show_alert: true });
        } else {
            return ctx.answerCbQuery(`❌ ይህ ቴብል ቁጥር ${tableId} በሌላ ተጫዋች ተይዟል! እባክዎ ሌላ ቴብል ይምረጡ።`, { show_alert: true });
        }
    }

    if (userId !== ADMIN_ID && user.balance < cost) {
        return ctx.answerCbQuery(`❌ በቂ ባላንስ የለዎትም!`, { show_alert: true });
    }

    if (userId !== ADMIN_ID) {
        user.balance -= cost;
        user.totalGames += 1;
        await user.save();
    }

    bingoRooms[cost][tableId] = userId;
    let matrix = generateBingoCard();

    await ctx.editMessageText(
        `✅ **ቴብል ቁጥር ${tableId} ተሳክቶ ተይዟል! (ETB ${cost})**\n\n⏳ ጨዋታው እስኪጀምር ወይም ሌሎች ተጫዋቾች ቴብል እስኪመርጡ ይጠብቁ...`,
        Markup.inlineKeyboard([])
    );

    setTimeout(async () => {
        let currentRoom = bingoRooms[cost];
        if (!currentRoom || currentRoom[tableId] !== userId) return;

        let roomPlayerIds = Object.values(currentRoom);
        let totalPool = cost * roomPlayerIds.length;
        let adminCommission = totalPool * 0.10;
        let winnerReward = totalPool - adminCommission;
        let availableNumbers = Array.from({ length: 75 }, (_, i) => i + 1);

        let firstDrawn = availableNumbers.splice(Math.floor(Math.random() * availableNumbers.length), 1)[0];
        let drawnHistory = [firstDrawn];

        activeGames[userId] = {
            gameId: 'bingo_' + Date.now(),
            matrix, cost, drawnNumber: firstDrawn, drawnHistory,
            availableNumbers, gameActive: true, roomPlayers: roomPlayerIds, winnerReward
        };

        try {
            await ctx.editMessageText(
                `🎲 **የቢንጎ ጨዋታ ተጀምሯል! (ቴብል #${tableId} - ETB ${cost})**\n` +
                `💰 አጠቃላይ ፖል: **ETB ${totalPool}** (ሽልማት: ${winnerReward.toFixed(2)})\n` +
                `📜 **ታሪክ:** [ ${drawnHistory.join(', ')} ]\n` +
                `🟢 **አሁንቁጥር: [ ${firstDrawn} ]**`,
                getBingoKeyboard(matrix)
            );
        } catch (e) {}

        let interval = setInterval(async () => {
            let currentGame = activeGames[userId];
            if (!currentGame || !currentGame.gameActive || currentGame.availableNumbers.length === 0) {
                clearInterval(interval);
                return;
            }
            let newNum = currentGame.availableNumbers.splice(Math.floor(Math.random() * currentGame.availableNumbers.length), 1)[0];
            currentGame.drawnNumber = newNum;
            currentGame.drawnHistory.push(newNum);

            try {
                await ctx.editMessageText(
                    `🎲 **ጨዋታ በሂደት ላይ... (ቴብል #${tableId})**\n` +
                    `📜 **ታሪክ:** [ ${currentGame.drawnHistory.join(', ')} ]\n` +
                    `🟢 **አሁንቁጥር: [ ${newNum} ]**`,
                    getBingoKeyboard(currentGame.matrix)
                );
            } catch (e) {}
        }, 6000);

    }, 15000);
});

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
        return ctx.answerCbQuery(`❌ በቂ ባላንስ የለዎትም! (የመረጡት: ${betAmount} ብር)`, { show_alert: true });
    }

    kenoSessions[userId] = { selectedNumbers: [], betAmount: betAmount };

    ctx.editMessageText(
        `🎲 **ኬኖ ጨዋታ (የውርርድ መጠን: ${betAmount} ETB)**\n\nከ 1 እስከ 80 ካሉት ቁጥሮች **ከ 1 እስከ 10 ቁጥሮች** ይምረጡ (አሁን የተመረጡ: 0):\n\nአካውንት ባላንስ: **ETB ${user.balance.toFixed(2)}**`,
        getKenoKeyboard([])
    );
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
    ctx.editMessageText(
        `🎲 **ኬኖ ጨዋታ (የውርርድ መጠን: ${session.betAmount} ETB)**\n\nየመረጧቸው ቁጥሮች: [ **${session.selectedNumbers.sort((a,b)=>a-b).join(', ')}** ] (${session.selectedNumbers.length}/10)\n\nአካውንት ባላንስ: **ETB ${user.balance.toFixed(2)}**`,
        getKenoKeyboard(session.selectedNumbers)
    ).catch(()=>{});
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
            let totalPicked = session.selectedNumbers.length;
            let winAmount = 0;

            if (totalPicked === 2) {
                if (matchCount === 2) winAmount = betAmount * 12;
                else if (matchCount === 1) winAmount = betAmount * 1;
            } else {
                if (matchCount === 10) winAmount = betAmount * 50;
                else if (matchCount === 9) winAmount = betAmount * 20;
                else if (matchCount === 8) winAmount = betAmount * 10;
                else if (matchCount === 7) winAmount = betAmount * 5;
                else if (matchCount === 6) winAmount = betAmount * 3;
                else if (matchCount === 5) winAmount = betAmount * 2;
                else if (matchCount >= 3 && matchCount <= 4) winAmount = betAmount * 1;
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

                resultMsg = `🎉 **እንኳን ደስ አሎት! ሽልማት አግኝተዋል!** 🏆\n\n` +
                    `🎯 የመረጧቸው: [ ${session.selectedNumbers.sort((a,b)=>a-b).join(', ')} ]\n` +
                    `球 አጠቃላይ የወጡት: [ ${drawnNumbers.sort((a,b)=>a-b).join(', ')} ]\n` +
                    `✨ ትክክለኛ ግጥሚያዎች: **${matchCount}** ቁጥር\n` +
                    `💰 ያሸነፉት ሽልማት: **ETB ${winAmount.toFixed(2)}**\n\n` +
                    `💼 ባላንስዎ: **ETB ${user.balance.toFixed(2)}**`;

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
                    `球 አጠቃላይ የወጡት: [ ${drawnNumbers.sort((a,b)=>a-b).join(', ')} ]\n` +
                    `✨ ትክክለኛ ግጥሚያዎች: **${matchCount}** ቁጥር\n\n` +
                    `💼 የቀረ ባላንስ: **ETB ${user.balance.toFixed(2)}**`;

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
            let msg = (pId === userId) ? `🎉 **እንኳን ደስ አሎት! BINGO ብለዋል!**\n💰 ሽልማት: **ETB ${game.winnerReward.toFixed(2)}**` : `🏁 ጨዋታው አልቋል! ሌላ ተጫዋች አሸንፏል።`;
            bot.telegram.sendMessage(pId, msg).catch(()=>{});
        }
        ctx.answerCbQuery('🏆 እንኳን ደስ አሎት!');
    } else {
        return ctx.answerCbQuery('❌ ገና BINGO አልሞሉም!', { show_alert: true });
    }
});

// User & Admin Text Inputs Handler
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    let user = await getOrCreateUser(userId);

    // --- የአድሚን ትዕዛዞች (Admin Command: /deposit USER_ID AMOUNT) ---
    if (userId === ADMIN_ID) {
        if (text.startsWith('/deposit')) {
            const parts = text.split(' ');
            if (parts.length < 3) {
                return ctx.reply('❌ አጠቃቀም ስህተት! እባክዎ በዚህ መልኩ ይጻፉ:\n`/deposit [USER_ID] [AMOUNT]`', { parse_mode: 'Markdown' });
            }
            const targetUserId = parseInt(parts[1]);
            const depositAmount = parseFloat(parts[2]);

            if (isNaN(targetUserId) || isNaN(depositAmount) || depositAmount <= 0) {
                return ctx.reply('❌ የተሳሳተ የዩዘር መታወቂያ (ID) ወይም የብር መጠን!');
            }

            let targetUser = await User.findOne({ userId: targetUserId });
            if (!targetUser) {
                return ctx.reply(`❌ በ User ID (${targetUserId}) የተመዘገበ ተጫዋች አልተገኘም!`);
            }

            targetUser.balance += depositAmount;
            await targetUser.save();

            // ለአድሚን ማሳወቂያ
            ctx.reply(`✅ **በተሳካ ሁኔታ ተሞልቷል!**\n\n👤 ተጫዋች: ${targetUser.userName} (\`${targetUserId}\`)\n💰 የገባው ገንዘብ: **${depositAmount} ETB**\n💼 አዲሱ ባላንስ: **${targetUser.balance} ETB**`, { parse_mode: 'Markdown' });

            // ለተጫዋቹ ማሳወቂያ መላክ
            bot.telegram.sendMessage(targetUserId, `🎉 **አካውንትዎ በድጋሚ ተሞልቷል!**\n\n💰 በባንክ/በቴሌብር ገቢ ያደረጉት **${depositAmount} ETB** ወደ አካውንትዎ ገብቷል!\n💼 አጠቃላይ ባላንስዎ: **${targetUser.balance} ETB**`).catch(() => {});
            return;
        }

        if (text === '📊 የአድሚን ባላንስ ማየት') {
            return ctx.reply(`👑 አድሚን ባላንስዎ ያልተገደበ (Unlimited) ነው!`);
        }
        if (text === '👥 የተጫዋቾች ዝርዝር (Player List)') {
            let count = await User.countDocuments();
            return ctx.reply(`👥 አጠቃላይ የተመዘገቡ ተጫዋቾች ብዛት: **${count}**`);
        }
        if (text === '💵 አድሚን ዲፖዚት ማድረግ') {
            return ctx.reply(`💵 ተጫዋቾችን በቀጥታ አካውንታቸው ላይ ገንዘብ ለመጨመር ይህንን ትዕዛዝ ተጠቀም:\n\n\`/deposit [USER_ID] [AMOUNT]\`\n\n(ምሳሌ: \`/deposit 123456789 200\`)`, { parse_mode: 'Markdown' });
        }
        if (text === '🔙 ወደ ዋናው ሜኑ ተመለስ') {
            return ctx.reply('ወደ ዋናው አስተዳዳሪ ፓነል ተመልሰዋል', adminKeyboard);
        }
    }

    if (userSteps[userId]) {
        let step = userSteps[userId].action;

        if (step === 'deposit_amount') {
            let amount = parseFloat(text);
            if (isNaN(amount) || amount <= 0) {
                return ctx.reply('❌ እባክዎ ትክክለኛ የብር መጠን ቁጥር ብቻ ይጻፉ:');
            }
            userSteps[userId] = { action: 'deposit_receipt', amount };
            return ctx.reply(`✅ የብር መጠን: **${amount} ETB** ተመዝግቧል።\n\n📷 አሁን የክፍያውን **ደረሰኝ (Screenshot)** ፎቶ ይላኩልን:`);
        }

        if (step === 'withdraw_amount') {
            let amount = parseFloat(text);
            if (isNaN(amount) || amount <= 0) {
                return ctx.reply('❌ እባክዎ ትክክለኛ የብር መጠን ቁጥር ይጻፉ:');
            }
            if (user.balance < amount) {
                return ctx.reply(`❌ በቂ ባላንስ የለዎትም! (ያሎት: ${user.balance} ብር)`);
            }
            user.balance -= amount;
            await user.save();

            await RequestModel.create({
                userId, userName: user.userName, type: 'withdraw', amount, details: `ስልክ: ${user.phone}`
            });

            delete userSteps[userId];
            return ctx.reply(`✅ የዊዝድሮ ጥያቄዎ በተሳካ ሁኔታ ለአድሚን ተልኳል! በቅርቡ ይረጋገጣል።`, mainKeyboard);
        }

        if (step === 'comment_waiting') {
            // ጽሑፍ ብቻ የያዘ ኮሜንት ሲላክ
            await CommentModel.create({ userId, userName: user.userName, message: text, photo: null });
            delete userSteps[userId];
            
            // አድሚን ጋር ማሳወቂያ መላክ
            bot.telegram.sendMessage(ADMIN_ID, `💬 **አዲስ ኮሜንት ከተጫዋች መጥቷል!**\n\n👤 ስም: ${user.userName}\n🆔 ዩዘር ID: \`${userId}\`\n💬 መልእክት: ${text}`, { parse_mode: 'Markdown' }).catch(()=>{});

            return ctx.reply(`✅ አስተያየትዎ ለአድሚን ደርሷል! እናመሰግናለን።`, mainKeyboard);
        }
    }
});

// Photo Handler (ለዲፖዚት ደረሰኝ እና ለኮሜንት ፎቶዎች)
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    let user = await getOrCreateUser(userId);
    let photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
    let caption = ctx.message.caption || 'ፎቶ ብቻ';

    // 1. የዲፖዚት ደረሰኝ ፎቶ ሲሆን
    if (userSteps[userId] && userSteps[userId].action === 'deposit_receipt') {
        let amount = userSteps[userId].amount;

        // 🔍 የተደገመ ደረሰኝ ማጣሪያ
        let existingReceipt = await RequestModel.findOne({ details: photoId });
        if (existingReceipt) {
            delete userSteps[userId];
            return ctx.reply(`❌ **ስህተት!** ይህ የትራንዛክሽን ፎቶ (ደረሰኝ) ከዚህ በፊት ተልኮበት ነበር ወይም አስቀድሞ ጥቅም ላይ ውሏል!`, mainKeyboard);
        }

        await RequestModel.create({
            userId, userName: user.userName, type: 'deposit', amount, details: photoId
        });

        delete userSteps[userId];
        
        // አድሚን ጋር ፎቶውን እና ጥያቄውን መላክ
        bot.telegram.sendPhoto(ADMIN_ID, photoId, {
            caption: `📥 **አዲስ የዲፖዚት ጥያቄ!**\n\n👤 ስም: ${user.userName}\n🆔 ዩዘር ID: \`${userId}\`\n💰 መጠን: **${amount} ETB**\n\nአካውንት ለመሙላት ይህንን ተጠቀም:\n\`/deposit ${userId} ${amount}\``,
            parse_mode: 'Markdown'
        }).catch(()=>{});

        return ctx.reply(`✅ የዲፖዚት ጥያቄዎ እና ደረሰኙ ለአድሚን ተልኳል! ሲረጋገጥ አካውንትዎ ላይ ይገባል።`, mainKeyboard);
    }

    // 2. የተጫዋች ኮሜንት ፎቶ ሲሆን (በ Comment ስቴፕ ላይ እያለ ፎቶ ሲልክ)
    if (userSteps[userId] && userSteps[userId].action === 'comment_waiting') {
        await CommentModel.create({ userId, userName: user.userName, message: caption, photo: photoId });
        delete userSteps[userId];

        // አድሚን ጋር የኮሜንት ፎቶውን መላክ
        bot.telegram.sendPhoto(ADMIN_ID, photoId, {
            caption: `💬 **አዲስ የኮሜንት ፎቶ ከተጫዋች መጥቷል!**\n\n👤 ስም: ${user.userName}\n🆔 ID: \`${userId}\`\n📝 መግለጫ: ${caption}`,
            parse_mode: 'Markdown'
        }).catch(()=>{});

        return ctx.reply(`✅ የኮሜንት ፎቶዎ ለአድሚን ተልኳል! እናመሰግናለን።`, mainKeyboard);
    }
});

bot.launch();
console.log('🤖 Efuye Bingo & Keno Bot is running with full features, Duplicate Check & Direct Admin Deposit!');