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
    
    // Check MongoDB connection
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ 
        error: 'Database not connected',
        message: 'Please try again in a few moments'
      });
    }
    
    // Validate input
    if (!userId || !polygon || !duration || !laps || !avgSpeed) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Find user
    let user = await User.findById(userId);
    if (!user) {
      user = await User.findOne({ username: userId });
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }
    }
    
    // Calculate run area
    const runArea = calculateArea(polygon);
    
    // Find intersecting territories
    const intersectingTerritories = await Territory.find({
      geometry: {
        $geoIntersects: {
          $geometry: polygon
        }
      }
    }).populate('ownerId', 'username');
    
    let created = false;
    let captured = false;
    let defended = false;
    let territoryId = null;
    let newOwner = null;
    let previousOwner = null;
    let defender = null;
    
    if (intersectingTerritories.length === 0) {
      // Create new territory
      const newTerritory = new Territory({
        ownerId: user._id,
        geometry: polygon,
        area: runArea,
        bestTime: duration / laps,
        maxLaps: laps,
        avgSpeed: avgSpeed
      });
      
      await newTerritory.save();
      
      created = true;
      territoryId = newTerritory._id;
      newOwner = user._id;
      
      await new Attempt({
        userId: user._id,
        territoryId: newTerritory._id,
        duration,
        laps,
        avgSpeed
      }).save();
      
    } else {
      let battled = false;
      
      for (const territory of intersectingTerritories) {
        const coverage = calculateCoverage(polygon, territory.geometry);
        console.log(`Coverage with territory ${territory._id}: ${coverage}%`);
        
        if (coverage >= 70 && !battled) {
          const challengerWins = battleOutcome(territory, { duration, laps });
          console.log('Challenger wins?', challengerWins);
          
          previousOwner = territory.ownerId?.username || 'unknown';
          
          if (challengerWins) {
            // Capture: update territory with new owner and new stats
            territory.ownerId = user._id;
            territory.bestTime = duration / laps;
            territory.maxLaps = laps;
            territory.avgSpeed = avgSpeed;
            await territory.save();
            
            captured = true;
            territoryId = territory._id;
            newOwner = user._id;
          } else {
            // Defender wins
            defended = true;
            territoryId = territory._id;
            defender = territory.ownerId?.username || 'unknown';
          }
          
          battled = true;
          
          await new Attempt({
            userId: user._id,
            territoryId: territory._id,
            duration,
            laps,
            avgSpeed
          }).save();
        }
      }
      
      if (!battled) {
        // No territory with enough coverage – create new
        const newTerritory = new Territory({
          ownerId: user._id,
          geometry: polygon,
          area: runArea,
          bestTime: duration / laps,
          maxLaps: laps,
          avgSpeed: avgSpeed
        });
        
        await newTerritory.save();
        
        created = true;
        territoryId = newTerritory._id;
        newOwner = user._id;
        
        await new Attempt({
          userId: user._id,
          territoryId: newTerritory._id,
          duration,
          laps,
          avgSpeed
        }).save();
      }
    }
    
    res.json({
      created,
      captured,
      defended,
      territoryId: territoryId ? territoryId.toString() : null,
      newOwner: newOwner ? newOwner.toString() : null,
      previousOwner: previousOwner,   // for victory message
      defender: defender               // for defeat message
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
