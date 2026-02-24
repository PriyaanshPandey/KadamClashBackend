const { evaluateChallenge, calculateArea } = require('./utils');
const turf = require('@turf/turf');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { User, Territory, Attempt } = require('./models');
const { calculateCoverage, battleOutcome, calculateArea } = require('./utils');

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Get MongoDB URI from environment variable
const MONGODB_URI = process.env.MONGODB_URI;

// Log connection attempt (without sensitive data)
console.log('Starting server...');
console.log('MongoDB URI exists:', !!MONGODB_URI);

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is not set!');
  console.error('Please set MONGODB_URI in your Render environment variables');
}

// Connect to MongoDB
mongoose.connect(MONGODB_URI || 'mongodb://localhost:27017/territory-game', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverSelectionTimeoutMS: 30000, // Increased timeout for Render
  socketTimeoutMS: 45000,
})
.then(() => {
  console.log('✅ Connected to MongoDB successfully');
  console.log('Database:', mongoose.connection.name);
  console.log('Host:', mongoose.connection.host);
})
.catch((err) => {
  console.error('❌ MongoDB connection error:');
  console.error('Error name:', err.name);
  console.error('Error message:', err.message);
  console.error('Full error:', err);
  
  // Don't exit - let the server try to reconnect
  console.log('Will retry connection...');
});

// Handle connection events
mongoose.connection.on('error', (err) => {
  console.error('MongoDB connection error event:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

mongoose.connection.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

// API Routes
app.post('/api/run', async (req, res) => {
  try {
    const { userId, polygon, duration, laps, avgSpeed } = req.body;

    // Check DB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }

    // Validate input
    if (!userId || !polygon || !duration || !laps || !avgSpeed) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Find user
    let user = await User.findById(userId);
    if (!user) user = await User.findOne({ username: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const runPolygon = polygon; // already GeoJSON
    const runArea = calculateArea(polygon);

    // Find all intersecting territories that are NOT owned by the user
    const intersecting = await Territory.find({
      geometry: { $geoIntersects: { $geometry: runPolygon } },
      ownerId: { $ne: user._id }
    }).populate('ownerId', 'username');

    // If no intersecting territories → create new
    if (intersecting.length === 0) {
      const newTerritory = new Territory({
        ownerId: user._id,
        geometry: runPolygon,
        area: runArea,
        bestTime: duration / laps,
        maxLaps: laps,
        avgSpeed: avgSpeed
      });
      await newTerritory.save();

      await new Attempt({
        userId: user._id,
        territoryId: newTerritory._id,
        duration,
        laps,
        avgSpeed
      }).save();

      return res.json({
        created: true,
        captured: false,
        defended: false,
        territoryId: newTerritory._id.toString(),
        newOwner: user._id.toString(),
        previousOwner: null,
        defender: null
      });
    }

    // Evaluate each enemy using the new logic
    let allWon = true;
    let conquered = [];
    let defeatMessage = '';

    for (const territory of intersecting) {
      const result = evaluateChallenge(runPolygon, avgSpeed, laps, territory);
      if (result.outcome === 'lost') {
        allWon = false;
        defeatMessage = result.message || 'You lost.';
        break;
      } else if (result.outcome === 'won' || result.outcome === 'autoWon') {
        conquered.push(territory);
      }
    }

    if (!allWon) {
      // Defeated – no territory change
      return res.json({
        created: false,
        captured: false,
        defended: true,
        territoryId: null,
        newOwner: null,
        previousOwner: null,
        defender: defeatMessage.includes('defeated') ? defeatMessage.split('by ')[1]?.replace('.', '') : null
      });
    }

    // All enemies conquered → merge everything
    let mergedPolygon = runPolygon;
    for (const t of conquered) {
      try {
        mergedPolygon = turf.union(mergedPolygon, t.geometry);
      } catch (err) {
        console.warn(`Union failed for territory ${t._id}`, err);
        // Continue without it? Better to fail? We'll proceed but may lose that territory.
      }
    }

    // Delete conquered territories
    const conqueredIds = conquered.map(t => t._id);
    await Territory.deleteMany({ _id: { $in: conqueredIds } });

    // Create new merged territory
    const mergedArea = calculateArea(mergedPolygon);
    const newTerritory = new Territory({
      ownerId: user._id,
      geometry: mergedPolygon,
      area: mergedArea,
      bestTime: duration / laps,  // using current run's stats
      maxLaps: laps,
      avgSpeed: avgSpeed
    });
    await newTerritory.save();

    // Record attempt
    await new Attempt({
      userId: user._id,
      territoryId: newTerritory._id,
      duration,
      laps,
      avgSpeed
    }).save();

    // Determine previous owner for victory message (use first conquered)
    const previousOwner = conquered[0]?.ownerId?.username || null;

    res.json({
      created: false,
      captured: true,
      defended: false,
      territoryId: newTerritory._id.toString(),
      newOwner: user._id.toString(),
      previousOwner,
      defender: null
    });

  } catch (error) {
    console.error('Run error:', error);
    res.status(500).json({ error: error.message });
  }
});
      
 
  

app.get('/api/territories', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const territories = await Territory.find()
      .populate('ownerId', 'username')
      .select('geometry ownerId area bestTime maxLaps avgSpeed'); // or just omit .select()
    
    res.json(territories);
  } catch (error) {
    console.error('Territories error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Create a test user
app.post('/api/users', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username required' });
    }
    
    let user = await User.findOne({ username });
    if (!user) {
      user = new User({ username });
      await user.save();
    }
    
    res.json({
      id: user._id,
      username: user.username,
      createdAt: user.createdAt
    });
  } catch (error) {
    console.error('User creation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get all users
app.get('/api/users', async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const users = await User.find({}, 'username createdAt');
    res.json(users);
  } catch (error) {
    console.error('Users error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check - VERY IMPORTANT for Render
app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const states = {
    0: 'disconnected',
    1: 'connected',
    2: 'connecting',
    3: 'disconnecting'
  };
  
  res.json({
    status: 'OK',
    message: 'Server is running on Render',
    database: states[dbState] || 'unknown',
    mongodb_uri_set: !!process.env.MONGODB_URI,
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'Territory Run Game API',
    version: '1.0.0',
    status: 'active',
    endpoints: {
      health: '/health',
      users: '/api/users',
      territories: '/api/territories',
      run: '/api/run'
    }
  });
});

// IMPORTANT: This is the port Render will use
const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=================================`);
  console.log(`🚀 Server started successfully!`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: /health`);
  console.log(`=================================`);
});
