require('dotenv').config(); // የ .env ፋይል እንዲነበብ የሚያደርግ
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
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    details: { type: String, required: true },
    photoId: { type: String, sparse: true }, 
    transactionId: { type: String, sparse: true }, 
    date: { type: Date, default: Date.now }
});
const RequestModel = mongoose.model('Request', requestSchema);

const commentSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    userName: { type: String },
    message: { type: String, required: true },
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
    `2. **ቴሌብር (Telebirr):** 0929441620 (ቴዎድሮስ)\n\n` +
    `⚠️ **ማሳሰቢያ:** ገንዘቡን ከላኩ በኋላ የትራንዛክሽን ቁጥር (Transaction ID) ወይም የትራንዛክሽን ስክሪንሾት (Screenshot) ፎቶ በዚህ ቦት ላይ ይላኩ!`;

let userSteps = {}; 
let activeGames = {}; 
let waitingRoom = {}; 

async function getOrCreateUser(userId, userName = 'ተጫዋች') {
    let user = await User.findOne({ userId });
    if (!user) {
        user = new User({ userId, userName, balance: 0.00 });
        await user.save();
    }
    return user;
}

// --- 🎨 የቢንጎ ዌብ አፕ (HTML & CSS Frontend) ማስተናገጃ ሩት ---
app.get('/game', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="am">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>እፉዬ ቢንጎ - Efuye Bingo</title>
        <style>
            :root {
                --bg-color: #0f172a;
                --card-bg: #1e293b;
                --accent-gold: #fbbf24;
                --accent-green: #22c55e;
                --text-color: #f8fafc;
            }
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background-color: var(--bg-color);
                color: var(--text-color);
                margin: 0;
                padding: 20px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
            }
            h1 {
                color: var(--accent-gold);
                margin-bottom: 5px;
                text-shadow: 0 0 10px rgba(251, 191, 36, 0.4);
            }
            .subtitle {
                color: #94a3b8;
                margin-bottom: 20px;
                font-size: 14px;
            }
            .bingo-container {
                background: var(--card-bg);
                padding: 20px;
                border-radius: 16px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.5);
                border: 2px solid rgba(251, 191, 36, 0.2);
            }
            .bingo-grid {
                display: grid;
                grid-template-columns: repeat(5, 1fr);
                gap: 8px;
                max-width: 350px;
            }
            .cell {
                background-color: #334155;
                aspect-ratio: 1;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                font-size: 18px;
                border-radius: 8px;
                cursor: pointer;
                transition: all 0.3s ease;
                border: 1px solid rgba(255,255,255,0.05);
            }
            .cell:hover {
                background-color: #475569;
                transform: scale(1.05);
            }
            .cell.header {
                background-color: var(--accent-gold);
                color: #000;
                cursor: default;
                box-shadow: 0 0 8px var(--accent-gold);
            }
            .cell.marked {
                background-color: var(--accent-green);
                color: #fff;
                box-shadow: 0 0 10px var(--accent-green);
            }
            .btn-bingo {
                margin-top: 20px;
                width: 100%;
                background: linear-gradient(135deg, #fbbf24, #d97706);
                color: #000;
                border: none;
                padding: 12px;
                font-size: 16px;
                font-weight: bold;
                border-radius: 8px;
                cursor: pointer;
                box-shadow: 0 4px 15px rgba(251, 191, 36, 0.3);
            }
        </style>
    </head>
    <body>
        <h1>🎲 እፉዬ ቢንጎ</h1>
        <div class="subtitle">የቀለም ጨዋታ እና መዝናኛ ዌብ አፕ</div>
        <div class="bingo-container">
            <div class="bingo-grid" id="bingoGrid">
                <div class="cell header">B</div>
                <div class="cell header">I</div>
                <div class="cell header">N</div>
                <div class="cell header">G</div>
                <div class="cell header">O</div>
                
                <div class="cell" onclick="toggleCell(this)">5</div>
                <div class="cell" onclick="toggleCell(this)">18</div>
                <div class="cell" onclick="toggleCell(this)">33</div>
                <div class="cell" onclick="toggleCell(this)">50</div>
                <div class="cell" onclick="toggleCell(this)">65</div>
                
                <div class="cell" onclick="toggleCell(this)">12</div>
                <div class="cell" onclick="toggleCell(this)">22</div>
                <div class="cell" onclick="toggleCell(this)">41</div>
                <div class="cell" onclick="toggleCell(this)">52</div>
                <div class="cell" onclick="toggleCell(this)">70</div>

                <div class="cell" onclick="toggleCell(this)">8</div>
                <div class="cell" onclick="toggleCell(this)">29</div>
                <div class="cell header marked">⭐</div>
                <div class="cell" onclick="toggleCell(this)">58</div>
                <div class="cell" onclick="toggleCell(this)">72</div>

                <div class="cell" onclick="toggleCell(this)">3</div>
                <div class="cell" onclick="toggleCell(this)">20</div>
                <div class="cell" onclick="toggleCell(this)">39</div>
                <div class="cell" onclick="toggleCell(this)">55</div>
                <div class="cell" onclick="toggleCell(this)">68</div>

                <div class="cell" onclick="toggleCell(this)">14</div>
                <div class="cell" onclick="toggleCell(this)">25</div>
                <div class="cell" onclick="toggleCell(this)">44</div>
                <div class="cell" onclick="toggleCell(this)">60</div>
                <div class="cell" onclick="toggleCell(this)">74</div>
            </div>
            <button class="btn-bingo" onclick="alert('ቢንጎ ተረጋገጠ! 🏆')">🎯 BINGO (ቢንጎ አረጋግጥ)</button>
        </div>
        <script>
            function toggleCell(element) {
                if(!element.classList.contains('header')) {
                    element.classList.toggle('marked');
                }
            }
        </script>
    </body>
    </html>
  `);
});

app.get('/', (req, res) => {
  res.send('Efuya Bingo Ultimate Bot with Web App is running!');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// --- የቢንጎ ማትሪክስ ጄነሬተር ---
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
    ['🎮 ፕለይ (Play)', '🌐 ከለርፉል ቢንጎ ዌብ (Web App)'],
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
        return ctx.reply(`👑 **ሰላም አድሚን ${userName}!**\nወደ እፉዬ ቢንጎ አስተዳዳሪ ፓነል በደህና መጡ።`, adminKeyboard);
    }

    if (!user.phone) {
        return ctx.reply(
            `🎲 **እፉዬ ቢንጎ (Efuye Bingo)** - እንኳን ደህና መጡ ${userName}!\n\nቦቱን ለመጠቀም እባክዎ ከታች ያለውን አዝራር በመጫን **ስልክ ቁጥርዎን** ያጋሩ (Share Contact):`,
            Markup.keyboard([[Markup.button.contactRequest('📱 ስልክ ቁጥር አጋራ (Share Contact)')]]).resize()
        );
    }

    await ctx.reply(`🎲 **እፉዬ ቢንጎ (Efuye Bingo)** - እንኳን ደህና መጡ እንደገና ${userName}!\n\nእባክዎ የሚፈልጉትን አማራጭ ከታች ካለው ሜኑ ይምረጡ።`, mainKeyboard);
});

bot.on('contact', async (ctx) => {
    const userId = ctx.from.id;
    const phone = ctx.message.contact.phone_number;
    let user = await getOrCreateUser(userId);
    user.phone = phone;
    await user.save();
    ctx.reply(`✅ ስልክ ቁጥርዎ በተሳካ ሁኔታ ተመዝግቧል!`, mainKeyboard);
});

bot.hears('🌐 ከለርፉል ቢንጎ ዌብ (Web App)', (ctx) => {
    const serverUrl = process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`;
    ctx.reply(
        `🎨 **የእፉዬ ቢንጎ ከለርፉል ዌብ አፕ**\n\nከታች ያለውን ቁልፍ በመጫን በከለማት የተዋበውን እና በ CSS የተሰራውን ውብ የቢንጎ ሰሌዳ ይክፈቱ!`,
        Markup.inlineKeyboard([[Markup.button.webApp('🚀 ከለርፉል ቢንጎ ክፈት (Open Web App)', `${serverUrl}/game`)]])
    );
});

