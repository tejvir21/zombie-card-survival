'use strict';
const express = require('express');
const router  = express.Router();
const Match   = require('../models/Match');

// GET /api/matches  — last 20 finished matches
router.get('/', async (_req, res) => {
  try {
    const matches = await Match
      .find({ status: 'ended' })
      .sort({ createdAt: -1 })
      .limit(20)
      .select('-events');
    res.json(matches);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/matches/:id  — single match (with event log)
router.get('/:id', async (req, res) => {
  try {
    const match = await Match.findOne({ matchId: req.params.id });
    if (!match) return res.status(404).json({ error: 'Match not found' });
    res.json(match);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
