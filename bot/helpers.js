const { Markup } = require('telegraf');
const AdminAccount = require('../models/AdminAccount');
const User = require('../models/User');
const BingoGame = require('../models/BingoGame');
const TakenNumber = require('../models/TakenNumber');
const { bot, OWNER_ID, subAdmins } = require('./botInstance');

const DAILY_WIN_GOAL = 3;

let userSteps = {};
let activeGames = {};
let roomSessions = {};
let waitingRoom = {};
let kenoSessions = {};
let userSelectedBingoCost = {};

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

function isOwner(userId) {
  return userId === OWNER_ID;
}

function isAdmin(userId) {
  return userId === OWNER_ID || subAdmins.includes(userId);
}

async function assignAdminToUser(user, referrerId = null) {
  if (user.assignedAdminId) return user;

  if (referrerId && isAdmin(referrerId)) {
    user.referredBy = referrerId;
    user.assignedAdminId = referrerId;
    await user.save();
    return user;
  }

  const activeAdmins = await AdminAccount.find({ isActive: true });
  if (activeAdmins.length > 0) {
    const randomIndex = Math.floor(Math.random() * activeAdmins.length);
    user.assignedAdminId = activeAdmins[randomIndex].adminId;
    await user.save();
  }
  return user;
}

async function getAssignedAdminPaymentInfo(assignedAdminId) {
  if (assignedAdminId) {
    const admin = await AdminAccount.findOne({ adminId: assignedAdminId, isActive: true });
    if (admin) {
      return `🏦 **የአድሚን የክፍያ አካውንት (ለዲፖዚት)**\n\n` +
             `👤 **አድሚን:** ${admin.adminName}\n` +
             `1. **ንግድ ባንክ (CBE):** \`${admin.cbeAccount || 'የለም'}\`\n` +
             `2. **ቴሌብር (Telebirr):** \`${admin.telebirr || 'የለም'}\`\n\n`;
    }
  }
  return `🏦 **የአድሚን የክፍያ አካውንት (ለዲፖዚት)**\n\n` +
         `1. **ንግድ ባንክ (CBE):** 10005741880 (ቴዎድሮስ / እፉዬ)\n` +
         `2. **ቴሌብር (Telebirr):** 0929441620 (ቴዎድሮስ)\n\n`;
}

async function getOrCreateUser(userId, userName = 'ተጫዋች') {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({ userId, userName, balance: 0 });
    await user.save();
  }
  return user;
}

