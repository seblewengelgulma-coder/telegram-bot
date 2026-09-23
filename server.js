require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const { connectDB, setupSocket } = require('./config/db');
const { bot } = require('./bot/botInstance');
const { seedAdminAccounts } = require('./bot/helpers');

// Routes
const userRoutes = require('./routes/userRoutes');
const bingoRoutes = require('./routes/bingoRoutes');
const kenoRoutes = require('./routes/kenoRoutes');
const transactionRoutes = require('./routes/transactionRoutes');

// Bot Handlers
const registerUserHandlers = require('./bot/handlers/userHandlers');
const registerAdminHandlers = require('./bot/handlers/adminHandlers');
const registerBingoHandlers = require('./bot/handlers/bingoHandlers');
const registerKenoHandlers = require('./bot/handlers/kenoHandlers');
const registerTextAndPhotoHandlers = require('./bot/textAndPhotoHandlers');

// Models
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// --- Express Middlewares ---
app.use(cors({
  origin: '*',
  allowedHeaders: ['Content-Type', 'X-Telegram-Init-Data', 'Authorization'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
}));
app.use(express.json());

// --- Static Files Serving (Frontend) ---
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes Connection ---
app.use('/api/user', userRoutes);
app.use('/api/bingo', bingoRoutes);
app.use('/api/keno', kenoRoutes);
app.use('/api', transactionRoutes);

// --- Register Bot Logic ---
registerUserHandlers(bot);
registerAdminHandlers(bot);
registerBingoHandlers(bot);
registerKenoHandlers(bot);
registerTextAndPhotoHandlers(bot);

// --- Connect Database & Setup Sockets ---
connectDB().then(() => {
  console.log('✅ MongoDB Connected');
  seedAdminAccounts();
  setupSocket(io);
}).catch(err => {
  console.error('❌ Database connection failed:', err);
});

// Launch Telegraf Bot (Delete existing webhook to avoid conflicts)
bot.telegram.deleteWebhook()
  .then(() => {
    return bot.launch();
  })
  .then(() => {
    console.log('🤖 Telegram Bot launched successfully!');
  })
  .catch(err => {
    console.error('❌ Bot launch failed:', err);
  });

// Enable graceful stop for bot
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// --- Cron Jobs ---
cron.schedule('0 0 * * *', async () => {
  try {
    await User.updateMany({}, { dailyWins: 0 });
    console.log('🔄 የዕለቱ የጨዋታ ገደብ ታድሷል');
  } catch (err) {
    console.error('Cron job error:', err);
  }
});

cron.schedule('0 0 * * 0', async () => {
  try {
    let winners = await User.find({ qualifiedDays: { $gt: 0 } }).sort({ weeklyWins: -1 }).limit(3);

    if (winners.length > 0) {
      const rewards = [500, 300, 100];

      for (let i = 0; i < winners.length; i++) {
        let reward = rewards[i] || 50;
        winners[i].balance += reward;
        await winners[i].save();

        bot.telegram.sendMessage(
          winners[i].userId,
          `🎉 **እንኳን ደስ አሎት!** የሳምንቱ **የአሸናፊዎች አሸናፊ** ቶርናመንት ${i + 1}ኛ በመውጣትዎ **ETB ${reward}** ቦነስ አግኝተዋል!`
        ).catch(() => {});
      }
    }

    await User.updateMany({}, { weeklyWins: 0, qualifiedDays: 0 });
  } catch (err) {
    console.error('Cron job weekly tournament error:', err);
  }
});

// Start Express Server
server.listen(PORT, () => {
  console.log(`🚀 Express server running on port ${PORT}`);
});