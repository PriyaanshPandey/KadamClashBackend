// utils/territoryUtils.js
const turf = require('@turf/turf');

/**
 * Create clean polygon from GPS coordinates
 */
function createRunPolygon(runCoordinates) {
  if (!runCoordinates || runCoordinates.length < 4) {
    throw new Error('Not enough coordinates to form territory');
  }

  // Ensure closed loop
  const first = runCoordinates[0];
  const last = runCoordinates[runCoordinates.length - 1];

  if (
    first[0] !== last[0] ||
    first[1] !== last[1]
  ) {
    runCoordinates.push(first);
  }

  let polygon = turf.lineToPolygon(turf.lineString(runCoordinates));

  // Fix self-intersections
  const unkinked = turf.unkinkPolygon(polygon);

  if (unkinked.features.length > 1) {
    // Choose largest polygon
    let largest = unkinked.features[0];

    for (const feature of unkinked.features) {
      if (turf.area(feature) > turf.area(largest)) {
        largest = feature;
      }
    }

    polygon = largest;
  }

  return polygon;
}

/**
 * Evaluate battle outcome with 70% capture rule
 */
function evaluateTerritoryBattle(runPolygon, enemyTerritory) {
  const enemyGeo = enemyTerritory.geometry;

  const intersection = turf.intersect(runPolygon, enemyGeo);

  if (!intersection) {
    return { type: 'no_overlap' };
  }

  const overlapArea = turf.area(intersection);
  const enemyArea = turf.area(enemyGeo);

  const overlapPercent = (overlapArea / enemyArea) * 100;

  const enemyContainsUser = turf.booleanContains(enemyGeo, runPolygon);

  if (enemyContainsUser) {
    return {
      type: 'blocked',
      message: `Your run is fully inside enemy territory`
    };
  }

  if (overlapPercent >= 70) {
    return { type: 'capture' };
  }

  return { type: 'partial_overlap' };
}

module.exports = {
  createRunPolygon,
  evaluateTerritoryBattle
};
