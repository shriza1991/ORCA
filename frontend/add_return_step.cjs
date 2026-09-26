const fs = require('fs');
let file = 'src/components/fisher/GuidedTripSetup.tsx';
let f = fs.readFileSync(file, 'utf8');

// 1. Add return_time step to steps array
const departStepEnd = "    {\n      id: 'depart',\n      title: t('GuidedTripSetup.depart_day', 'Day when you will depart?'),\n      icon: <CalendarClock size={48} />,\n    },";
const returnStep = `
    {
      id: 'return',
      title: t('GuidedTripSetup.return_day', 'Day when you will return?'),
      icon: <CalendarClock size={48} />,
    },`;
f = f.replace(departStepEnd, departStepEnd + returnStep);

// 2. Add case 4 in renderContent
const case3End = "            ))}\n          </div>\n        );";
const case4 = `
      case 4:
        return (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '16px' }}>
            {['today', 'tomorrow', '2_days', '3_days'].map((time) => (
              <button
                key={time}
                onClick={() => {
                  onContextChange({ ...context, return_time: time });
                  handleNext();
                }}
                style={{
                  padding: '24px',
                  fontSize: '1.5rem',
                  borderRadius: '12px',
                  background: context.return_time === time ? '#3b82f6' : '#f1f5f9',
                  color: context.return_time === time ? 'white' : 'black',
                  border: 'none',
                }}
              >
                {t('GuidedTripSetup.return_time.' + time, time.replace('_', ' '))}
              </button>
            ))}
          </div>
        );`;
// case 4 is currently 'sea_condition'
f = f.replace(/case 4:/g, "case 5:");
f = f.replace(/case 5:/g, "case 6:"); // wait, I just replaced case 4, so now there are two case 5s.

// Let's do it safer:
f = f.replace("case 5:", "case 6:");
f = f.replace("case 4:", "case 5:");
f = f.replace(case3End, case3End + case4);

fs.writeFileSync(file, f);
