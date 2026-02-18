const turf = require('@turf/turf');

function calculateCoverage(runPolygon, territoryPolygon) {
  try {
    const run = turf.polygon(runPolygon.coordinates);
    const territory = turf.polygon(territoryPolygon.coordinates);
    
    const intersection = turf.intersect(turf.featureCollection([run, territory]));
    
    if (!intersection) {
      return 0;
    }
    
    const intersectionArea = turf.area(intersection);
    const territoryArea = turf.area(territory);
    
    return (intersectionArea / territoryArea) * 100;
  } catch (error) {
    console.error('Coverage calculation error:', error);
    return 0;
  }
}

function battleOutcome(territory, run) {
  // Check laps
  if (run.laps > territory.maxLaps) {
    return true;
  }
  
  // Check fastest lap
  const runFastestLap = run.duration / run.laps;
  if (runFastestLap < territory.bestTime) {
    return true;
  }
  
  return false;
}

function calculateArea(geometry) {
  const polygon = turf.polygon(geometry.coordinates);
  return turf.area(polygon);
}

module.exports = {
  calculateCoverage,
  battleOutcome,
  calculateArea
};
