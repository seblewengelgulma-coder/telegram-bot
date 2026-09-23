const User = require('../models/User');
const RequestModel = require('../models/Request');
const CommentModel = require('../models/Comment');
const { bot, OWNER_ID } = require('./botInstance');
const { isAdmin, userSteps, getOrCreateUser } = require('./helpers');

function registerTextAndPhotoHandlers(bot) {
  bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'ተጫዋች';
    let photo = ctx.message.photo[ctx.message.photo.length - 1];
    let photoId = photo.file_id;

    if (isAdmin(userId) && userSteps[userId] && userSteps[userId].action === 'admin_reply_comment') {
      let commentId = userSteps[userId].commentId;
      let replyText = ctx.message.caption || '📷 (ፎቶ ተልኳል)';

      let comment = await CommentModel.findById(commentId);
      if (comment) {
        comment.adminReply = replyText;
        comment.adminPhotoId = photoId;
        await comment.save();

        bot.telegram.sendPhoto(comment.userId, photoId, {
          caption: `💬 **ከአድሚን ምላሽ ደርሶዎታል!**\n\n📌 **የእርስዎ ጥያቄ:** "${comment.message}"\n✍️ **የአድሚን ምላሽ:** ${replyText}`
        }).catch(()=>{});

        ctx.reply(`✅ ምላሽዎ በፎቶ ለተጫዋቹ ተልኳል!`);
      }
      delete userSteps[userId];
      return;
    }

    if (userSteps[userId] && userSteps[userId].action === 'comment_waiting') {
      let user = await getOrCreateUser(userId);
      let captionText = ctx.message.caption || '📷 (ፎቶ ኮሜንት)';

      const assignedAdminId = user.assignedAdminId || OWNER_ID;

      let newComment = new CommentModel({
        userId,
        assignedAdminId,
        userName,
        message: captionText,
        photoId
      });
      await newComment.save();

      bot.telegram.sendPhoto(assignedAdminId, photoId, {
        caption: `💬 **አዲስ አስተያየት በፎቶ!**\n\n👤 **ከ:** ${userName} (ID: \`${userId}\`)\n💬 **መልእክት:** ${captionText}`,
        parse_mode: 'Markdown'
      }).catch(()=>{});

      delete userSteps[userId];
      return ctx.reply(`✅ አስተያየትዎ በፎቶ ለአድሚን ተልኳል! እናመሰግናለን።`);
    }
  });

  bot.on('text', async (ctx, next) => {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || 'ተጫዋች';
    const text = ctx.message.text;

    if (!userSteps[userId]) return next();

    let step = userSteps[userId];

    if (step.action === 'deposit_amount') {
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply(`⚠️ እባክዎ ትክክለኛ የብር መጠን በቁጥር ብቻ ያስገቡ:`);
      }

      userSteps[userId] = { action: 'deposit_details', amount };
      return ctx.reply(
        `📌 **ደረጃ 2 (መጨረሻ):**\n\n` +
        `እባክዎ **የክፍያ ትራንዛክሽን ቁጥር (Transaction ID)** ወይም የላኩበትን አጭር የጽሑፍ መረጃ ይጻፉ:`,
        { parse_mode: 'Markdown' }
      );
    }

    if (step.action === 'deposit_details') {
      let amount = step.amount;
      let transactionDetails = text;

      let user = await getOrCreateUser(userId);
      const assignedAdminId = user.assignedAdminId || OWNER_ID;

      let newReq = new RequestModel({
        userId,
        assignedAdminId,
        userName,
        type: 'deposit',
        amount,
        details: transactionDetails
      });
      await newReq.save();

      bot.telegram.sendMessage(
        assignedAdminId,
        `📥 **አዲስ የዲፖዚት ጥያቄ (ከቦት)!**\n\n` +
        `👤 **ስም:** ${userName} (ID: \`${userId}\`)\n` +
        `💰 **መጠን:** ETB ${amount}\n\n` +
        `📄 **የትራንዛክሽን መረጃ:**\n\`${transactionDetails}\``,
        { parse_mode: 'Markdown' }
      ).catch(()=>{});

      delete userSteps[userId];
      return ctx.reply(`✅ የ ${amount} ETB የዲፖዚት ጥያቄዎ ለአድሚን ተልኳል! ማረጋገጫ ሲጠናቀቅ ባላንስዎ ይጨመራል።`);
    }

    if (step.action === 'withdraw_amount') {
      let amount = parseFloat(text);
      if (isNaN(amount) || amount <= 0) {
        return ctx.reply(`⚠️ እባክዎ ትክክለኛ የብር መጠን በቁጥር ብቻ ያስገቡ:`);
      }

      let user = await getOrCreateUser(userId);
      if (user.balance < amount) {
        delete userSteps[userId];
        return ctx.reply(`❌ በቂ ባላንስ የለዎትም! ያሎት ባላንስ: **ETB ${user.balance}** ነው`);
      }

      user.balance -= amount;
      await user.save();

      const assignedAdminId = user.assignedAdminId || OWNER_ID;

      let newReq = new RequestModel({
        userId,
        assignedAdminId,
        userName,
        type: 'withdraw',
        amount,
        details: user.phone || 'N/A'
      });
      await newReq.save();

      bot.telegram.sendMessage(
        assignedAdminId,
        `📥 **አዲስ የዊዝድሮ ጥያቄ!**\n\n` +
        `👤 **ስም:** ${userName} (ID: \`${userId}\`)\n` +
        `💰 **መጠን:** ETB ${amount}\n` +
        `📱 **ስልክ:** \`${user.phone}\``,
        { parse_mode: 'Markdown' }
      ).catch(()=>{});

      delete userSteps[userId];
      return ctx.reply(`✅ የ ${amount} ETB የገንዘብ ማውጣት ጥያቄዎ ተልኳል! ለአድሚን ተመርምሮ በተመዘገበው ስልክዎ ይላካል።`);
    }

    if (step.action === 'comment_waiting') {
      let user = await getOrCreateUser(userId);
      const assignedAdminId = user.assignedAdminId || OWNER_ID;

      let newComment = new CommentModel({
        userId,
        assignedAdminId,
        userName,
        message: text
      });
      await newComment.save();

      bot.telegram.sendMessage(
        assignedAdminId,
        `💬 **አዲስ አስተያየት!**\n\n👤 **ከ:** ${userName} (ID: \`${userId}\`)\n💬 **መልእክት:** "${text}"`,
        { parse_mode: 'Markdown' }
      ).catch(()=>{});

      delete userSteps[userId];
      return ctx.reply(`✅ አስተያየትዎ ለአድሚን ተልኳል! እናመሰግናለን።`);
    }

    if (step.action === 'admin_deposit_id') {
      let targetUserId = parseInt(text);
      let targetUser = await User.findOne({ userId: targetUserId });
      if (!targetUser) {
        delete userSteps[userId];
        return ctx.reply(`❌ ተጫዋቹ አልተገኘም!`);
      }

      userSteps[userId] = { action: 'admin_deposit_amount', targetUserId };
      return ctx.reply(`💵 ለ **${targetUser.userName}** (ID: \`${targetUserId}\`) ገቢ የሚደረገውን የብር መጠን ያስገቡ:`, { parse_mode: 'Markdown' });
    }

    if (step.action === 'admin_deposit_amount') {
      let amount = parseFloat(text);
      let targetUserId = step.targetUserId;
      let targetUser = await User.findOne({ userId: targetUserId });

      if (targetUser) {
        targetUser.balance += amount;
        await targetUser.save();

        bot.telegram.sendMessage(targetUserId, `🎉 በአድሚን **ETB ${amount}** አካውንትዎ ላይ ገቢ ሆኗል!`).catch(()=>{});
        ctx.reply(`✅ ለ **${targetUser.userName}** ETB ${amount} በውጤታማነት ገቢ ሆኗል!`);
      }

      delete userSteps[userId];
      return;
    }

    if (step.action === 'admin_reply_comment') {
      let commentId = step.commentId;
      let comment = await CommentModel.findById(commentId);
      if (comment) {
        comment.adminReply = text;
        await comment.save();

        bot.telegram.sendMessage(
          comment.userId,
          `💬 **ከአድሚን ምላሽ ደርሶዎታል!**\n\n📌 **የእርስዎ ጥያቄ:** "${comment.message}"\n✍️ **የአድሚን ምላሽ:** ${text}`
        ).catch(()=>{});

        ctx.reply(`✅ ምላሽዎ ለተጫዋቹ ተልኳል!`);
      }
      delete userSteps[userId];
      return;
    }

    return next();
  });
}

module.exports = registerTextAndPhotoHandlers;