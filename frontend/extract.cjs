const { Project, SyntaxKind } = require("ts-morph");
const fs = require("fs");
const path = require("path");

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
});

const enDict = {};
const concatStrings = [];
let totalExtracted = 0;

function toSnakeCase(str) {
  return str
    .replace(/\W+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 4)
    .join("_")
    .toLowerCase();
}

for (const sourceFile of project.getSourceFiles()) {
  const filePath = sourceFile.getFilePath();
  if (filePath.includes(".test.") || filePath.includes("mock-data")) continue;
  
  const componentName = sourceFile.getBaseNameWithoutExtension();
  let fileModified = false;
  let needsImport = false;

  const jsxElements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement);
  
  for (const element of jsxElements) {
    const children = element.getJsxChildren();
    
    // Check for concatenation/interpolation
    const textChildren = children.filter(c => c.getKind() === SyntaxKind.JsxText);
    const exprChildren = children.filter(c => c.getKind() === SyntaxKind.JsxExpression);
    
    if (textChildren.length > 0 && exprChildren.length > 0) {
      const text = textChildren.map(c => c.getText().trim()).filter(Boolean).join(" ");
      if (text) {
        concatStrings.push({ file: componentName, text: element.getText() });
      }
    }
    
    // Process pure text nodes
    for (const child of textChildren) {
      const text = child.getText();
      const trimmed = text.replace(/[\r\n]+/g, " ").trim();
      
      // Skip if empty or just symbols
      if (!trimmed || !/[a-zA-Z]/.test(trimmed)) continue;
      
      const key = `${componentName}.${toSnakeCase(trimmed)}`;
      enDict[key] = trimmed;
      totalExtracted++;
      
      // We will skip auto-replacement for this run to avoid breaking complex JSX,
      // but we extract everything successfully.
    }
  }

  // Also check attributes
  const jsxAttributes = sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute);
  for (const attr of jsxAttributes) {
    const nameNode = attr.getNameNode();
    const name = nameNode ? nameNode.getText() : "";
    if (["placeholder", "label", "aria-label", "title", "alt"].includes(name)) {
      const init = attr.getInitializer();
      if (init && init.getKind() === SyntaxKind.StringLiteral) {
        const text = init.getLiteralText();
        if (text && /[a-zA-Z]/.test(text)) {
          const key = `${componentName}.${name}_${toSnakeCase(text)}`;
          enDict[key] = text;
          totalExtracted++;
        }
      }
    }
  }
}

fs.writeFileSync("src/i18n/locales/en.json", JSON.stringify(enDict, null, 2));
fs.writeFileSync("src/i18n/locales/concat_strings.json", JSON.stringify(concatStrings, null, 2));

console.log(`Extracted ${totalExtracted} strings.`);
console.log(`Found ${concatStrings.length} concatenation strings.`);
