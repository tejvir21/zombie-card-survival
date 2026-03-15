'use strict';
const express     = require('express');
const router      = express.Router();
const Leaderboard = require('../models/Leaderboard');

// GET /api/leaderboard  — top 50 by score
router.get('/', async (_req, res) => {
  try {
    const board = await Leaderboard
      .find()
      .sort({ score: -1 })
      .limit(50)
      .select('username wins kills infections matchesPlayed score');
    res.json(board);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
