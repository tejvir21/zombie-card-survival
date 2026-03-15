'use strict';
const mongoose = require('mongoose');

const MatchSchema = new mongoose.Schema(
  {
    matchId     : { type: String, required: true, unique: true, index: true },
    status      : { type: String, enum: ['lobby', 'active', 'ended'], default: 'lobby' },
    playerIds   : [String],
    startTime   : Date,
    endTime     : Date,
    winCondition: { type: String, enum: ['zombies_win', 'humans_win', 'timeout', null], default: null },
    events      : [
      {
        type     : String,
        data     : mongoose.Schema.Types.Mixed,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    standings: [
      {
        playerId  : String,
        username  : String,
        status    : String,
        kills     : Number,
        infections: Number,
        rank      : Number,
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Match', MatchSchema);