function getKenoKeyboard(selectedNumbers = [], betAmount = 10) {
  const WEB_APP_URL = process.env.WEB_APP_URL || 'https://telegram-bot-xer2.onrender.com/miniapp';
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
  keyboard.push([Markup.button.webApp('🚀 በ Mini App ኬኖ ጫወት', WEB_APP_URL)]);
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
  else if (count === 7) { multiplier = 4.5; }
  else if (count === 6) { multiplier = 3.5; }
  else if (count === 5) { multiplier = 2.8; }
  else if (count === 4) { multiplier = 2.2; }
  else if (count === 3) { multiplier = 1.6; }
  else if (count === 2) { multiplier = 1.2; }
  else if (count === 1) { multiplier = 0.5; }

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

function getFormattedBingoNumber(num) {
  if (num >= 1 && num <= 15) return `B${num}`;
  if (num >= 16 && num <= 30) return `I${num}`;
  if (num >= 31 && num <= 45) return `N${num}`;
  if (num >= 46 && num <= 60) return `G${num}`;
  if (num >= 61 && num <= 75) return `O${num}`;
  return `${num}`;
}

async function getBingo1to75Keyboard(gameId) {
  const WEB_APP_URL = process.env.WEB_APP_URL || 'https://telegram-bot-xer2.onrender.com/miniapp';
  let keyboard = [];
  let row = [];

  let takenDocs = await TakenNumber.find({ gameId });
  let takenMap = {};
  takenDocs.forEach(doc => { takenMap[doc.number] = true; });

  for (let i = 1; i <= 75; i++) {
    let dispNum = getFormattedBingoNumber(i);
    if (takenMap[i]) {
      row.push(Markup.button.callback(`✅ ${dispNum}`, `b_taken_${i}`));
    } else {
      row.push(Markup.button.callback(`${dispNum}`, `b_pick_${gameId}_${i}`));
    }

    if (row.length === 5) {
      keyboard.push(row);
      row = [];
    }
  }
  keyboard.push([Markup.button.webApp('🚀 በ Mini App ቢንጎ ጫወት', WEB_APP_URL)]);
  keyboard.push([Markup.button.callback('🔙 ወደ ዋናው ሜኑ', 'back_to_main_menu')]);
  return Markup.inlineKeyboard(keyboard);
}

function generateRandomBingoCard() {
  let colRanges = [
    { min: 1, max: 15 },   
    { min: 16, max: 30 },  
    { min: 31, max: 45 },  
    { min: 46, max: 60 },  
    { min: 61, max: 75 }   
  ];

  let columns = colRanges.map(range => {
    let nums = [];
    while (nums.length < 5) {
      let rand = Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
      if (!nums.includes(rand)) nums.push(rand);
    }
    return nums;
  });

  let matrix = [];
  for (let r = 0; r < 5; r++) {
    let row = [];
    for (let c = 0; c < 5; c++) {
      if (r === 2 && c === 2) {
        row.push({ number: '⭐', rawNum: 0, marked: true, isFree: true, display: '⭐' });
      } else {
        let rawNum = columns[c][r];
        let dispText = getFormattedBingoNumber(rawNum);
        row.push({ number: rawNum, rawNum: rawNum, marked: false, isFree: false, display: dispText });
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
      let text;
      if (cell.isFree) {
        text = `⭐ FREE`;
      } else {
        text = cell.marked ? `🟩 ${cell.display}` : `⬜ ${cell.display}`;
      }
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

function runBingoQueue(cost, gameId) {
  let countdown = 30;

  let countdownInterval = setInterval(async () => {
    countdown--;

    let roomContainer = waitingRoom[cost];
    if (!roomContainer || roomContainer.gameId !== gameId || !roomContainer.players || roomContainer.players.length === 0) {
      clearInterval(countdownInterval);
      return;
    }

    let room = roomContainer.players;
    let currentPlayersCount = room.length;
    let estimatedPool = cost * currentPlayersCount;

    for (let p of room) {
      if (p.ctx) {
        try {
          await p.ctx.editMessageText(
            `⏳ **ቁጥር ${p.pickedNum} ተመርጧል! ተጫዋቾችን በመጠበቅ ላይ...**\n` +
            `⏱ የቀረው ጊዜ፡ **${countdown} ሰከንድ**\n` +
            `👥 የተጫዋቾች ብዛት: **${currentPlayersCount}**\n` +
            `💰 አጠቃላይ ፖል (Pool): **ETB ${estimatedPool}**`,
            Markup.inlineKeyboard([])
          );
        } catch (e) {}
      }
    }

    if (countdown <= 0) {
      clearInterval(countdownInterval);

      if (room.length < 2) {
        await BingoGame.findOneAndUpdate({ gameId }, { status: 'cancelled' });

        for (let p of room) {
          if (!isAdmin(p.userId)) {
            let pUser = await getOrCreateUser(p.userId);
            pUser.balance += p.cost; 
            pUser.totalGames -= 1;
            await pUser.save();
          }
          if (p.ctx) {
            try {
              await p.ctx.editMessageText(`⚠️ **በቂ ተጫዋች ባለመገኘቱ ጨዋታው ተሰርዟል! ገንዘብዎ ተመልሷል።**`);
            } catch (e) {}
          }
        }
        delete waitingRoom[cost];
        await TakenNumber.deleteMany({ gameId });
        return;
      }

      delete waitingRoom[cost];

      await BingoGame.findOneAndUpdate({ gameId }, { status: 'active' });

      let activeGameSessionId = 'active_' + Date.now() + '_' + cost;
      let roomPlayers = room.map(p => p.userId);
      
      let totalPool = cost * roomPlayers.length;
      let adminCommission = totalPool * 0.10; 
      let winnerReward = Math.round(totalPool - adminCommission); 

      let availableNumbers = Array.from({ length: 75 }, (_, i) => i + 1);
      let drawnHistory = [];

      let roomSession = {
        gameId: activeGameSessionId,
        cost,
        totalPool,
        winnerReward,
        roomPlayers,
        drawnHistory,
        availableNumbers,
        drawnNumber: null,
        gameActive: true
      };

      roomSessions[activeGameSessionId] = roomSession;

      for (let p of room) {
        activeGames[p.userId] = { 
          gameId: activeGameSessionId,
          matrix: p.matrix,
          userId: p.userId,
          messageId: p.messageId
        };
      }

      let roomInterval = setInterval(async () => {
        let session = roomSessions[activeGameSessionId];
        if (!session || !session.gameActive || session.availableNumbers.length === 0) {
          clearInterval(roomInterval);
          delete roomSessions[activeGameSessionId];
          await TakenNumber.deleteMany({ gameId });
          return;
        }

        let newNum = session.availableNumbers.splice(Math.floor(Math.random() * session.availableNumbers.length), 1)[0];
        session.drawnNumber = newNum;
        session.drawnHistory.push(newNum);

        let formattedHist = session.drawnHistory.map(n => getFormattedBingoNumber(n)).join(', ');
        let formattedCurrent = getFormattedBingoNumber(newNum);

        for (let pId of session.roomPlayers) {
          let userGame = activeGames[pId];
          if (userGame && userGame.gameId === activeGameSessionId) {
            if (userGame.messageId) {
              try {
                let messageText = 
                  `🎲 <b>ጨዋታ በሂደት ላይ... (ETB ${session.cost})</b>\n` +
                  `💰 አጠቃላይ ፖል: <b>ETB ${session.totalPool}</b> \vert{} ሽልማት: <b>ETB ${session.winnerReward}</b>\n\n` +
                  `🔴 <b><u>አሁን የተጠራው ቁጥር፦</u></b>\n\n` +
                  `📢 <b>[ ${formattedCurrent} ]</b> 📢\n\n` +
                  `📜 <b>የወጡ ቁጥሮች ታሪክ:</b>\n[ ${formattedHist} ]`;

                await bot.telegram.editMessageText(
                  pId,
                  userGame.messageId,
                  undefined,
                  messageText,
                  {
                    parse_mode: 'HTML',
                    ...getBingoKeyboard(userGame.matrix)
                  }
                );
              } catch (e) {}
            }
          }
        }
      }, 6000);
    }
  }, 1000);
}

const mainKeyboard = Markup.keyboard([
  ['🎮 ፕለይ (Play)'],
  ['🏆 የሳምንቱ አሸናፊዎች (Leaderboard)', '🔗 የኔ ሪፌራል ሊንክ (Referral)'],
  ['💰 ዲፖዚት (Deposit)', '💳 ዊዝድሮ (Withdraw)'],
  ['👤 ፕሮፋይል (Profile)', '💬 ኮሜንት (Comment)'],
  ['📖 መመሪያ (Instructions)']
]).resize();

const adminKeyboard = Markup.keyboard([
  ['📊 የአድሚን ባላንስ ማየት', '👥 የተጫዋቾች ዝርዝር (Player List)'],
  ['📥 የዲፖዚት/ዊዝድሮ ጥያቄዎች', '💬 የተጫዋቾች ኮሜንቶች'],
  ['🥇 የዕለቱ ከፍተኛ አሸናፊዎች', '🛡 የረዳት አድሚኖች ዝርዝር'],
  ['💵 አድሚን ዲፖዚት ማድረግ', '🎮 አድሚን መጫወቻ (Admin Play)'],
  ['🔗 የኔ ሪፌራል ሊንክ (Referral)', '🔙 ወደ ዋናው ሜኑ ተመለስ']
]).resize();

module.exports = {
  DAILY_WIN_GOAL,
  userSteps,
  activeGames,
  roomSessions,
  waitingRoom,
  kenoSessions,
  userSelectedBingoCost,
  seedAdminAccounts,
  isOwner,
  isAdmin,
  assignAdminToUser,
  getAssignedAdminPaymentInfo,
  getOrCreateUser,
  getKenoKeyboard,
  getKenoStatusText,
  getFormattedBingoNumber,
  getBingo1to75Keyboard,
  generateRandomBingoCard,
  getBingoKeyboard,
  checkWinCondition,
  runBingoQueue,
  mainKeyboard,
  adminKeyboard
};