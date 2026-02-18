const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const turf = require('@turf/turf');

// Load environment variables
dotenv.config();

// Import models and utilities
const { User, Territory, Attempt } = require('./models');
const { calculateCoverage, battleOutcome, calculateArea } = require('./utils');

// Initialize Express app
const app = express();

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON bodies

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/territory-game')
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// ==================== API ENDPOINTS ====================

// POST /api/run - Process a new run
app.post('/api/run', async (req, res) => {
  try {
    const { userId, polygon, duration, laps, avgSpeed } = req.body;
    
    // Validate input
    if (!userId || !polygon || !duration || !laps || !avgSpeed) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Calculate area of the run polygon
    const runArea = calculateArea(polygon);
    
    // Find territories that intersect with the run polygon
    const intersectingTerritories = await Territory.find({
      geometry: {
        $geoIntersects: {
          $geometry: polygon
        }
      }
    });
    
    // Default response values
    let created = false;
    let captured = false;
    let territoryId = null;
    let newOwner = null;
    
    if (intersectingTerritories.length === 0) {
      // No intersecting territories - create new territory
      const newTerritory = new Territory({
        ownerId: userId,
        geometry: polygon,
        area: runArea,
        bestTime: duration / laps, // Store as fastest lap time
        maxLaps: laps
      });
      
      await newTerritory.save();
      
      created = true;
      territoryId = newTerritory._id;
      newOwner = userId;
      
      // Save attempt
      await new Attempt({
        userId,
        territoryId: newTerritory._id,
        duration,
        laps,
        avgSpeed
      }).save();
      
    } else {
      // Check each intersecting territory for coverage >= 70%
      for (const territory of intersectingTerritories) {
        const coverage = calculateCoverage(polygon, territory.geometry);
        
        if (coverage >= 70) {
          // Battle!
          const challengerWins = battleOutcome(territory, { duration, laps });
          
          if (challengerWins) {
            // Update territory ownership and stats
            territory.ownerId = userId;
            territory.bestTime = duration / laps;
            territory.maxLaps = laps;
            await territory.save();
            
            captured = true;
            territoryId = territory._id;
            newOwner = userId;
          } else {
            territoryId = territory._id;
            newOwner = territory.ownerId;
          }
          
          // Save attempt
          await new Attempt({
            userId,
            territoryId: territory._id,
            duration,
            laps,
            avgSpeed
          }).save();
          
          break; // Only battle with the first qualifying territory
        }
      }
      
      // If no territory met the 70% threshold, create new territory
      if (!territoryId) {
        const newTerritory = new Territory({
          ownerId: userId,
          geometry: polygon,
          area: runArea,
          bestTime: duration / laps,
          maxLaps: laps
        });
        
        await newTerritory.save();
        
        created = true;
        territoryId = newTerritory._id;
        newOwner = userId;
        
        // Save attempt
        await new Attempt({
          userId,
          territoryId: newTerritory._id,
          duration,
          laps,
          avgSpeed
        }).save();
      }
    }
    
    // Return response
    res.json({
      created,
      captured,
      territoryId: territoryId.toString(),
      newOwner: newOwner ? newOwner.toString() : null
    });
    
  } catch (error) {
    console.error('Error processing run:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/territories - Get all territories (limited fields)
app.get('/api/territories', async (req, res) => {
  try {
    const territories = await Territory.find({}, {
      geometry: 1,
      ownerId: 1,
      _id: 1
    }).populate('ownerId', 'username');
    
    res.json(territories);
  } catch (error) {
    console.error('Error fetching territories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// ==================== HELPER ENDPOINTS FOR TESTING ====================

// POST /api/users - Create a test user (for development)
app.post('/api/users', async (req, res) => {
  try {
    const { username } = req.body;
    
    if (!username) {
      return res.status(400).json({ error: 'Username is required' });
    }
    
    const user = new User({ username });
    await user.save();
    
    res.status(201).json({
      id: user._id,
      username: user.username
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/users - List all users (for development)
app.get('/api/users', async (req, res) => {
  try {
    const users = await User.find({}, 'username createdAt');
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});