"use strict";
const fs = require("fs");
const path = require("path");

const BATCH_SIZE = 500; // Adjust batch size as needed

const batchInsert = async (queryInterface, table, data) => {
  for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    console.log(`Bulk inserting ${batch.length} records into ${table}...`);
    await queryInterface.bulkInsert(table, batch, { returning: true });
    console.log(`Inserted ${batch.length} records into ${table} successfully.`);
  }
};

module.exports = {
  up: async (queryInterface, Sequelize) => {
    const filePath = path.join(__dirname, "../../src/utils/data/locations.json");
    const countriesData = JSON.parse(fs.readFileSync(filePath, "utf8"));

    console.log("Starting data insertion...");

    const countriesToInsert = [];
    const statesToInsert = [];
    const citiesToInsert = [];

    // Prepare countries for insertion
    for (const country of countriesData) {
      console.log(`Preparing to insert country: ${country.name}`);
      countriesToInsert.push({
        name: country.name,
        iso3: country.iso3,
        iso2: country.iso2,
        numeric_code: country.numeric_code,
        phone_code: country.phone_code,
        capital: country.capital,
        currency: country.currency,
        created_at: new Date(),
        updated_at: new Date(),
      });
    }

    // Bulk insert countries
    await batchInsert(queryInterface, "countries", countriesToInsert);
    console.log("Countries insertion completed.");

    const countryIdMap = {};
    const fetchedCountries = await queryInterface.sequelize.query("SELECT * FROM countries WHERE name IN (:countryNames)", {
      replacements: { countryNames: countriesToInsert.map((c) => c.name) },
      type: Sequelize.QueryTypes.SELECT,
    });
    fetchedCountries.forEach((country) => {
      countryIdMap[country.name] = country.id;
    });

    // Prepare states and cities for insertion
    for (const country of countriesData) {
      for (const state of country.states) {
        console.log(`Preparing to insert state: ${state.name} for country: ${country.name}`);
        statesToInsert.push({
          name: state.name,
          country_id: countryIdMap[country.name],
          created_at: new Date(),
          updated_at: new Date(),
        });

        // Prepare cities for insertion, using state ID mapping
        for (const city of state.cities) {
          console.log(`Preparing to insert city: ${city.name} for state: ${state.name}`);
          citiesToInsert.push({
            name: city.name,
            state_name: state.name, // Store the state name temporarily
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      }
    }

    // Bulk insert states
    await batchInsert(queryInterface, "states", statesToInsert);
    console.log("States insertion completed.");

    // Fetch inserted states to get their IDs
    const stateIdMap = {};
    const fetchedStates = await queryInterface.sequelize.query("SELECT * FROM states WHERE country_id IN (:countryIds)", {
      replacements: { countryIds: Object.values(countryIdMap) },
      type: Sequelize.QueryTypes.SELECT,
    });
    fetchedStates.forEach((state) => {
      stateIdMap[state.name] = state.id; // Map state name to ID
    });

    // Update city entries with correct state IDs
    citiesToInsert.forEach((city) => {
      const stateName = city.state_name; // Use the stored state name
      if (stateIdMap[stateName]) {
        city.state_id = stateIdMap[stateName]; // Set the correct state ID
      } else {
        console.error(`Error: State ID not found for state ${stateName}.`);
      }
      delete city.state_name; // Remove temporary property
    });

    // Bulk insert cities
    await batchInsert(queryInterface, "cities", citiesToInsert);
    console.log("Cities insertion completed.");
  },

  down: async (queryInterface, Sequelize) => {
    console.log("Starting rollback of data...");
    await queryInterface.bulkDelete("cities", null, {});
    await queryInterface.bulkDelete("states", null, {});
    await queryInterface.bulkDelete("countries", null, {});
    console.log("Rollback completed.");
  },
};