bot.hears('🎮 ፕለይ (Play)', (ctx) => {
    if (ctx.from.id === ADMIN_ID) return ctx.reply('⚠️ አድሚን ነዎት! ከታች ካለው አድሚን መጫወቻ ይጠቀሙ።', adminKeyboard);
    ctx.reply(
        `🎮 **የመጫወቻ የገንዘብ መጠን ይምረጡ (በግሩፕ የተከፈለ):**`,
        Markup.inlineKeyboard([
            [Markup.button.callback('Play 10 ETB', 'play_10'), Markup.button.callback('Play 20 ETB', 'play_20')],
            [Markup.button.callback('Play 50 ETB', 'play_50'), Markup.button.callback('Play 100 ETB', 'play_100')]
        ])
    );
});

bot.hears('💰 ዲፖዚት (Deposit)', (ctx) => {
    const userId = ctx.from.id;
    userSteps[userId] = { action: 'deposit_amount' };
    ctx.reply(`${ADMIN_PAYMENT_INFO}\n\n💰 እባክዎ **ያስተላለፉትን የብር መጠን** ቁጥር ብቻ ይጻፉ (ለምሳሌ: 100):`);
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
        `💰 አካውንት ባላንስ: **ETB ${user.balance.toFixed(2)}**\n` +
        `🎮 አጠቃላይ የተጫወቷቸው: ${user.totalGames}\n` +
        `🏆 ያሸነፉዋቸው: ${user.wins}\n` +
        `❌ የተሸነፉዋቸው: ${user.losses}`
    );
});

