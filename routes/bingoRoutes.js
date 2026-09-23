const express = require('express');
const router = express.Router();
const User = require('../models/User');
const BingoGame = require('../models/BingoGame');
const TakenNumber = require('../models/TakenNumber');
const { 
  waitingRoom, 
  activeGames, 
  roomSessions, 
  generateRandomBingoCard, 
  getFormattedBingoNumber, 
  runBingoQueue, 
  isAdmin 
} = require('../bot/helpers');

router.post('/timeout', async (req, res) => {
  try {
    const { userId, gameId } = req.body;
    let game = await BingoGame.findOne({ gameId });
    if (game && game.status === 'waiting' && game.players.length < 2) {
      game.status = 'cancelled';
      await game.save();

      let user = await User.findOne({ userId: Number(userId) });
      if (user) {
        user.balance += game.cost;
        await user.save();
        return res.json({ success: true, newBalance: user.balance });
      }
    }
    res.json({ success: false, message: 'Already started or processed' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/pick', async (req, res) => {
  try {
    const { userId, cost, number } = req.body;
    if (!userId || !cost || !number) {
      return res.status(400).json({ success: false, message: 'ያልተሟላ መረጃ!' });
    }

    let user = await User.findOne({ userId: Number(userId) });
    if (!user || (!isAdmin(userId) && user.balance < Number(cost))) {
      return res.status(400).json({ success: false, message: 'በቂ ባላንስ የለዎትም!' });
    }

    let gameId = waitingRoom[cost]?.gameId || ('wait_' + cost + '_' + Date.now());
    let existing = await TakenNumber.findOne({ gameId, number: Number(number) });
    if (existing) {
      return res.status(400).json({ success: false, message: 'ይህ ቁጥር ተይዟል!' });
    }

    await TakenNumber.create({ gameId, number: Number(number), userId: Number(userId), userName: user.userName });

    if (!isAdmin(userId)) {
      user.balance -= Number(cost);
      user.totalGames += 1;
      await user.save();
    }

    let matrix = generateRandomBingoCard();
    if (!waitingRoom[cost]) {
      waitingRoom[cost] = { gameId, players: [] };
    }

    let isFirstInRoom = waitingRoom[cost].players.length === 0;
    let dispNum = getFormattedBingoNumber(Number(number));

    waitingRoom[cost].players.push({
      userId: Number(userId),
      matrix,
      cost: Number(cost),
      pickedNum: dispNum,
      fromMiniApp: true
    });

    await BingoGame.findOneAndUpdate(
      { gameId },
      { $set: { gameId, cost: Number(cost), status: 'waiting' }, $push: { players: Number(userId) } },
      { upsert: true, new: true }
    );

    if (isFirstInRoom) {
      runBingoQueue(cost, gameId);
    }

    return res.json({
      success: true,
      gameId,
      matrix,
      newBalance: user.balance,
      message: 'ቁጥሩ በተሳካ ሁኔታ ተመርጧል'
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const { userId, gameId } = req.query;
    let userGame = activeGames[userId];

    if (userGame) {
      let session = roomSessions[userGame.gameId];
      return res.json({
        success: true,
        status: 'active',
        currentBall: session ? getFormattedBingoNumber(session.drawnNumber) : '--',
        history: session ? session.drawnHistory.map(n => getFormattedBingoNumber(n)) : [],
        matrix: userGame.matrix
      });
    }

    let waiting = Object.values(waitingRoom).find(r => r.gameId === gameId);
    if (waiting) {
      return res.json({
        success: true,
        status: 'waiting',
        playersCount: waiting.players.length,
        pool: waiting.players.length * (waiting.players[0]?.cost || 10)
      });
    }

    return res.json({ success: true, status: 'none' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;