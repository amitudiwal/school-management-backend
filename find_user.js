const fs = require('fs');

const content = fs.readFileSync('d:/School Management system/frontend/src/pages/StudentList.jsx', 'utf8');
const lines = content.split('\n');
lines.forEach((line, index) => {
  if (line.includes('user')) {
    console.log(`${index + 1}: ${line.trim()}`);
  }
});
