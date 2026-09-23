const express = require('express');
const router = express.Router();
const User = require('../models/User');
const RequestModel = require('../models/Request');
const { bot, OWNER_ID } = require('../bot/botInstance');

router.post('/deposit', async (req, res) => {
  try {
    const { userId, amount, transactionDetails } = req.body;
    let user = await User.findOne({ userId: Number(userId) });
    if (!user) return res.status(404).json({ success: false, message: 'ተጠቃሚ አልተገኘም' });

    const assignedAdminId = user.assignedAdminId || OWNER_ID;
    const newReq = new RequestModel({
      userId: Number(userId),
      assignedAdminId,
      userName: user.userName,
      type: 'deposit',
      amount: Number(amount),
      details: transactionDetails || 'Mini App Deposit'
    });
    await newReq.save();

    await bot.telegram.sendMessage(assignedAdminId, 
      `📥 **አዲስ የዲፖዚት ጥያቄ (ከMini App)!**\n\n👤 **ስም:** ${user.userName} (ID: \`${userId}\`)\n💰 **መጠን:** ETB ${amount}\n\n📄 **የትራንዛክሽን መረጃ:**\n${transactionDetails || 'N/A'}`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    res.json({ success: true, message: 'ጥያቄዎ ለአድሚን ተልኳል' });
  } catch (err) {
    console.error('Deposit Error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/withdraw', async (req, res) => {
  try {
    const { userId, amount, phone } = req.body;
    let user = await User.findOne({ userId: Number(userId) });
    
    if (!user || user.balance < Number(amount)) {
      return res.status(400).json({ success: false, message: 'በቂ ባላንስ የለዎትም!' });
    }

    user.balance -= Number(amount);
    await user.save();

    const assignedAdminId = user.assignedAdminId || OWNER_ID;
    const newReq = new RequestModel({
      userId: Number(userId),
      assignedAdminId,
      userName: user.userName,
      type: 'withdraw',
      amount: Number(amount),
      details: phone || user.phone || 'N/A'
    });
    await newReq.save();

    bot.telegram.sendMessage(assignedAdminId, 
      `📥 **አዲስ የዊዝድሮ ጥያቄ (ከMini App)!**\n\n👤 **ስም:** ${user.userName} (ID: \`${userId}\`)\n💰 **መጠን:** ETB ${amount}\n📱 **ስልክ:** ${phone || user.phone}`,
      { parse_mode: 'Markdown' }
    ).catch(() => {});

    res.json({ success: true, balance: user.balance, message: 'የዊዝድሮ ጥያቄዎ ተልኳል' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;