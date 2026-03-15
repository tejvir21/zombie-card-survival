'use strict';
const mongoose = require('mongoose');

const PlayerCardSchema = new mongoose.Schema(
  {
    matchId      : { type: String, required: true, index: true },
    playerId     : { type: String, required: true },
    card         : { type: String, enum: ['zombie','vaccine','gun','normal'], required: true },
    acquiredAt   : { type: Date, default: Date.now },
    usedAt       : Date,
    transferredTo: String,
  },
  { timestamps: true }
);

PlayerCardSchema.index({ matchId: 1, playerId: 1 });

module.exports = mongoose.model('PlayerCard', PlayerCardSchema);
