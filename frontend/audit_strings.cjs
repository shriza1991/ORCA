const { Project, SyntaxKind } = require("ts-morph");
const fs = require("fs");

const project = new Project({
  tsConfigFilePath: "./tsconfig.json",
});

const unwiredStrings = [];

project.getSourceFiles().forEach((sourceFile) => {
  const filePath = sourceFile.getFilePath();
  // ignore tests, styles, etc.
  if (filePath.includes(".test.") || filePath.includes("i18n") || filePath.includes("utils")) return;

  // Find all JsxText elements
  sourceFile.getDescendantsOfKind(SyntaxKind.JsxText).forEach((jsxText) => {
    const text = jsxText.getText().trim();
    if (text.length > 0 && !text.match(/^[{}]+$/)) {
      unwiredStrings.push({ file: filePath, type: 'JsxText', text });
    }
  });

  // Find all StringLiterals inside JSX attributes or JsxExpressionContainers
  sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral).forEach((str) => {
    const text = str.getLiteralText().trim();
    if (text.length === 0) return;
    // Skip if it's a className, id, key, style, role, type, htmlFor
    const parent = str.getParent();
    if (parent.getKind() === SyntaxKind.JsxAttribute) {
      const attrName = parent.getNameNode().getText();
      if (['className', 'id', 'key', 'style', 'role', 'type', 'htmlFor', 'href', 'src', 'width', 'height', 'size'].includes(attrName)) return;
      unwiredStrings.push({ file: filePath, type: 'JsxAttribute', attr: attrName, text });
    } else if (parent.getKind() === SyntaxKind.JsxExpression) {
      // It's inside { "string" } or similar expression
      // Exclude if it's wrapped in t()
      const grandparent = parent.getParent();
      // To be safe, just log it and we can filter
      unwiredStrings.push({ file: filePath, type: 'JsxExpressionLiteral', text });
    }
  });
});

fs.writeFileSync("unwired_audit.json", JSON.stringify(unwiredStrings, null, 2));
console.log("Audit complete. Found " + unwiredStrings.length + " potential unwired strings.");
