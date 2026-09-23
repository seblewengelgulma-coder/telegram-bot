const { Markup } = require('telegraf');
const { bot } = require('../botInstance');
const { 
  getOrCreateUser, 
  getKenoKeyboard, 
  getKenoStatusText, 
  isAdmin, 
  kenoSessions, 
  DAILY_WIN_GOAL 
} = require('../helpers');

function registerKenoHandlers(bot) {
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

    if (!isAdmin(userId) && user.balance < betAmount) {
      return ctx.answerCbQuery(`❌ በቂ ባላንስ የለዎትም! (የሚጠበቀው: ETB ${betAmount})`, { show_alert: true });
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
      `• **1 ቁጥር መርጦ:** 0.5x\n` +
      `• **2 ቁጥር መርጦ:** 1.2x\n` +
      `• **3 ቁጥር መርጦ:** 1.6x\n` +
      `• **4 ቁጥር መርጦ:** 2.2x\n` +
      `• **5 ቁጥር መርጦ:** 2.8x\n` +
      `• **6 ቁጥር መርጦ:** 3.5x\n` +
      `• **7 ቁጥር መርጦ:** 4.5x\n` +
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

    if (!isAdmin(userId) && user.balance < betAmount) {
      return ctx.answerCbQuery('❌ በቂ ባላንስ የለዎትም!', { show_alert: true });
    }

    if (!isAdmin(userId)) {
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
        let isRefund = false;
        let selectedCount = session.selectedNumbers.length;

        if (matchCount === selectedCount) {
          let multiplier = 0;
          if (selectedCount === 10) { multiplier = 20; }
          else if (selectedCount === 9) { multiplier = 10; }
          else if (selectedCount === 8) { multiplier = 6; }
          else if (selectedCount === 7) { multiplier = 4.5; }
          else if (selectedCount === 6) { multiplier = 3.5; }
          else if (selectedCount === 5) { multiplier = 2.8; }
          else if (selectedCount === 4) { multiplier = 2.2; }
          else if (selectedCount === 3) { multiplier = 1.6; }
          else if (selectedCount === 2) { multiplier = 1.2; }
          else if (selectedCount === 1) { multiplier = 0.5; }

          winAmount = Math.round(betAmount + (betAmount * multiplier));
        } 
        else if (selectedCount === 4 && matchCount === 2) {
          winAmount = Math.round(betAmount + (betAmount * 1.05));
        }
        else if (selectedCount === 3 && matchCount === 2) {
          winAmount = Math.round(betAmount + (betAmount * 1.2));
        }
        else if (selectedCount === 2 && matchCount === 1) {
          isRefund = true;
          winAmount = betAmount;
        }

        let resultMsg = "";
        let keyboardOptions = [];

        if (winAmount > 0) {
          if (!isAdmin(userId)) {
            user.balance += winAmount;
            if (!isRefund) {
              user.wins += 1;
              user.dailyWins += 1; 

              if (user.dailyWins === DAILY_WIN_GOAL) {
                user.qualifiedDays += 1;
                bot.telegram.sendMessage(
                  userId, 
                  `🔥 **እንኳን ደስ አሎት!** ዛሬ ${DAILY_WIN_GOAL} ጊዜ በማሸነፍዎ ወደ **ሳምንቱ የአሸናፊዎች ቶርናመንት** በብቃት ተቀላቅለዋል!`
                ).catch(() => {});
              }

              if (user.dailyWins >= DAILY_WIN_GOAL) {
                user.weeklyWins += 1;
              }

              user.level += 1;
            }
            await user.save();
          }

          if (isRefund) {
            resultMsg = `🔄 **ገንዘብዎ ተመልሷል (Refund)!**\n\n` +
              `🎯 የመረጧቸው: [ ${session.selectedNumbers.sort((a,b)=>a-b).join(', ')} ]\n` +
              `✨ የገጠሙት: **${matchCount}** ከ ${selectedCount}\n` +
              `💰 ተመላሽ የተደረገው ገንዘብ: **ETB ${winAmount}**\n\n` +
              `💼 ባላንስዎ: **ETB ${user.balance}**`;
          } else {
            resultMsg = `🎉 **እንኳን ደስ አሎት! አሸንፈዋል!** 🏆\n\n` +
              `🎯 የመረጧቸው: [ ${session.selectedNumbers.sort((a,b)=>a-b).join(', ')} ]\n` +
              `✨ ግጥሚያዎች: **${matchCount}/${selectedCount}**\n` +
              `💰 ያሸነፉት ጠቅላላ ገንዘብ: **ETB ${winAmount}**\n\n` +
              `💼 ባላንስዎ: **ETB ${user.balance}**`;
          }

          keyboardOptions = [
            [Markup.button.callback('🎮 እንደገና ጫወት (Play Again)', 'select_keno')],
            [Markup.button.callback('🔙 ወደ ዋናው ሜኑ', 'back_to_main_menu')]
          ];
        } else {
          if (!isAdmin(userId)) {
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
}

module.exports = registerKenoHandlers;