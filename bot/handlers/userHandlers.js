const { Markup } = require('telegraf');
const User = require('../../models/User');
const { bot, isAdmin, isOwner } = require('../botInstance');
const { 
  getOrCreateUser, 
  assignAdminToUser, 
  getAssignedAdminPaymentInfo, 
  userSteps, 
  mainKeyboard, 
  adminKeyboard,
  DAILY_WIN_GOAL 
} = require('../helpers');

function registerUserHandlers(bot) {
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'ተጫዋች';

    let startPayload = ctx.message.text.split(' ')[1] || '';
    let referrerId = null;
    if (startPayload.startsWith('ref_')) {
      referrerId = parseInt(startPayload.replace('ref_', ''));
    }
    
    let user = await User.findOne({ userId });
    
    if (!user) {
      user = new User({ 
        userId, 
        userName, 
        balance: 20, 
        hasReceivedBonus: true 
      });
      await user.save();
    } else if (!user.hasReceivedBonus) {
      user.balance += 20;
      user.hasReceivedBonus = true;
      await user.save();
    }

    user = await assignAdminToUser(user, referrerId);

    if (isAdmin(userId)) {
      let roleTitle = isOwner(userId) ? '👑 የመስራች አድሚን (Super Admin)' : '🛡 ረዳት አድሚን (Sub-Admin)';
      return ctx.reply(`👋 **ሰላም ${userName}!**\nወደ ${roleTitle} ፓነል በደህና መጡ።`, adminKeyboard);
    }

    if (!user.phone) {
      let bonusNotice = user.hasReceivedBonus ? `\n\n🎁 **እንኳን ደስ አለዎት! ለአዲስ ተጠቃሚ የሚሆን የ 20 ብር ቦነስ አግኝተዋል!**` : ``;
      return ctx.reply(
        `🎲 **እፉዬ ጨዋታዎች ማዕከል** - እንኳን ደህና መጡ ${userName}!${bonusNotice}\n\nቦቱን ለመጠቀም እባክዎ ከታች ያለውን አዝራር በመጫን **ስልክ ቁጥርዎን** ያጋሩ:`,
        Markup.keyboard([[Markup.button.contactRequest('📱 ስልክ ቁጥር አጋራ (Share Contact)')]]).resize()
      );
    }

    let bonusNotice = `\n\n🎁 (የእንኳን ደህና መጡ 20 ብር ቦነስ ተሰጥቶዎታል!)`;
    await ctx.reply(`🎲 **እፉዬ ጨዋታዎች ማዕከል** - እንኳን ደህና መጡ እንደገና ${userName}!${bonusNotice}\n\nእባክዎ የሚፈልጉትን አማራጭ ከታች ካለው ሜኑ ይምረጡ።`, mainKeyboard);
  });

  bot.hears('🔗 የኔ ሪፌራል ሊንክ (Referral)', async (ctx) => {
    const userId = ctx.from.id;
    const botUsername = ctx.botInfo.username;
    
    let user = await getOrCreateUser(userId);
    user = await assignAdminToUser(user);

    let targetReferrerId = isAdmin(userId) ? userId : user.assignedAdminId;
    
    const refLink = `https://t.me/${botUsername}?start=ref_${targetReferrerId}`;

    let msg = `🔗 **የእርስዎ የጋበዣ ሊንክ (Referral Link):**\n\n` +
              `\`${refLink}\`\n\n` +
              `📌 **ይህንን ሊንክ ለጓደኞችዎ በማጋራት ሰዎችን መጋበዝ ይችላሉ!**`;

    ctx.reply(msg, { parse_mode: 'Markdown' });
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

  bot.hears('🏆 የሳምንቱ አሸናፊዎች (Leaderboard)', async (ctx) => {
    const userId = ctx.from.id;
    let user = await getOrCreateUser(userId);

    let topPlayers = await User.find({ qualifiedDays: { $gt: 0 } })
                               .sort({ weeklyWins: -1 })
                               .limit(10);

    let statusMsg = user.dailyWins >= DAILY_WIN_GOAL 
      ? `✅ **የዛሬው ብቃት:** ተሟልቷል (${user.dailyWins}/${DAILY_WIN_GOAL} ድል)` 
      : `⏳ **የዛሬው ብቃት:** ገና አልተሟላም (${user.dailyWins}/${DAILY_WIN_GOAL} ድል - ${DAILY_WIN_GOAL - user.dailyWins} ድል ይረዎታል)`;

    let leaderMsg = `🏆 **የአሸናፊዎች አሸናፊ ቶርናመንት**\n` +
                    `📌 *ለቶርናመንቱ ለማለፍ በቀን ቢያንስ ${DAILY_WIN_GOAL} ጊዜ ማሸነፍ ግዴታ ነው!*\n\n` +
                    `${statusMsg}\n` +
                    `-----------------------------------\n`;

    if (topPlayers.length === 0) {
      leaderMsg += `\nእስካሁን ለሳምንቱ ቶርናመንት ብቁ የሆነ ተጫዋች የለም። ዛሬ 3 ጊዜ በማሸነፍ የመጀመሪያው ይሁኑ!`;
    } else {
      topPlayers.forEach((player, index) => {
        let badge = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🎖';
        leaderMsg += `${badge} **${index + 1}.${player.userName}** — ${player.weeklyWins} ነጥብ (${player.qualifiedDays} ቀን ብቁ ሆኗል)\n`;
      });
    }

    ctx.reply(leaderMsg, { parse_mode: 'Markdown' });
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

    user = await assignAdminToUser(user);
    const paymentInfo = await getAssignedAdminPaymentInfo(user.assignedAdminId);

    userSteps[userId] = { action: 'deposit_amount' };
    ctx.reply(
      `${paymentInfo}💰 እባክዎ **ሊያስገቡት የሚፈልጉትን የብር መጠን** ቁጥር ብቻ ይጻፉ:`, 
      { parse_mode: 'Markdown' }
    );
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
    ctx.reply(
      `💳 **የገንዘብ ማውጣት ጥያቄ (Withdrawal)**\n\n` +
      `📱 መቀበያ ስልክ ቁጥርዎ: **${user.phone}** (በተመዘገበው ቁጥር ይላካል)\n\n` +
      `💰 ማውጣት የሚፈልጉትን **የብር መጠን** ብቻ ቁጥር አድርገው ይጻፉ:`,
      { parse_mode: 'Markdown' }
    );
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
      `🔥 የዛሬ ድል: ${user.dailyWins}/${DAILY_WIN_GOAL}\n` +
      `🎖 የሳምንቱ ነጥብ: ${user.weeklyWins}\n` +
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
      `1. ዲፖዚት በመጫን ገንዘብ ገቢ በማድረግ የትራንዛክሽን መረጃውን ይላኩ።\n` +
      `2. ፕለይ በመጫን **ቢንጎ** ወይም **ኬኖ** መጫወት ይችላሉ።\n` +
      `3. በየቀኑ ቢያንስ 3 ጊዜ በማሸነፍ ወደ ሳምንታዊው **የአሸናፊዎች አሸናፊ** ቶርናመንት ይቀላቀሉ!`
    );
  });
}

module.exports = registerUserHandlers;