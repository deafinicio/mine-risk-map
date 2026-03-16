const fs = require("fs");

const geo = JSON.parse(
  fs.readFileSync("./data/kharkiv_settlements_points.geojson")
);

const locations = {};

geo.features.forEach((f) => {
  const raion = f.properties.raion;
  const hromada = f.properties.hromada;
  const settlement = f.properties.settlement;

  if (!locations[raion]) {
    locations[raion] = {};
  }

  if (!locations[raion][hromada]) {
    locations[raion][hromada] = [];
  }

  locations[raion][hromada].push(settlement);
});

fs.writeFileSync(
  "./form/locations.json",
  JSON.stringify(locations, null, 2),
  "utf8"
);

console.log("locations.json created successfully");
