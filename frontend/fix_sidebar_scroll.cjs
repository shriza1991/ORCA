const fs = require('fs');
let file = 'src/pages/FisherPage.tsx';
let f = fs.readFileSync(file, 'utf8');

// The main container for the decision surface components
const oldDiv = "<div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', minHeight: '100%' }}>";
const newDiv = "<div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', height: '100%', maxHeight: '100vh', overflowY: 'auto' }}>";

f = f.replace(oldDiv, newDiv);

// Ensure the outer fisher-content-column doesn't scroll if we want the inner one to scroll
fs.writeFileSync(file, f);
