const fs = require('fs');
const data = require('./cat_b_report.json');

let md = "# Category B: True Word-Order-Sensitive Strings\n\nThese **" + data.catBCount + "** strings require `<Trans>` because variables sit between words and might need reordering in target languages. \n\n";

data.catBList.forEach((item, i) => {
  md += "### " + (i+1) + ". Component: " + item.file + "\n";
  md += "- **Original JSX**: `" + item.original + "`\n";
  md += "- **Extracted Template**: `" + item.template + "`\n";
  md += "- **Proposed `<Trans>` Implementation**: \n  ```tsx\n  " + item.proposed + "\n  ```\n\n";
});

fs.writeFileSync('../cat_b_report.md', md);
