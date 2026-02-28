const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const turf = require('@turf/turf');
const { User, Territory, Attempt } = require('./models');

const app = express();

app.use(cors());
app.use(express.json());

const MONGODB_URI = process.env.MONGODB_URI;

mongoose.connect(
  MONGODB_URI || 'mongodb://localhost:27017/territory-game'
);

mongoose.connection.once('open', () => {
  console.log('✅ MongoDB connected');
});

/* ============================
   HELPER: CLEAN POLYGON
============================ */

function createSafePolygon(coords) {
  if (!coords || coords.length < 4) {
    throw new Error('Not enough points');
  }

  const first = coords[0];
  const last = coords[coords.length - 1];

  // Close loop
  if (first[0] !== last[0] || first[1] !== last[1]) {
    coords.push(first);
  }

  let polygon = turf.polygon([coords]);

  // Fix self intersections
  const unkinked = turf.unkinkPolygon(polygon);

  if (unkinked.features.length > 1) {
    // choose largest
    let largest = unkinked.features[0];
    for (let f of unkinked.features) {
      if (turf.area(f) > turf.area(largest)) {
        largest = f;
      }
    }
    polygon = largest;
  }

  return polygon;
}

/* ============================
   RUN ENDPOINT
============================ */

app.post('/api/run', async (req, res) => {
  try {
    const { userId, coordinates, duration, laps, avgSpeed } = req.body;

    if (!userId || !coordinates) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    if (
      typeof duration !== 'number' ||
      typeof laps !== 'number'
    ) {
      return res.status(400).json({ error: 'Invalid numbers' });
    }

   const safeAvgSpeed = Number(avgSpeed);

if (!Number.isFinite(safeAvgSpeed) || safeAvgSpeed <= 0) {
  return res.status(400).json({ error: 'Invalid avgSpeed' });
}

    if (duration <= 0 || laps <= 0) {
      return res.status(400).json({ error: 'Invalid run data' });
    }

    let user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const runPolygon = createSafePolygon(coordinates);
    const runArea = turf.area(runPolygon);

    if (runArea < 200) {
      return res.status(400).json({ error: 'Territory too small' });
    }

    const enemies = await Territory.find({
      geometry: {
        $geoIntersects: {
          $geometry: runPolygon.geometry
        }
      },
      ownerId: { $ne: user._id }
    }).populate('ownerId', 'username');

    let capturedIds = [];
    let blocked = false;
    let previousOwner = null;

    for (let enemy of enemies) {
      const enemyFeature = turf.feature(enemy.geometry);
const intersection = turf.intersect(runPolygon, enemyFeature);

      if (!intersection) continue;

      const overlapArea = turf.area(intersection);
      const enemyArea = turf.area(enemy.geometry);
      const percent = (overlapArea / enemyArea) * 100;

      const enemyContainsUser = turf.booleanContains(
        enemy.geometry,
        runPolygon
      );

      if (enemyContainsUser) {
        blocked = true;
        break;
      }

      if (percent >= 70) {
        capturedIds.push(enemy._id);
        previousOwner = enemy.ownerId.username;
      }
    }

    if (blocked) {
      return res.json({
        created: false,
        captured: false,
        defended: true
      });
    }

    if (capturedIds.length > 0) {
      await Territory.deleteMany({ _id: { $in: capturedIds } });
    }

    const newTerritory = await Territory.create({
      ownerId: user._id,
      geometry: runPolygon.geometry,
      area: runArea,
      bestTime: duration,
      maxLaps: laps,
      avgSpeed: safeAvgSpeed
    });

    await Attempt.create({
      userId: user._id,
      territoryId: newTerritory._id,
      duration,
      laps,
      avgSpeed: safeAvgSpeed
    });

    res.json({
      created: capturedIds.length === 0,
      captured: capturedIds.length > 0,
      defended: false,
      previousOwner
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

/* ============================
   OTHER ROUTES (UNCHANGED)
============================ */

app.get('/api/territories', async (req, res) => {
  const territories = await Territory.find()
    .populate('ownerId', 'username');
  res.json(territories);
});

app.post('/api/users', async (req, res) => {
  const { username } = req.body;
  let user = await User.findOne({ username });
  if (!user) user = await User.create({ username });
  res.json(user);
});

app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState === 1
    ? 'connected'
    : 'disconnected';

  res.json({
    server: 'online',
    database: dbState
  });
});;

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Running on ${PORT}`));
