const fs = require('fs');
let file = 'src/components/fisher/GuidedTripSetup.tsx';
let f = fs.readFileSync(file, 'utf8');

// There are two "case 6:" blocks right now.
// The first one is the 'sea_condition' step which should be case 5.
// The second one is the 'confirm' step which should be case 6.

// Let's replace the first "case 6:" with "case 5:"
f = f.replace("case 6:", "case 5:");

// And also replace case 4 with the return time step if it's not there.
// Wait, my previous script appended it after case 3! Let's check where the return_time block is.
fs.writeFileSync(file, f);
