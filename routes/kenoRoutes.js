const express = require('express');
const router = express.Router();
const User = require('../models/User');

router.post('/play', async (req, res) => {
  try {
    const { userId, betAmount, selectedNumbers } = req.body;
    
    if (!userId || !selectedNumbers || selectedNumbers.length === 0) {
      return res.status(400).json({ success: false, message: 'እባክዎ የተሟላ ዳታ ይላኩ!' });
    }

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
    }

    user.balance -= Number(betAmount);
    user.totalGames += 1;

    if (winAmount > 0) {
      user.balance += winAmount;
      user.wins += 1;
      user.dailyWins += 1;
      user.level += 1;
    } else {
      user.losses += 1;
    }

    await user.save();

    return res.json({
      success: true,
      drawnNumbers,
      matchesCount: matchCount,
      winAmount,
      newBalance: user.balance
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;