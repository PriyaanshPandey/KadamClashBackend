const mongoose = require('mongoose');

// User Schema
const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  }
}, {
  timestamps: true
});

// Territory Schema
const territorySchema = new mongoose.Schema({
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  geometry: {
    type: {
      type: String,
      enum: ['Polygon'],
      required: true,
      default: 'Polygon'
    },
    coordinates: {
      type: [[[Number]]],
      required: true
    }
  },
  area: {
    type: Number,
    required: true
  },
  bestTime: {
    type: Number,
    required: true
  },
  maxLaps: {
    type: Number,
    required: true
  },
  avgSpeed: {               // <-- new field
    type: Number,
    required: true
  }
}, {
  timestamps: true
});
    

// Create 2dsphere index
territorySchema.index({ geometry: '2dsphere' });

// Attempt Schema
const attemptSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  territoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Territory',
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  laps: {
    type: Number,
    required: true
  },
  avgSpeed: {
    type: Number,
    required: true
  }
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);
const Territory = mongoose.model('Territory', territorySchema);
const Attempt = mongoose.model('Attempt', attemptSchema);

module.exports = { User, Territory, Attempt };
