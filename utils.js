// utils/territoryUtils.js
const turf = require('@turf/turf');

/**
 * Create clean polygon from GPS coordinates

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
