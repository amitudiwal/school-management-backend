const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

console.log('Testing server initialization...');
try {
  const { initServer } = require('../src/app');
  console.log('Server imported successfully.');
  
  initServer().then((app) => {
    console.log('Server initialized successfully with no errors!');
    process.exit(0);
  }).catch((err) => {
    console.error('Error during server initialization:', err);
    process.exit(1);
  });
} catch (err) {
  console.error('Syntax or import error during server loading:', err);
  process.exit(1);
}
