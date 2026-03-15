'use strict';
const mongoose = require('mongoose');

const LeaderboardSchema = new mongoose.Schema(
  {
    playerId     : { type: String, required: true, unique: true, index: true },
    username     : { type: String, required: true },
    wins         : { type: Number, default: 0 },
    kills        : { type: Number, default: 0 },
    infections   : { type: Number, default: 0 },
    matchesPlayed: { type: Number, default: 0 },
    score        : { type: Number, default: 0 },
  },
  { timestamps: true }
);

LeaderboardSchema.index({ score: -1 });

module.exports = mongoose.model('Leaderboard', LeaderboardSchema);
