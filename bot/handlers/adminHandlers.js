const { Markup } = require('telegraf');
const User = require('../../models/User');
const AdminAccount = require('../../models/AdminAccount');
const RequestModel = require('../../models/Request');
const CommentModel = require('../../models/Comment');
const { OWNER_ID, subAdmins } = require('../botInstance');
const { isAdmin, isOwner, userSteps, adminKeyboard, getOrCreateUser, DAILY_WIN_GOAL } = require('../helpers');

function registerAdminHandlers(bot) {

  // 1. የረዳት አድሚን የክፍያ መረጃ መመዝገቢያ
  bot.command('addadminaccount', async (ctx) => {
    try {
      if (!isOwner(ctx.from.id)) {
        return ctx.reply('❌ ይህንን ለማድረግ የመስራች (Super Admin) ስልጣን ያስፈልግዎታል!');
      }

      const args = ctx.message.text.split(' ').slice(1);
      if (args.length < 4) {
        return ctx.reply('⚠️ እባክዎ መረጃውን በትክክል ያስገቡ! \nምሳሌ፦ `/addadminaccount 987654321 አበበ 0911223344 1000123456789`', { parse_mode: 'Markdown' });
      }

      const adminId = parseInt(args[0]);
      const adminName = args[1];
      const telebirr = args[2];
      const cbeAccount = args[3];

      await AdminAccount.findOneAndUpdate(
        { adminId },
        { adminId, adminName, telebirr, cbeAccount, isActive: true },
        { upsert: true, returnDocument: 'after' }
      );

      if (!subAdmins.includes(adminId)) {
        subAdmins.push(adminId);
      }

      ctx.reply(`✅ የረዳት አድሚን **${adminName}** (ID: \`${adminId}\`) የክፍያ መረጃ በተሳካ ሁኔታ ተመዝግቧል!`, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error in addadminaccount:', error);
      ctx.reply('❌ አድሚን ሲመዘገብ ስህተት ተከስቷል።');
    }
  });

  // 2. አድሚን መጨመሪያ
  bot.command('addadmin', (ctx) => {
    try {
      if (!isOwner(ctx.from.id)) {
        return ctx.reply('❌ ይህንን ለማድረግ የመስራች (Super Admin) ስልጣን ያስፈልግዎታል!');
      }
      let targetId = parseInt(ctx.message.text.split(' ')[1]);
      if (targetId && !subAdmins.includes(targetId)) {
        subAdmins.push(targetId);
        return ctx.reply(`✅ ዩዘር ID \`${targetId}\` ያለው አዲስ ረዳት አድሚን ተጨምሯል!`, { parse_mode: 'Markdown' });
      }
      ctx.reply('⚠️ እባክዎ ትክክለኛ ID ያስገቡ። ምሳሌ፦ `/addadmin 123456789`');
    } catch (error) {
      console.error('Error in addadmin:', error);
    }
  });

  // 3. አድሚን ማስወገጃ
  bot.command('removeadmin', (ctx) => {
    try {
      if (!isOwner(ctx.from.id)) {
        return ctx.reply('❌ ይህንን ለማድረግ የመስራች (Super Admin) ስልጣን ያስፈልግዎታል!');
      }
      let targetId = parseInt(ctx.message.text.split(' ')[1]);
      let index = subAdmins.indexOf(targetId);
      if (index !== -1) {
        subAdmins.splice(index, 1);
      }
      ctx.reply(`🗑 ዩዘር ID \`${targetId}\` ከረዳት አድሚንነት ተወግዷል!`, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error in removeadmin:', error);
    }
  });

  // 4. የአድሚን ባላንስ ማየት
  bot.hears('📊 የአድሚን ባላንስ ማየት', async (ctx) => {
    try {
      if (!isAdmin(ctx.from.id)) return;
      let users = await User.find();
      let totalCompanyBalance = users.reduce((sum, u) => sum + (u.balance || 0), 0);
      ctx.reply(`📊 **የአድሚን ባላንስ እና ስታቲስቲክስ**\n\n👥 አጠቃላይ ተጫዋቾች: ${users.length} ሰው\n💰 የተጫዋቾች አጠቃላይ ባላንስ: ETB ${totalCompanyBalance}`, adminKeyboard);
    } catch (error) {
      console.error('Error in admin balance:', error);
    }
  });

  // 5. የተጫዋቾች ዝርዝር ፋንክሽን
  async function sendPlayerList(ctx, page = 1) {
    try {
      const limit = 5; 
      const skip = (page - 1) * limit;

      const totalUsers = await User.countDocuments();
      const totalPages = Math.ceil(totalUsers / limit) || 1;
      const users = await User.find().sort({ _id: -1 }).skip(skip).limit(limit);

      if (users.length === 0) {
        return ctx.reply('📭 እስካሁን የተመዘገበ ተጫዋች የለም።', adminKeyboard);
      }

      let messageText = `👥 **የተጫዋቾች ዝርዝር (ገጽ ${page} ከ ${totalPages})**\n` +
                        `📌 አጠቃላይ ተጫዋቾች: **${totalUsers}**\n\n`;

      users.forEach((u, index) => {
        messageText += `**${skip + index + 1}.${u.userName || 'ተጫዋች'}**\n` +
                       `   • 🆔 ID: \`${u.userId}\`\n` +
                       `   • 📱 ስልክ: ${u.phone || 'N/A'}\n` +
                       `   • 💰 ባላንስ: ETB ${u.balance || 0}\n\n`;
      });

      let navButtons = [];
      if (page > 1) {
        navButtons.push(Markup.button.callback('⬅️ Prev (ቀደመው)', `players_page_${page - 1}`));
      }
      if (page < totalPages) {
        navButtons.push(Markup.button.callback('Next (ቀጣይ) ➡️', `players_page_${page + 1}`));
      }

      let inlineNav = navButtons.length > 0 ? [navButtons] : [];

      if (ctx.callbackQuery) {
        await ctx.editMessageText(messageText, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineNav) }).catch(() => {});
      } else {
        await ctx.reply(messageText, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineNav) });
      }
    } catch (error) {
      console.error('Error in sendPlayerList:', error);
      ctx.reply('❌ የተጫዋቾች ዝርዝር በማምጣት ላይ ስህተት ተከስቷል።');
    }
  }

  bot.hears('👥 የተጫዋቾች ዝርዝር (Player List)', async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    await sendPlayerList(ctx, 1);
  });

  bot.action(/players_page_(\d+)/, async (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    const page = parseInt(ctx.match[1]);
    await ctx.answerCbQuery().catch(() => {});
    await sendPlayerList(ctx, page);
  });

  // 6. የረዳት አድሚኖች ዝርዝር ፋንክሽን
  async function sendAdminList(ctx, page = 1) {
    try {
      const limit = 5; 
      const skip = (page - 1) * limit;

      const totalAdmins = await AdminAccount.countDocuments();
      const totalPages = Math.ceil(totalAdmins / limit) || 1;
      const adminAccounts = await AdminAccount.find().sort({ _id: 1 }).skip(skip).limit(limit);

      if (adminAccounts.length === 0) {
        return ctx.reply('📭 እስካሁን ዳታቤዝ ውስጥ የተመዘገበ አድሚን የለም።', adminKeyboard);
      }

      const adminDetails = await Promise.all(
        adminAccounts.map(async (admin) => {
          const adminUserDoc = await User.findOne({ userId: admin.adminId });
          const playersCount = await User.countDocuments({ assignedAdminId: admin.adminId });

          return {
            ...admin.toObject(),
            balance: adminUserDoc ? (adminUserDoc.balance || 0) : 0,
            playersCount: playersCount || 0
          };
        })
      );

      let msg = `🛡 **የረዳት አድሚኖች ዝርዝር (ገጽ ${page} ከ ${totalPages})**\n` +
                `📌 አጠቃላይ የአድሚኖች ብዛት: **${totalAdmins}**\n\n`;

      adminDetails.forEach((admin, idx) => {
        let role = admin.adminId === OWNER_ID ? '👑 Owner (መስራች)' : '🛡 Sub-Admin (ረዳት)';
        let adminDisplayName = admin.adminName || 'Admin';
        msg += `**${skip + idx + 1}. ${adminDisplayName}** (${role})\n` +
               `   • 🆔 Telegram ID: \`${admin.adminId}\`\n` +
               `   • 💰 ባላንስ: **ETB ${admin.balance}**\n` +
               `   • 👥 በስሩ ያሉ ተጫዋቾች: **${admin.playersCount}** ተጫዋቾች\n` +
               `   • 📱 Telebirr: \`${admin.telebirr || 'የለም'}\`\n` +
               `   • 🏦 CBE Account: \`${admin.cbeAccount || 'የለም'}\`\n\n`;
      });

      let navButtons = [];
      if (page > 1) {
        navButtons.push(Markup.button.callback('⬅️ Prev (ቀደመው)', `admins_page_${page - 1}`));
      }
      if (page < totalPages) {
        navButtons.push(Markup.button.callback('Next (ቀጣይ) ➡️', `admins_page_${page + 1}`));
      }

      let inlineNav = navButtons.length > 0 ? [navButtons] : [];

      if (ctx.callbackQuery) {
        await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineNav) }).catch(() => {});
      } else {
        await ctx.reply(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineNav) });
      }
    } catch (error) {
      console.error('Error in sendAdminList:', error);
      ctx.reply('❌ የአድሚኖች ዝርዝር በማምጣት ላይ ስህተት ተከስቷል።');
    }
  }

  bot.hears('🛡 የረዳት አድሚኖች ዝርዝር', async (ctx) => {
    try {
      if (!isOwner(ctx.from.id)) {
        return ctx.reply('❌ ይህን መረጃ ማየት የሚችለው የመስራች አድሚን (Super Admin) ብቻ ነው!');
      }
      await sendAdminList(ctx, 1);
    } catch (error) {
      console.error('Error handling subadmin list command:', error);
    }
  });

  bot.action(/admins_page_(\d+)/, async (ctx) => {
    try {
      if (!isOwner(ctx.from.id)) return;
      const page = parseInt(ctx.match[1]);
      await ctx.answerCbQuery().catch(() => {});
      await sendAdminList(ctx, page);
    } catch (error) {
      console.error('Error in admins_page action:', error);
    }
  });

  // 7. የዕለቱ ከፍተኛ አሸናፊዎች
  bot.hears('🥇 የዕለቱ ከፍተኛ አሸናፊዎች', async (ctx) => {
    try {
      if (!isAdmin(ctx.from.id)) return;

      let topDailyWinners = await User.find({ dailyWins: { $gt: 0 } })
                                      .sort({ dailyWins: -1 })
                                      .limit(10);

      if (topDailyWinners.length === 0) {
        return ctx.reply('📭 ዛሬ እስካሁን ያሸነፈ ተጫዋች የለም።', adminKeyboard);
      }

      let reportMsg = `🥇 **የዕለቱ ከፍተኛ አሸናፊዎች (Daily Top Winners)**\n` +
                      `📅 ቀን: ${new Date().toLocaleDateString('en-US')}\n` +
                      `-----------------------------------\n\n`;

      topDailyWinners.forEach((player, index) => {
        let medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🎖';
        let qualificationStatus = player.dailyWins >= DAILY_WIN_GOAL 
          ? '✅ (ለሳምንቱ አልፏል)' 
          : `⏳ (ገና ${DAILY_WIN_GOAL - player.dailyWins} ድል ይቀረዋል)`;

        reportMsg += `${medal} **${index + 1}.${player.userName || 'ተጫዋች'}**\n` +
                     `   • ID: \`${player.userId}\`\n` +
                     `   • 📱 ስልክ: ${player.phone || 'N/A'}\n` +
                     `   • 🎯 የዛሬ ድል: **${player.dailyWins}**${qualificationStatus}\n` +
                     `   • 🏆 የሳምንቱ ነጥብ: ${player.weeklyWins || 0}\n\n`;
      });

      ctx.reply(reportMsg, { parse_mode: 'Markdown', ...adminKeyboard });
    } catch (error) {
      console.error('Error in daily winners:', error);
    }
  });

  // 8. የዲፖዚት/ዊዝድሮ ጥያቄዎች
  bot.hears('📥 የዲፖዚት/ዊዝድሮ ጥያቄዎች', async (ctx) => {
    try {
      if (!isAdmin(ctx.from.id)) return;
      
      let filter = {};
      if (ctx.from.id !== OWNER_ID) {
        filter = { assignedAdminId: ctx.from.id };
      }

      let reqs = await RequestModel.find(filter);
      if (reqs.length === 0) return ctx.reply('📭 ምንም የሚጠብቅ ጥያቄ የለም።', adminKeyboard);

      for (let r of reqs) {
        let msg = `📌 **አይነት:** ${r.type.toUpperCase()}\n👤 **ስም:** ${r.userName} (ID: \`${r.userId}\`)\n💰 **መጠን:** ETB ${r.amount}\n📱 **አካውንት/መረጃ:** \`${r.details}\``;
        
        let keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('✅ አጽድቅ', `approve_req_${r._id}`), Markup.button.callback('❌ ውድቅ አድርግ', `reject_req_${r._id}`)]
        ]);
        
        if (r.photoId) {
          await ctx.replyWithPhoto(r.photoId, { caption: msg, parse_mode: 'Markdown', ...keyboard }).catch(() => {});
        } else {
          await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard }).catch(() => {});
        }
      }
    } catch (error) {
      console.error('Error in requests handler:', error);
    }
  });

  // 9. የተጫዋቾች ኮሜንቶች
  bot.hears('💬 የተጫዋቾች ኮሜንቶች', async (ctx) => {
    try {
      if (!isAdmin(ctx.from.id)) return;
      
      let filter = {};
      if (!isOwner(ctx.from.id)) {
        filter = { assignedAdminId: ctx.from.id };
      }

      let comments = await CommentModel.find(filter).sort({ date: -1 }).limit(15);
      if (comments.length === 0) return ctx.reply('📭 ምንም አስተያየት የለም።', adminKeyboard);
      
      for (let c of comments) {
        let replyStatus = c.adminReply ? `\n✅ **ምላሽ:** ${c.adminReply}` : `\n❌ ምላሽ አልተሰጠበትም`;
        let msg = `📌 **ከ:** ${c.userName} (ID: \`${c.userId}\`)\n💬 **መልእክት:** "${c.message}"${replyStatus}`;
        let replyBtn = Markup.inlineKeyboard([[Markup.button.callback('✍️ ምላሽ ስጥ', `reply_comment_${c._id}`)]]);
        
        if (c.photoId) {
          await ctx.replyWithPhoto(c.photoId, { caption: msg, parse_mode: 'Markdown', ...replyBtn }).catch(() => {});
        } else {
          await ctx.reply(msg, { parse_mode: 'Markdown', ...replyBtn }).catch(() => {});
        }
      }
    } catch (error) {
      console.error('Error in comments handler:', error);
    }
  });

  // 10. አድሚን ዲፖዚት ማድረግ
  bot.hears('💵 አድሚን ዲፖዚት ማድረግ', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    userSteps[ctx.from.id] = { action: 'admin_deposit_id' };
    ctx.reply(`💵 ገንዘብ ገቢ ሊደረግለት የሚገባውን የተጫዋች **User ID** ያስገቡ:`);
  });

  // 11. አድሚን መጫወቻ
  bot.hears('🎮 አድሚን መጫወቻ (Admin Play)', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.reply(
      `🎮 **ለአድሚን የመጫወቻ መጠን ይምረጡ:**`,
      Markup.inlineKeyboard([
        [Markup.button.callback('Play 10 ETB', 'play_10'), Markup.button.callback('Play 20 ETB', 'play_20')],
        [Markup.button.callback('Play 50 ETB', 'play_50'), Markup.button.callback('Play 100 ETB', 'play_100')],
        [Markup.button.callback('🎲 ኬኖ ጨዋታ (Keno)', 'select_keno')]
      ])
    );
  });

  // 12. ወደ ዋና ሜኑ መመለሻ
  bot.hears('🔙 ወደ ዋናው ሜኑ ተመለስ', (ctx) => {
    if (!isAdmin(ctx.from.id)) return;
    ctx.reply('👑 ወደ አድሚን ዋና ሜኑ ተመልሰዋል።', adminKeyboard);
  });

  // 13. Actions (Callback Queries)
  bot.action(/ban_user_(\d+)/, async (ctx) => {
    try {
      if (!isAdmin(ctx.from.id)) return;
      let targetUserId = parseInt(ctx.match[1]);
      await User.findOneAndDelete({ userId: targetUserId });
      ctx.editMessageText(`✅ ዩዘር ID \`${targetUserId}\` ያለው ተጫዋች ተወግዷል!`, { parse_mode: 'Markdown' });
    } catch (error) {
      console.error('Error in ban_user action:', error);
    }
  });

  bot.action(/approve_req_(.+)/, async (ctx) => {
    try {
      if (!isAdmin(ctx.from.id)) return;
      let reqId = ctx.match[1];
      let req = await RequestModel.findById(reqId);
      if (!req) return ctx.answerCbQuery('❌ ጥያቄው አልተገኘም!').catch(() => {});

      let user = await getOrCreateUser(req.userId);
      if (req.type === 'deposit') {
        user.balance = (user.balance || 0) + req.amount;
        await user.save();
        bot.telegram.sendMessage(req.userId, `🎉 የ ${req.amount} ETB የዲፖዚት ጥያቄዎ ጸድቋል! 💰`).catch(()=>{});
      }

      if (!isOwner(ctx.from.id)) {
        bot.telegram.sendMessage(
          OWNER_ID, 
          `🔔 **የአድሚን እንቅስቃሴ ማሳወቂያ!**\n\n` +
          `👤 **አድሚን:** ${ctx.from.first_name} (ID: \`${ctx.from.id}\`)\n` +
          `✅ **የጸደቀው:** የ ${req.amount} ETB ${req.type.toUpperCase()}\n` +
          `🎯 **ለተጫዋች:** ${req.userName} (ID: \`${req.userId}\`)`,
          { parse_mode: 'Markdown' }
        ).catch(()=>{});
      }

      await RequestModel.findByIdAndDelete(reqId);
      ctx.editMessageText(`✅ ጥያቄው ጸድቋል!`);
    } catch (error) {
      console.error('Error in approve_req action:', error);
    }
  });

  bot.action(/reject_req_(.+)/, async (ctx) => {
    try {
      if (!isAdmin(ctx.from.id)) return;
      let reqId = ctx.match[1];
      let req = await RequestModel.findById(reqId);
      if (!req) return ctx.answerCbQuery('❌ ጥያቄው አልተገኘም!').catch(() => {});

      if (req.type === 'withdraw') {
        let user = await getOrCreateUser(req.userId);
        user.balance = (user.balance || 0) + req.amount;
        await user.save();
      }

      bot.telegram.sendMessage(req.userId, `❌ የ ${req.type.toUpperCase()} ጥያቄዎ ውድቅ ተደርቋል።`).catch(()=>{});
      await RequestModel.findByIdAndDelete(reqId);
      ctx.editMessageText(`❌ ጥያቄው ውድቅ ተደርቋል!`);
    } catch (error) {
      console.error('Error in reject_req action:', error);
    }
  });

  bot.action(/reply_comment_(.+)/, async (ctx) => {
    try {
      if (!isAdmin(ctx.from.id)) return;
      let commentId = ctx.match[1];
      userSteps[ctx.from.id] = { action: 'admin_reply_comment', commentId };
      ctx.answerCbQuery().catch(() => {});
      ctx.reply(`✍️ ለዚህ ኮሜንት የሚሰጡትን ምላሽ ይላኩ፦`);
    } catch (error) {
      console.error('Error in reply_comment action:', error);
    }
  });
}

module.exports = registerAdminHandlers;