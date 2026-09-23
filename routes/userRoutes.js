const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.get('/profile', async (req, res) => {
  try {
    let userId = req.query.userId;
    const initDataRaw = req.headers['x-telegram-init-data'];
    if (!userId && initDataRaw) {
      const params = new URLSearchParams(initDataRaw);
      const userStr = params.get('user');
      if (userStr) {
        try {
          const parsedUser = JSON.parse(userStr);
          userId = parsedUser.id;
        } catch (e) {}
      }
    }

    if (!userId) {
      return res.status(400).json({ success: false, message: 'የተጠቃሚ ID አልተላከም' });
    }

    const user = await User.findOne({ userId: Number(userId) });
    if (!user) {
      return res.status(404).json({ success: false, message: 'ተጫዋች አልተገኘም' });
    }

    return res.json({
      success: true,
      user: {
        telegramId: user.userId,
        userName: user.userName || 'ተጫዋች',
        balance: Number(user.balance) || 0,
        dailyWins: user.dailyWins || 0,
        level: user.level || 1,
        wins: user.wins || 0,
        totalGames: user.totalGames || 0
      }
    });
  } catch (error) {
    console.error("Profile Endpoint Error:", error);
    res.status(500).json({ success: false, message: 'Server error: ' + error.message });
  }
});

router.get('/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    let user = await User.findOne({ userId });
    if (!user) {
      return res.status(404).json({ success: false, message: 'ተጠቃሚ አልተገኘም' });
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;