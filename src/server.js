require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const { initServer, uploadsPath } = require('./app');

// Ensure upload directory exists
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
  console.log('Created local static uploads directory.');
}

const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/school_erp_saas';

const start = async () => {
  try {
    // Database connection
    mongoose.set('strictQuery', false);
    await mongoose.connect(MONGODB_URI);
    console.log('Successfully connected to MongoDB.');

    // Initialize Express and Apollo Server
    const app = await initServer();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`GraphQL endpoint available at http://localhost:${PORT}/graphql`);
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
};

start();