bot.hears('💬 ኮሜንት (Comment)', (ctx) => {
    const userId = ctx.from.id;
    userSteps[userId] = { action: 'send_comment' };
    ctx.reply(`💬 ለአድሚን ማስተላለፍ የሚፈልጉትን አስተያየት ወይም ጥያቄ ይጻፉ፦`);
});

bot.hears('📖 መመሪያ (Instructions)', (ctx) => {
    ctx.reply(
        `📖 **የእፉዬ ቢንጎ ጨዋታ አጨዋወት መመሪያዎች**\n\n` +
        `1. ዲፖዚት በመጫን ገንዘብ ገቢ በማድረግ የትራንዛክሽን ኮድ ወይም ስክሪንሾት ፎቶ ይላኩ።\n` +
        `2. ፕለይ የሚለውን በመጫን የገንዘብ መጠን ይምረጡ።\n` +
        `3. ቁጥሮች ሲጠሩ ቴብሉ ላይ እየተጫኑ ይሙሉ; አንደኛ ቢንጎ ያለ ሰው ሲወጣ ጨዋታው ይጠናቀቃል!`
    );
});

bot.hears('📊 የአድሚን ባላንስ ማየት', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let users = await User.find();
    let totalCompanyBalance = users.reduce((sum, u) => sum + u.balance, 0);
    ctx.reply(`📊 **የአድሚን ባላንስ እና ስታቲስቲክስ**\n\n👥 አጠቃላይ ተጫዋቾች: ${users.length} ሰው\n💰 የተጫዋቾች አጠቃላይ የባላንስ ድምር: ETB ${totalCompanyBalance.toFixed(2)}`, adminKeyboard);
});

bot.hears('👥 የተጫዋቾች ዝርዝር (Player List)', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let users = await User.find().sort({ _id: -1 }).limit(20);
    if (users.length === 0) return ctx.reply('📭 እስካሁን የተመዘገበ ተጫዋች የለም።', adminKeyboard);
    ctx.reply(`👥 **የተጫዋቾች ዝርዝር:**`, adminKeyboard);
    for (let [index, u] of users.entries()) {
        let playerInfo = `👤 **${index + 1}. ስም:** ${u.userName}\n🆔 **ID:** \`${u.userId}\`\n📱 **ስልክ:** ${u.phone || 'N/A'}\n💰 **ባላንስ:** ETB ${u.balance.toFixed(2)}`;
        let removeButton = Markup.inlineKeyboard([[Markup.button.callback('❌ ከቦቱ አስወጣ', `ban_user_${u.userId}`)]]);
        await ctx.reply(playerInfo, { parse_mode: 'Markdown', ...removeButton });
    }
});

