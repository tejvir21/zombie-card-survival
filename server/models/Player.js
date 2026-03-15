'use strict';
const mongoose = require('mongoose');

const PlayerSchema = new mongoose.Schema(
  {
    socketId     : { type: String, required: true, unique: true, index: true },
    username     : { type: String, required: true, trim: true, maxlength: 24 },
    lastSeen     : { type: Date, default: Date.now },
    totalMatches : { type: Number, default: 0 },
    totalWins    : { type: Number, default: 0 },
    totalKills   : { type: Number, default: 0 },
    totalInfect  : { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Player', PlayerSchema);
