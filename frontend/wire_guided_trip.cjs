const fs = require('fs');
let file = 'src/components/fisher/GuidedTripSetup.tsx';
let f = fs.readFileSync(file, 'utf8');

f = f.replace(/title: translateText\('Day when you will depart\?', language\)/g, "title: t('GuidedTripSetup.depart_day', 'Day when you will depart?')");
f = f.replace(/title: translateText\('See the sea condition', language\)/g, "title: t('GuidedTripSetup.sea_condition', 'See the sea condition')");
f = f.replace(/title: translateText\('Plan the trip', language\)/g, "title: t('GuidedTripSetup.plan_trip', 'Plan the trip')");

// Replace {translateText(h, language)} with {t('Harbor.' + h, h)}
f = f.replace(/\{translateText\(h, language\)\}/g, "{t('Harbor.' + h, h)}");

// Replace {translateText(opt.label, language)} with {t('GuidedTripSetup.pfz_opt.' + opt.value, opt.label)}
f = f.replace(/\{translateText\(opt\.label, language\)\}/g, "{t('GuidedTripSetup.pfz_opt.' + opt.value, opt.label)}");

// Replace {translateText(c.label, language)} with {t('GuidedTripSetup.craft.' + c.value, c.label)}
f = f.replace(/\{translateText\(c\.label, language\)\}/g, "{t('GuidedTripSetup.craft.' + c.value, c.label)}");

// Replace translateText(time === 'today' ? 'Today' : 'Tomorrow', language) with t('GuidedTripSetup.time.' + time, time === 'today' ? 'Today' : 'Tomorrow')
f = f.replace(/\{translateText\(time === 'today' \? 'Today' : 'Tomorrow', language\)\}/g, "{t('GuidedTripSetup.time.' + time, time === 'today' ? 'Today' : 'Tomorrow')}");

fs.writeFileSync(file, f);
