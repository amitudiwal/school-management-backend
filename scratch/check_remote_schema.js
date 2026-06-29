const https = require('https');

const query = JSON.stringify({
  query: `
    query {
      __type(name: "ExamSchedule") {
        fields {
          name
        }
      }
    }
  `
});

const options = {
  hostname: 'school-management-backend-izxj.onrender.com',
  path: '/graphql',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': query.length
  }
};

console.log('Sending introspection query to remote server...');
const req = https.request(options, (res) => {
  console.log('Response status:', res.statusCode);
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    console.log('Response data:', data);
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
  process.exit(1);
});

req.write(query);
req.end();
