const turf = require('@turf/turf');

/**
 * Calculate the coverage percentage between a run polygon and a territory
 * coverage = (intersection area / territory area) * 100
 */
function calculateCoverage(runPolygon, territoryPolygon) {
  try {
    // Convert GeoJSON objects to Turf polygons
    const run = turf.polygon(runPolygon.coordinates);
    const territory = turf.polygon(territoryPolygon.coordinates);
    
    // Calculate intersection
    const intersection = turf.intersect(turf.featureCollection([run, territory]));
    
    if (!intersection) {
      return 0; // No intersection
    }
    
    // Calculate areas
    const intersectionArea = turf.area(intersection);
    const territoryArea = turf.area(territory);
    
    // Calculate percentage
    const coverage = (intersectionArea / territoryArea) * 100;
    
    return Math.min(coverage, 100); // Cap at 100%
  } catch (error) {
    console.error('Error calculating coverage:', error);
    return 0;
  }
}

/**
 * Determine if challenger wins the battle
 * Returns true if challenger wins, false if owner retains
 */
function battleOutcome(ownerTerritory, challengerRun) {
  // Rule 4: If challenger laps > owner laps → capture
  if (challengerRun.laps > ownerTerritory.maxLaps) {
    return true;
  }
  
  // Rule 5: If challenger fastest lap time < owner fastest lap → capture
  // fastest lap time = duration / laps
  const challengerFastestLap = challengerRun.duration / challengerRun.laps;
  if (challengerFastestLap < ownerTerritory.bestTime) {
    return true;
  }
  
  // Rule 6: Otherwise ownership remains
  return false;
}

/**
 * Calculate area of a GeoJSON polygon using Turf
 */
function calculateArea(geometry) {
  const polygon = turf.polygon(geometry.coordinates);
  return turf.area(polygon);
}

module.exports = {
  calculateCoverage,
  battleOutcome,
  calculateArea
};