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
  timestamps: true // automatically adds createdAt and updatedAt
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
      required: true
    },
    coordinates: {
      type: [[[Number]]], // Array of arrays of arrays of numbers
      required: true
    }
  },
  area: {
    type: Number,
    required: true
  },
  bestTime: {
    type: Number,
    required: true,
    min: 0
  },
  maxLaps: {
    type: Number,
    required: true,
    min: 1
  }
}, {
  timestamps: true
});

// Create 2dsphere index for geospatial queries
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
    required: true,
    min: 0
  },
  laps: {
    type: Number,
    required: true,
    min: 1
  },
  avgSpeed: {
    type: Number,
    required: true,
    min: 0
  }
}, {
  timestamps: true
});

// Create models
const User = mongoose.model('User', userSchema);
const Territory = mongoose.model('Territory', territorySchema);
const Attempt = mongoose.model('Attempt', attemptSchema);

module.exports = {
  User,
  Territory,
  Attempt
};