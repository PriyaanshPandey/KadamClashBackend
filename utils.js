const turf = require('@turf/turf');

/**
 * Determine the outcome of a run against a territory based on containment.
 * Returns { outcome: 'won'|'lost', message?: string }.
 * - 'won' if run polygon contains enemy territory.
 * - 'lost' if enemy contains run, or if they intersect without containment.
 * - If no intersection, the calling function will handle separately.
 */
function evaluateChallenge(runPolygon, runAvgSpeed, runLaps, territory) {
  const enemyGeo = territory.geometry;
  const userContainsEnemy = turf.booleanContains(runPolygon, enemyGeo);
  const enemyContainsUser = turf.booleanContains(enemyGeo, runPolygon);

  if (userContainsEnemy) {
    return { outcome: 'won' };
  } else if (enemyContainsUser) {
    return {
      outcome: 'lost',
      message: `Your run is inside ${territory.ownerId?.username || 'unknown'}'s territory – no new territory.`
    };
  } else {
    // They intersect but neither contains the other → loss
    const intersect = turf.intersect(runPolygon, enemyGeo);
    if (intersect) {
      return {
        outcome: 'lost',
        message: `Your run overlaps ${territory.ownerId?.username || 'unknown'}'s territory but does not encircle it.`
      };
    } else {
      // No intersection – should not happen because we only call this for intersecting territories
      return { outcome: 'lost', message: 'Unknown error.' };
    }
  }
}

/**
 * Calculate area of a GeoJSON geometry.
 */
function calculateArea(geometry) {
  try {
    if (!geometry || !geometry.coordinates) {
      console.error('calculateArea received invalid geometry:', geometry);
      return 0;
    }
    const polygon = turf.polygon(geometry.coordinates);
    return turf.area(polygon);
  } catch (error) {
    console.error('Error in calculateArea:', error, 'geometry:', geometry);
    return 0;
  }
}

module.exports = {
  evaluateChallenge,
  calculateArea
};
