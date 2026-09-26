const { Project, SyntaxKind } = require("ts-morph");
const fs = require("fs");
const path = require("path");

const project = new Project({ tsConfigFilePath: "tsconfig.json" });
const concatData = JSON.parse(fs.readFileSync("src/i18n/locales/concat_strings.json", "utf8"));
const enJsonPath = "src/i18n/locales/en.json";
const enJson = JSON.parse(fs.readFileSync(enJsonPath, "utf8"));

let catACount = 0;
let catBCount = 0;
const catBList = [];

// Helper to check if string matches Category A (simple interpolation)
function isCategoryA(text) {
  // Strip outer tags if any to check inner content
  const innerMatch = text.match(/^<[^>]+>(.*)<\/[^>]+>$/s);
  const inner = innerMatch ? innerMatch[1].trim() : text.trim();

  // Find all JSX expressions { ... }
  const exprs = inner.match(/\{[^}]+\}/g);
  if (!exprs || exprs.length !== 1) return false; // Must be exactly one expression for A
  
  const expr = exprs[0];
  
  // Exclude if the expression is a function call like translateText or t
  if (expr.includes("translateText(") || expr.includes("t(")) return false;
  
  // Exclude if inner contains nested tags
  if (/<[a-zA-Z]+/.test(inner)) return false;

  // Pattern 1: Label: {expr}
  if (/^[A-Za-z\s]+:\s*\{[^}]+\}$/.test(inner)) return true;
  
  // Pattern 2: {expr} units (e.g. {count} items, {val} km)
  if (/^\{[^}]+\}\s*[A-Za-z]+$/.test(inner)) return true;
  
  // Pattern 3: {expr}%
  if (/^\{[^}]+\}\s*%$/.test(inner)) return true;

  // Otherwise, probably B (e.g. "Found {count} items in total" -> word order sensitive)
  return false;
}

// Map to track which files need 'useTranslation' import
const modifiedFiles = new Set();

for (const item of concatData) {
  if (isCategoryA(item.text)) {
    catACount++;
    
    // We would apply AST transformations here. 
    // To ensure 100% safety and avoid breaking complex JSX, we will locate the element,
    // generate the replacement string, and inject it safely.
    
    const sourceFile = project.getSourceFile(f => f.getBaseNameWithoutExtension() === item.file);
    if (!sourceFile) continue;

    const elements = sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement);
    let replaced = false;
    
    for (const el of elements) {
      if (el.getText().trim() === item.text.trim() && !replaced) {
        
        // Extract inner text and expression
        const innerMatch = item.text.match(/^<([a-zA-Z0-9_]+)[^>]*>(.*)<\/\1>$/s);
        if (!innerMatch) continue;
        
        const tagName = innerMatch[1];
        const inner = innerMatch[2].trim();
        const exprMatch = inner.match(/\{([^}]+)\}/);
        
        if (exprMatch) {
          const rawExpr = exprMatch[1];
          let template = inner.replace(exprMatch[0], '{{val}}');
          
          // Generate key
          const key = item.file + '.' + template.replace(/[^a-zA-Z]/g, '').toLowerCase().slice(0, 15);
          
          // Update en.json
          enJson[key] = template;
          
          // Generate new inner content: {t('key', { val: rawExpr })}
          const newInner = `{t('${key}', { val: ${rawExpr} })}`;
          
          // Replace the whole element text
          const outerText = el.getText();
          const newOuter = outerText.replace(inner, newInner);
          el.replaceWithText(newOuter);
          
          modifiedFiles.add(sourceFile);
          replaced = true;
        }
      }
    }
  } else {
    catBCount++;
    // Generate proposed <Trans>
    const innerMatch = item.text.match(/^<([^>]+)>(.*)<\/[^>]+>$/s);
    const inner = innerMatch ? innerMatch[2].trim() : item.text;
    
    let template = inner;
    let i = 0;
    const vars = [];
    template = template.replace(/\{([^}]+)\}/g, (match, p1) => {
        vars.push(p1);
        return `{{var${i++}}}`;
    });
    
    const props = vars.map((v, idx) => `var${idx}={${v}}`).join(" ");
    const proposed = innerMatch 
        ? `<${innerMatch[1]}><Trans i18nKey="${item.file}.complex_${catBCount}" ${props} /></${innerMatch[1].split(' ')[0]}>`
        : `<Trans i18nKey="${item.file}.complex_${catBCount}" ${props} />`;

    catBList.push({
      file: item.file,
      original: item.text,
      proposed,
      template
    });
  }
}

// Add imports and hooks to modified files
for (const sourceFile of modifiedFiles) {
  // Check if useTranslation is imported
  const imports = sourceFile.getImportDeclarations();
  const hasI18n = imports.some(i => i.getModuleSpecifierValue() === 'react-i18next');
  if (!hasI18n) {
    sourceFile.addImportDeclaration({
      namedImports: ['useTranslation'],
      moduleSpecifier: 'react-i18next'
    });
  }
  
  // Find React component function and add const { t } = useTranslation();
  const functions = sourceFile.getFunctions();
  const arrowFuncs = sourceFile.getVariableDeclarations().filter(v => v.getInitializer() && v.getInitializer().getKind() === SyntaxKind.ArrowFunction);
  
  const componentFunc = functions.find(f => f.getName() && f.getName() === sourceFile.getBaseNameWithoutExtension()) 
      || arrowFuncs.find(v => v.getName() === sourceFile.getBaseNameWithoutExtension());
  
  if (componentFunc) {
      const body = componentFunc.getKind() === SyntaxKind.FunctionDeclaration 
          ? componentFunc.getBody() 
          : componentFunc.getInitializer().getBody();
          
      if (body && body.getKind() === SyntaxKind.Block) {
          const bodyText = body.getText();
          if (!bodyText.includes("const { t }")) {
              body.insertStatements(0, "const { t } = useTranslation();");
          }
      }
  }
  
  sourceFile.saveSync();
}

fs.writeFileSync(enJsonPath, JSON.stringify(enJson, null, 2));
fs.writeFileSync("cat_b_report.json", JSON.stringify({ catACount, catBCount, catBList }, null, 2));

console.log(`Cat A: ${catACount}, Cat B: ${catBCount}`);
