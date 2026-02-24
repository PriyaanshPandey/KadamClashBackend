const turf = require('@turf/turf');

/**
 * Calculate the geometric relation between two polygons.
 * Returns 'contains', 'inside', or 'overlap'.
 */
function getRelation(polygonA, polygonB) {
  const contains = turf.booleanContains(polygonA, polygonB);
  if (contains) return 'contains';
  const inside = turf.booleanContains(polygonB, polygonA);
  if (inside) return 'inside';
  return 'overlap';
}

/**
 * Calculate the battle score based on avg speed and laps.
 * Higher score wins.
 */
function battleScore(avgSpeed, laps) {
  return avgSpeed * 1000 + laps * 10;
}

/**
 * Determine if the challenger wins against a territory.
 * Uses geometric relation, size ratio (80-120%), and battle score.
 * Returns an object { outcome: 'won'|'lost'|'autoWon', message? }.
 */
function evaluateChallenge(runPolygon, runAvgSpeed, runLaps, territory) {
  const enemyGeo = territory.geometry;
  const runArea = turf.area(runPolygon);
  const enemyArea = territory.area || turf.area(enemyGeo);
  const areaRatio = runArea / enemyArea;
  const relation = getRelation(runPolygon, enemyGeo);

  // Case 2: User inside enemy territory → automatic loss
  if (relation === 'inside') {
    return {
      outcome: 'lost',
      message: `Your run is inside ${territory.ownerId?.username || 'unknown'}'s territory.`
    };
  }

  // For contains or overlap, check size range
  const sizeOk = areaRatio >= 0.8 && areaRatio <= 1.2;

  if (relation === 'contains') {
    if (!sizeOk) {
      // Auto-win because you completely surround them (size mismatch)
      return { outcome: 'autoWon' };
    } else {
      // Battle based on score
      const userScore = battleScore(runAvgSpeed, runLaps);
      const enemyScore = battleScore(territory.avgSpeed || 0, territory.maxLaps || 1);
      if (userScore > enemyScore) {
        return { outcome: 'won' };
      } else {
        return {
          outcome: 'lost',
          message: `😵 You were defeated by ${territory.ownerId?.username || 'unknown'}.`
        };
      }
    }
  }

  if (relation === 'overlap') {
    if (!sizeOk) {
      return {
        outcome: 'lost',
        message: `Your run overlaps ${territory.ownerId?.username || 'unknown'}'s territory but you are too ${areaRatio < 0.8 ? 'small' : 'large'} to challenge.`
      };
    } else {
      const userScore = battleScore(runAvgSpeed, runLaps);
      const enemyScore = battleScore(territory.avgSpeed || 0, territory.maxLaps || 1);
      if (userScore > enemyScore) {
        return { outcome: 'won' };
      } else {
        return {
          outcome: 'lost',
          message: `😵 You were defeated by ${territory.ownerId?.username || 'unknown'}.`
        };
      }
    }
  }

  // Fallback (should not happen)
  return { outcome: 'lost', message: 'Unknown error.' };
}

/**
 * Calculate area of a GeoJSON geometry.
 */
function calculateArea(geometry) {
  const polygon = turf.polygon(geometry.coordinates);
  return turf.area(polygon);
}

module.exports = {
  getRelation,
  battleScore,
  evaluateChallenge,
  calculateArea
};
