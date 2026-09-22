require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const cron = require('node-cron');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;

app.use(cors({
    origin: '*',
    allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
    console.error('❌ MONGO_URI is not defined in environment variables!');
    process.exit(1);
}

mongoose.connect(MONGO_URI)
.then(() => {
    console.log('📦 Connected to MongoDB successfully!');
    seedAdminAccounts();
}).catch(err => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
});

// --- Schemas ---
const userSchema = new mongoose.Schema({
    userId: { type: Number, required: true, unique: true },
    userName: { type: String },
    phone: { type: String, default: null },
    balance: { type: Number, default: 0 },
    assignedAdminId: { type: Number, default: null },
    referredBy: { type: Number, default: null },
    hasReceivedBonus: { type: Boolean, default: false },
    totalGames: { type: Number, default: 0 },
    wins: { type: Number, default: 0 },
    dailyWins: { type: Number, default: 0 },
    weeklyWins: { type: Number, default: 0 },
    qualifiedDays: { type: Number, default: 0 },
    losses: { type: Number, default: 0 },
    level: { type: Number, default: 1 }
});
const User = mongoose.model('User', userSchema);

const bingoGameSchema = new mongoose.Schema({
    gameId: { type: String, required: true, unique: true },
    cost: { type: Number, required: true },
    status: { type: String, default: 'waiting' },
    players: { type: Array, default: [] }
});
const BingoGame = mongoose.model('BingoGame', bingoGameSchema);

const adminAccountSchema = new mongoose.Schema({
    adminId: { type: Number, required: true, unique: true },
    adminName: { type: String, required: true },
    telebirr: { type: String, required: true },
    cbeAccount: { type: String, required: true },
    isActive: { type: Boolean, default: true }
});
const AdminAccount = mongoose.model('AdminAccount', adminAccountSchema);

const requestSchema = new mongoose.Schema({
    userId: { type: Number, required: true },
    assignedAdminId: { type: Number, default: null },
    userName: { type: String },
    type: { type: String, required: true },
    amount: { type: Number, required: true },
    details: { type: String, required: true },
    photoId: { type: String, sparse: true },
    date: { type: Date, default: Date.now }
});
const RequestModel = mongoose.model('Request', requestSchema);

const takenNumberSchema = new mongoose.Schema({
    gameId: { type: String, required: true },
    number: { type: Number, required: true },
    userId: { type: Number, required: true },
    userName: { type: String }
});
takenNumberSchema.index({ gameId: 1, number: 1 }, { unique: true });
const TakenNumber = mongoose.model('TakenNumber', takenNumberSchema);

// --- Telegram Bot Setup ---
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) {
    console.error('❌ BOT_TOKEN is not defined!');
    process.exit(1);
}
const bot = new Telegraf(TOKEN);
const OWNER_ID = 380035906;
let subAdmins = [897196934, 356872111, 1259126904, 7192701371, 413158935, 1694041775];

const initialAdminAccounts = [
    { adminId: 380035906, adminName: 'መስራች አድሚን (Owner)', telebirr: '0929441620', cbeAccount: '10005741880' },
    { adminId: 897196934, adminName: 'እዩኤል', telebirr: '0923272131', cbeAccount: '' },
    { adminId: 356872111, adminName: 'ያሬድ', telebirr: '0923941648', cbeAccount: '' },
    { adminId: 1259126904, adminName: 'ዮሃንሰ', telebirr: '0913774232', cbeAccount: '' },
    { adminId: 7192701371, adminName: 'እንዳለ', telebirr: '0991220615', cbeAccount: '' },
    { adminId: 413158935, adminName: 'ቴዲ', telebirr: '0929441620', cbeAccount: '' },
    { adminId: 1694041775, adminName: 'ሰብለ', telebirr: '0929441620', cbeAccount: '' }
];

async function seedAdminAccounts() {
    for (let acc of initialAdminAccounts) {
        await AdminAccount.findOneAndUpdate(
            { adminId: acc.adminId },
            { ...acc, isActive: true },
            { upsert: true, returnDocument: 'after' }
        );
    }
    console.log('✅ የአድሚን አካውንቶች ዳታቤዝ ውስጥ በትክክል ተመዝግበዋል።');
}

function isAdmin(userId) {
    return userId === OWNER_ID || subAdmins.includes(userId);
}

// --- Socket.io Realtime Logic ---
let waitingRooms = {};

io.on('connection', (socket) => {
    console.log('🟢 User connected via Socket.io:', socket.id);

    socket.on('join_bingo_room', async (data) => {
        const { userId, userName, betCost, initialNum } = data;
        socket.userId = userId;
        socket.betCost = betCost;

        let roomKey = `room_${betCost}`;
        if (!waitingRooms[roomKey]) {
            waitingRooms[roomKey] = {
                gameId: 'game_' + Date.now(),
                players: [],
                countdown: 30,
                timer: null
            };
        }

        let room = waitingRooms[roomKey];
        room.players.push({ socketId: socket.id, userId, userName, initialNum });
        socket.join(room.gameId);

        io.to(room.gameId).emit('update_timer', room.countdown);

        if (room.players.length === 1) {
            room.timer = setInterval(async () => {
                room.countdown--;
                io.to(room.gameId).emit('update_timer', room.countdown);

                if (room.countdown <= 0) {
                    clearInterval(room.timer);
                    if (room.players.length < 2) {
                        io.to(room.gameId).emit('cancel_game', { message: 'በቂ ተጫዋቾች አልተገኙም (ቢያንስ 2 ያስፈልጋል)' });
                        // refund balance
                        for (let p of room.players) {
                            await User.updateOne({ userId: p.userId }, { $inc: { balance: betCost } });
                        }
                        delete waitingRooms[roomKey];
                    } else {
                        io.to(room.gameId).emit('start_game', { gameId: room.gameId, players: room.players });
                        delete waitingRooms[roomKey];
                    }
                }
            }, 1000);
        } else if (room.players.length >= 5) {
            clearInterval(room.timer);
            io.to(room.gameId).emit('start_game', { gameId: room.gameId, players: room.players });
            delete waitingRooms[roomKey];
        }
    });

    socket.on('disconnect', () => {
        console.log('🔴 User disconnected:', socket.id);
    });
});

