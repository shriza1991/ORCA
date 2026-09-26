const fs = require('fs');

let content = fs.readFileSync('src/hooks/useSpokenGuidance.ts', 'utf8');

// The SPOKEN_GUIDANCE map
content = content.replace(
  'mr: [\n      "आपला प्रवास सुरू करण्यासाठी..."\n    ]\n  }',
  'mr: [\n      "आपला प्रवास सुरू करण्यासाठी..."\n    ],\n    ta: [\n      "Start your trip..."\n    ],\n    te: [\n      "Start your trip..."\n    ]\n  }'
);

fs.writeFileSync('src/hooks/useSpokenGuidance.ts', content);
console.log('Fixed useSpokenGuidance.ts');
