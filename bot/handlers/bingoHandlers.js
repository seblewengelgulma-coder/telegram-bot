const { Markup } = require('telegraf');
const BingoGame = require('../../models/BingoGame');
const TakenNumber = require('../../models/TakenNumber');
const { bot } = require('../botInstance');
const { 
  getOrCreateUser, 
  getBingo1to75Keyboard, 
  getFormattedBingoNumber, 
  generateRandomBingoCard, 
  getBingoKeyboard, 
  checkWinCondition, 
  runBingoQueue, 
  isAdmin, 
  userSelectedBingoCost, 
  waitingRoom, 
  activeGames, 
  roomSessions, 
  DAILY_WIN_GOAL 
} = require('../helpers');

function registerBingoHandlers(bot) {
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
    const userId = ctx.from.id;
    const cost = parseInt(ctx.match[1]);
    let user = await getOrCreateUser(userId);

    if (!isAdmin(userId) && user.balance < cost) {
      return ctx.answerCbQuery(`❌ በቂ ባላንስ የለዎትም! (የሚጠበቀው: ETB ${cost}, ያሎት: ETB ${user.balance})`, { show_alert: true });
    }

    userSelectedBingoCost[userId] = cost;
    
    let waitingGameId = 'wait_' + cost + '_' + Date.now();
    if (!waitingRoom[cost]) {
      waitingRoom[cost] = { gameId: waitingGameId, players: [] };
    }

    await BingoGame.create({
      gameId: waitingGameId,
      cost: cost,
      status: 'waiting',
      players: []
    });

    let keyboard = await getBingo1to75Keyboard(waitingRoom[cost].gameId);
    ctx.editMessageText(
      `🎯 **የቢንጎ ጨዋታ (ETB ${cost})**\n\nከዚህ በታች ካሉት ቁጥሮች ውስጥ የሚፈልጉትን አንድ ቁጥር ይምረጡ ወይም ሚኒ አፕ በመጠቀም ይጫወቱ:`,
      keyboard
    );
  });

  bot.action(/b_taken_(\d+)/, async (ctx) => {
    const num = parseInt(ctx.match[1]);
    const dispNum = getFormattedBingoNumber(num);
    return ctx.answerCbQuery(`⚠️ ይቅርታ! ቁጥር ${dispNum} በሌላ ተጫዋች ተይዟል!`, { show_alert: true });
  });

  bot.action(/b_pick_(.+)_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'ተጫዋች';
    const gameId = ctx.match[1];
    const num = parseInt(ctx.match[2]);
    const dispNum = getFormattedBingoNumber(num);

    let cost = userSelectedBingoCost[userId] || 10;
    let user = await getOrCreateUser(userId);

    if (!isAdmin(userId) && user.balance < cost) {
      return ctx.answerCbQuery(`❌ በቂ ባላንስ የለዎትም! (ሒሳብዎ ${user.balance} ብር ነው)`, { show_alert: true });
    }

    try {
      let existing = await TakenNumber.findOne({ gameId, number: num });
      if (existing) {
        let updatedKb = await getBingo1to75Keyboard(gameId);
        await ctx.editMessageText(`⚠️ ይህ ቁጥር አሁን በሌላ ተጫዋች ተይዟል!`, updatedKb);
        return ctx.answerCbQuery(`❌ ቁጥሩ ተይዟል!`, { show_alert: true });
      }

      await TakenNumber.create({ gameId, number: num, userId, userName });

      if (!isAdmin(userId)) {
        user.balance -= cost;
        user.totalGames += 1;
        await user.save();
      }

      let matrix = generateRandomBingoCard();
      if (!waitingRoom[cost] || !waitingRoom[cost].players) {
        waitingRoom[cost] = { gameId, players: [] };
      }

      let isFirstInRoom = waitingRoom[cost].players.length === 0;

      waitingRoom[cost].players.push({ userId, ctx, matrix, cost, pickedNum: dispNum, messageId: ctx.callbackQuery.message.message_id });

      await BingoGame.findOneAndUpdate(
        { gameId },
        { $push: { players: userId } }
      );

      let currentPlayersCount = waitingRoom[cost].players.length;
      let estimatedPool = cost * currentPlayersCount;

      await ctx.editMessageText(
        `⏳ **ቁጥር ${dispNum} ተመርጧል! ተጫዋቾችን በመጠበቅ ላይ...**\n` +
        `⏱ የቀረው ጊዜ፡ **30 ሰከንድ**\n` +
        `👥 የተጫዋቾች ብዛት: **${currentPlayersCount}**\n` +
        `💰 አጠቃላይ ፖል (Pool): **ETB ${estimatedPool}**`,
        Markup.inlineKeyboard([])
      );

      if (isFirstInRoom) {
        runBingoQueue(cost, gameId);
      }

    } catch (e) {
      return ctx.answerCbQuery(`❌ ስህተት ተፈጥሯል!`, { show_alert: true });
    }
  });

  bot.action(/cell_(\d+)_(\d+)/, async (ctx) => {
    const userId = ctx.from.id;
    let userGame = activeGames[userId];
    if (!userGame) {
      return ctx.answerCbQuery('❌ ንቁ ጨዋታ የለዎትም!', { show_alert: true });
    }
    
    let session = roomSessions[userGame.gameId];
    if (!session || !session.gameActive) {
      return ctx.answerCbQuery('❌ ጨዋታው አልቋል ወይም ንቁ አይደለም!', { show_alert: true });
    }

    const r = parseInt(ctx.match[1]);
    const c = parseInt(ctx.match[2]);
    let cell = userGame.matrix[r][c];

    if (cell.isFree) return ctx.answerCbQuery('⭐ ይህ ነፃ ካርድ ነው!', { show_alert: true });

    if (session.drawnHistory.includes(cell.rawNum)) {
      cell.marked = !cell.marked;
      let formattedHist = session.drawnHistory.map(n => getFormattedBingoNumber(n)).join(', ');
      let formattedCurrent = getFormattedBingoNumber(session.drawnNumber);

      let messageText = 
        `🎲 <b>ጨዋታ በሂደት ላይ... (ETB ${session.cost})</b>\n` +
        `💰 አጠቃላይ ፖል: <b>ETB ${session.totalPool}</b> \vert{} ሽልማት: <b>ETB ${session.winnerReward}</b>\n\n` +
        `🔴 <b><u>አሁን የተጠራው ቁጥር፦</u></b>\n\n` +
        `📢 <b>[ ${formattedCurrent} ]</b> 📢\n\n` +
        `📜 <b>የወጡ ቁጥሮች ታሪክ:</b>\n[ ${formattedHist} ]`;

      ctx.editMessageText(
        messageText,
        {
          parse_mode: 'HTML',
          ...getBingoKeyboard(userGame.matrix)
        }
      ).catch(() => {});
    } else {
      let dispNum = getFormattedBingoNumber(cell.rawNum);
      return ctx.answerCbQuery(`❌ ይህ ቁጥር (${dispNum}) ገና አልተጠራም!`, { show_alert: true });
    }
  });

  bot.action('check_bingo', async (ctx) => {
    const userId = ctx.from.id;
    let userGame = activeGames[userId];
    if (!userGame) {
      return ctx.answerCbQuery('❌ ንቁ ጨዋታ የለም!', { show_alert: true });
    }

    let session = roomSessions[userGame.gameId];
    if (!session || !session.gameActive) {
      return ctx.answerCbQuery('❌ ጨዋታው ተጠናቋል!', { show_alert: true });
    }

    if (checkWinCondition(userGame.matrix)) {
      session.gameActive = false;

      let winnerUser = await getOrCreateUser(userId);
      winnerUser.balance += session.winnerReward;

      winnerUser.wins += 1;
      winnerUser.dailyWins += 1;

      if (winnerUser.dailyWins === DAILY_WIN_GOAL) {
        winnerUser.qualifiedDays += 1;
        bot.telegram.sendMessage(
          userId, 
          `🔥 **እንኳን ደስ አሎት!** ዛሬ ${DAILY_WIN_GOAL} ጊዜ በማሸነፍዎ ወደ **ሳምንቱ የአሸናፊዎች ቶርናመንት** በብቃት ተቀላቅለዋል!`
        ).catch(() => {});
      }

      if (winnerUser.dailyWins >= DAILY_WIN_GOAL) {
        winnerUser.weeklyWins += 1;
      }

      winnerUser.level += 1; 
      await winnerUser.save();

      for (let pId of session.roomPlayers) {
        delete activeGames[pId]; 
        let msg = (pId === userId) 
          ? `🎉 **እንኳን ደስ አሎት! BINGO ብለዋል!**\n💰 ያሸነፉት ሽልማት (10% አድሚን ተቆርጦ): **ETB ${session.winnerReward}**` 
          : `🏁 ጨዋታው አልቋል! ሌላ ተጫዋች አሸንፏል።`;
        bot.telegram.sendMessage(pId, msg).catch(()=>{});
      }

      delete roomSessions[session.gameId];
      await TakenNumber.deleteMany({ gameId: session.gameId });

      ctx.answerCbQuery('🏆 እንኳን ደስ አሎት!');
    } else {
      return ctx.answerCbQuery('❌ ገና BINGO አልሞሉም!', { show_alert: true });
    }
  });
}

module.exports = registerBingoHandlers;