bot.hears('📥 የዲፖዚት/ዊዝድሮ ጥያቄዎች', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let reqs = await RequestModel.find();
    if (reqs.length === 0) return ctx.reply('📭 ምንም የሚጠብቅ ጥያቄ የለም።', adminKeyboard);
    for (let r of reqs) {
        let msg = `📌 **አይነት:** ${r.type.toUpperCase()}\n👤 **ስም:** ${r.userName} (ID: \`${r.userId}\`)\n💰 **መጠን:** ETB ${r.amount}\n📱 **አካውንት/ስልክ:** \`${r.details}\``;
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

// --- 🛠 የዲፖዚት እና ዊዝድሮ ጥያቄዎችን መቀበል/ማስተካከል (Approve / Reject Handlers) ---
bot.action(/approve_req_(.+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let reqId = ctx.match[1];
    let request = await RequestModel.findById(reqId);
    
    if (!request) {
        return ctx.answerCbQuery('❌ ይህ ጥያቄ უკვე ተሰርዟል ወይም የለም!', { show_alert: true });
    }

    let targetUser = await getOrCreateUser(request.userId);

    if (request.type === 'deposit') {
        targetUser.balance += request.amount;
        await targetUser.save();
        
        // ተጠቃሚውን ማሳወቅ
        bot.telegram.sendMessage(request.userId, `🎉 **የዲፖዚት ጥያቄዎ ጸድቋል!**\n💰 አካውንትዎ ላይ **ETB ${request.amount}** ተጨምሯል።`).catch(() => {});
        ctx.editMessageCaption(`✅ **የዲፖዚት ጥያቄ ጸድቋል! (Approved)**\n👤 ${request.userName} - ETB ${request.amount}`).catch(() => {
            ctx.editMessageText(`✅ **የዲፖዚት ጥያቄ ጸድቋል! (Approved)**\n👤 ${request.userName} - ETB ${request.amount}`).catch(() => {});
        });
    } else if (request.type === 'withdraw') {
        // ዊዝድሮ ቀድሞ ተቀንሷል፣ አሁን ጥያቄው ጸድቋል
        bot.telegram.sendMessage(request.userId, `🎉 **የዊዝድሮ ጥያቄዎ ጸድቋል!**\n💵 ገንዘቡ ወደ ስልክ ቁጥርዎ (${targetUser.phone}) ተልኳል።`).catch(() => {});
        ctx.editMessageCaption(`✅ **የዊዝድሮ ጥያቄ ጸድቋል! (Approved)**\n👤 ${request.userName} - ETB ${request.amount}`).catch(() => {
            ctx.editMessageText(`✅ **የዊዝድሮ ጥያቄ ጸድቋል! (Approved)**\n👤 ${request.userName} - ETB ${request.amount}`).catch(() => {});
        });
    }

    await RequestModel.findByIdAndDelete(reqId);
    ctx.answerCbQuery('✅ ጥያቄው በተሳካ ሁኔታ ጸድቋል!');
});

bot.action(/reject_req_(.+)/, async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let reqId = ctx.match[1];
    let request = await RequestModel.findById(reqId);

    if (!request) {
        return ctx.answerCbQuery('❌ ይህ ጥያቄ უკვე ተሰርዟል ወይም የለም!', { show_alert: true });
    }

    let targetUser = await getOrCreateUser(request.userId);

    if (request.type === 'deposit') {
        bot.telegram.sendMessage(request.userId, `❌ **የዲፖዚት ጥያቄዎ ውድቅ ተደርጓል!**\nእባክዎ ትክክለኛ መረጃ መላክዎን ያረጋግጡ።`).catch(() => {});
    } else if (request.type === 'withdraw') {
        // ዊዝድሮ ውድቅ ሲደረግ ቀድሞ ተቀንሶ የነበረው ገንዘብ ተመልሶ ለተጠቃሚው ይገባል
        targetUser.balance += request.amount;
        await targetUser.save();
        bot.telegram.sendMessage(request.userId, `❌ **የዊዝድሮ ጥያቄዎ ውድቅ ተደርጓል!**\n💰 ETB ${request.amount} ተመላሽ ወደ አካውንትዎ ገብቷል።`).catch(() => {});
    }

    ctx.editMessageCaption(`❌ **የጥያቄ ውድቅ ተደርጓል! (Rejected)**\n👤 ${request.userName} - ETB ${request.amount}`).catch(() => {
        ctx.editMessageText(`❌ **የጥያቄ ውድቅ ተደርጓል! (Rejected)**\n👤 ${request.userName} - ETB ${request.amount}`).catch(() => {});
    });

    await RequestModel.findByIdAndDelete(reqId);
    ctx.answerCbQuery('❌ ጥያቄው ውድቅ ተደርጓል!');
});

bot.hears('💬 የተጫዋቾች ኮሜንቶች', async (ctx) => {
    if (ctx.from.id !== ADMIN_ID) return;
    let comments = await CommentModel.find().sort({ date: -1 }).limit(15);
    if (comments.length === 0) return ctx.reply('📭 ምንም አስተያየት የለም።', adminKeyboard);
    for (let c of comments) {
        let replyStatus = c.adminReply ? `\n✅ **ምላሽ:** ${c.adminReply}` : `\n❌ ምላሽ አልተሰጠበትም`;
        let msg = `📌 **ከ:** ${c.userName} (ID: \`${c.userId}\`)\n💬 **መልእክት:** "${c.message}"${replyStatus}`;
        let replyBtn = Markup.inlineKeyboard([[Markup.button.callback('✍️ ምላሽ ስጥ', `reply_comment_${c._id}`)]]);
        await ctx.reply(msg, { parse_mode: 'Markdown', ...replyBtn });
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
            [Markup.button.callback('Play 50 ETB', 'play_50'), Markup.button.callback('Play 100 ETB', 'play_100')]
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
    ctx.editMessageText(`✅ ዩዘር ID \`${targetUserId}\` ያለው ተጫዋች ከሲስተሙ ተወግዷል!`, { parse_mode: 'Markdown' });
});

bot.action(/play_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    const cost = parseInt(ctx.match[1]);
    let user = await getOrCreateUser(userId);

    if (userId !== ADMIN_ID && user.balance < cost) {
        return ctx.answerCbQuery(`❌ በቂ ባላንስ የለዎትም!`, { show_alert: true });
    }

    if (userId !== ADMIN_ID) {
        user.balance -= cost;
        user.totalGames += 1;
        await user.save();
    }

    let matrix = generateBingoCard();
    if (!waitingRoom[cost]) waitingRoom[cost] = [];
    waitingRoom[cost].push({ userId, ctx, matrix, cost });

    await ctx.editMessageText(
        `⏳ **የ ETB ${cost} ግሩፕ ተጫዋቾችን በመጠበቅ ላይ (30 ሰከንድ)...**\nአሁን ያሉ ንቁ ተጫዋቾች: **${waitingRoom[cost].length}** ሰው`,
        Markup.inlineKeyboard([])
    );

    setTimeout(async () => {
        let room = waitingRoom[cost];
        if (!room) return;

        if (room.length < 2 && userId !== ADMIN_ID) {
            for (let p of room) {
                if (p.userId !== ADMIN_ID) {
                    let pUser = await getOrCreateUser(p.userId);
                    pUser.balance += p.cost; 
                    pUser.totalGames -= 1;
                    await pUser.save();
                }
                try {
                    await p.ctx.editMessageText(`⚠️ **በቂ ተጫዋች ባለመገኘቱ የ ETB ${cost} ጨዋታው ተሰርዟል!** ገንዘብዎ ተመልሷል።`);
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
        let winnerReward = totalPool - adminCommission;
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
                    `💰 አጠቃላይ ፖል: **ETB ${totalPool}** (ሽልማት: ${winnerReward.toFixed(2)})\n` +
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

bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    if (userId === ADMIN_ID && userSteps[ADMIN_ID]) {
        let step = userSteps[ADMIN_ID];
        if (step.action === 'admin_deposit_id') {
            userSteps[ADMIN_ID] = { action: 'admin_deposit_amount', targetId: parseInt(text) };
            return ctx.reply(`💵 የ ተጫዋች ID ተይዟል። ሊያስገቡለት የሚፈልጉትን የብር መጠን ያስገቡ:`);
        } else if (step.action === 'admin_deposit_amount') {
            let targetUser = await getOrCreateUser(step.targetId);
            targetUser.balance += parseFloat(text);
            await targetUser.save();
            delete userSteps[ADMIN_ID];
            ctx.reply(`✅ ዲፖዚቱ ተሳክቷል!`);
            return bot.telegram.sendMessage(step.targetId, `🎉 አድሚን አካውንትዎን ሞልቶታል። 💰`).catch(()=>{});
        }
    }

    if (userSteps[userId]) {
        let stepInfo = userSteps[userId];
        if (stepInfo.action === 'deposit_amount') {
            const amount = parseFloat(text.match(/[\d.]+/)?.[0] || 0);
            delete userSteps[userId];
            let newReq = new RequestModel({ userId, userName: ctx.from.first_name, type: 'deposit', amount, details: 'Transaction' });
            await newReq.save();
            ctx.reply(`✅ የ ETB ${amount} የዲፖዚት ጥያቄዎ ለአድሚን ተልኳል!`);
            return;
        }
        if (stepInfo.action === 'withdraw_amount') {
            const amount = parseFloat(text.match(/[\d.]+/)?.[0] || 0);
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
        if (stepInfo.action === 'send_comment') {
            delete userSteps[userId];
            let newComment = new CommentModel({ userId, userName: ctx.from.first_name, message: text });
            await newComment.save();
            return ctx.reply(`✅ አስተያየትዎ ለአድሚን ተልኳል!`);
        }
    }
});

bot.launch();
console.log('🤖 Efuye Bingo Ultimate Bot with Web App & CSS is running successfully!');