// --- API Endpoints ---
app.get('/api/user/profile', async (req, res) => {
    try {
        const userId = req.query.userId;
        if (!userId) return res.status(400).json({ success: false, message: 'ID አልተገኘም' });

        let user = await User.findOne({ userId: Number(userId) });
        if (!user) {
            user = new User({ userId: Number(userId), userName: 'ተጫዋች', balance: 0 });
            await user.save();
        }
        res.json({ success: true, user });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/bingo/win', async (req, res) => {
    try {
        const { userId, reward } = req.body;
        let user = await User.findOne({ userId: Number(userId) });
        if (!user) return res.status(404).json({ success: false, message: 'ተጫዋች አልተገኘም' });

        user.balance += Number(reward);
        user.wins += 1;
        user.dailyWins += 1;
        await user.save();

        res.json({ success: true, newBalance: user.balance });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/keno/play', async (req, res) => {
    try {
        const { userId, betAmount, selectedNumbers } = req.body;
        let user = await User.findOne({ userId: Number(userId) });

        if (!user || user.balance < Number(betAmount)) {
            return res.status(400).json({ success: false, message: 'በቂ ባላንስ የለዎትም!' });
        }

        let allNums = Array.from({ length: 80 }, (_, i) => i + 1);
        let drawnNumbers = [];
        while (drawnNumbers.length < 20) {
            let rIdx = Math.floor(Math.random() * allNums.length);
            drawnNumbers.push(allNums.splice(rIdx, 1)[0]);
        }

        let matches = selectedNumbers.filter(n => drawnNumbers.includes(n));
        let matchCount = matches.length;
        let selectedCount = selectedNumbers.length;
        let winAmount = 0;

        if (matchCount === selectedCount) {
            let multipliers = { 1: 0.5, 2: 1.2, 3: 1.6, 4: 2.2, 5: 2.8, 6: 3.5, 7: 4.5, 8: 6, 9: 10, 10: 20 };
            let multiplier = multipliers[selectedCount] || 0;
            winAmount = Math.round(Number(betAmount) + (Number(betAmount) * multiplier));
        } else if (selectedCount === 2 && matchCount === 1) {
            winAmount = Number(betAmount);
        } else if (selectedCount === 3 && matchCount === 2) {
            winAmount = Math.round(Number(betAmount) * 1.5);
        } else if (selectedCount === 4 && matchCount === 2) {
            winAmount = Number(betAmount);
        }

        user.balance -= Number(betAmount);
        user.totalGames += 1;

        if (winAmount > 0) {
            user.balance += winAmount;
            user.wins += 1;
            user.dailyWins += 1;
        } else {
            user.losses += 1;
        }

        await user.save();

        res.json({
            success: true,
            drawnNumbers,
            matchCount,
            winAmount,
            newBalance: user.balance
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/deposit', async (req, res) => {
    try {
        const { userId, amount } = req.body;
        let user = await User.findOne({ userId: Number(userId) });
        if (!user) return res.status(404).json({ success: false, message: 'ተጠቃሚ አልተገኘም' });

        const assignedAdminId = user.assignedAdminId || OWNER_ID;
        await RequestModel.create({
            userId: Number(userId),
            assignedAdminId,
            userName: user.userName,
            type: 'deposit',
            amount: Number(amount),
            details: 'Mini App Deposit Request'
        });

        bot.telegram.sendMessage(assignedAdminId, 
            `📥 **አዲስ የዲፖዚት ጥያቄ (ከMini App)!**\n\n👤 **ስም:** ${user.userName} (ID: \`${userId}\`)\n💰 **መጠን:** ETB ${amount}`,
            { parse_mode: 'Markdown' }
        ).catch(() => {});

        res.json({ success: true, message: 'ጥያቄዎ ተልኳል' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post('/api/withdraw', async (req, res) => {
    try {
        const { userId, amount, phone } = req.body;
        let user = await User.findOne({ userId: Number(userId) });

        if (!user || user.balance < Number(amount)) {
            return res.status(400).json({ success: false, message: 'በቂ ባላንስ የለዎትም!' });
        }

        user.balance -= Number(amount);
        await user.save();

        const assignedAdminId = user.assignedAdminId || OWNER_ID;
        await RequestModel.create({
            userId: Number(userId),
            assignedAdminId,
            userName: user.userName,
            type: 'withdraw',
            amount: Number(amount),
            details: phone || 'N/A'
        });

        bot.telegram.sendMessage(assignedAdminId, 
            `📥 **አዲስ የዊዝድሮ ጥያቄ (ከMini App)!**\n\n👤 **ስም:** ${user.userName} (ID: \`${userId}\`)\n💰 **መጠን:** ETB ${amount}\n📱 **ስልክ:** ${phone}`,
            { parse_mode: 'Markdown' }
        ).catch(() => {});

        res.json({ success: true, balance: user.balance, message: 'የዊዝድሮ ጥያቄዎ ተልኳል' });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Cron Jobs
cron.schedule('0 0 * * *', async () => {
    await User.updateMany({}, { dailyWins: 0 });
});

server.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});