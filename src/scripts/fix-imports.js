import { relative } from "node:path";
import generate from "@babel/generator";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import { readFileSync, writeFileSync } from "fs-extra";
import { sync } from "glob";

// Директория для обработки (по умолчанию текущая)
const rootDir = process.argv[2] || ".";

// Функция для добавления .js к относительным импортам
function fixImports(code) {
  const ast = parse(code, {
    sourceType: "module",
    plugins: ["jsx", "typescript"], // Поддержка JSX и TS, если нужно
  });

  traverse(ast, {
    ImportDeclaration({ node }) {
      const source = node.source.value;
      if (source.startsWith("./") || source.startsWith("../")) {
        if (
          !source.endsWith(".js") &&
          !source.endsWith(".json") &&
          !source.endsWith("/")
        ) {
          // Не трогаем директории или другие расширения
          node.source.value = `${source}.js`;
        }
      }
    },
    ExportNamedDeclaration({ node }) {
      if (node.source) {
        const source = node.source.value;
        if (source.startsWith("./") || source.startsWith("../")) {
          if (
            !source.endsWith(".js") &&
            !source.endsWith(".json") &&
            !source.endsWith("/")
          ) {
            node.source.value = `${source}.js`;
          }
        }
      }
    },
    ExportAllDeclaration({ node }) {
      const source = node.source.value;
      if (source.startsWith("./") || source.startsWith("../")) {
        if (
          !source.endsWith(".js") &&
          !source.endsWith(".json") &&
          !source.endsWith("/")
        ) {
          node.source.value = `${source}.js`;
        }
      }
    },
  });

  return generate(ast, { retainLines: true }).code; // Сохраняем форматирование
}

// Находим все .js файлы рекурсивно (игнорируем node_modules)
const files = sync("**/*.js", {
  cwd: rootDir,
  ignore: ["node_modules/**", "**/dist/**", "**/build/**"], // Исключаем ненужные директории
  absolute: true,
});

files.forEach((filePath) => {
  try {
    const code = readFileSync(filePath, "utf8");
    const fixedCode = fixImports(code);
    if (fixedCode !== code) {
      writeFileSync(filePath, fixedCode, "utf8");
      console.log(`Fixed: ${relative(rootDir, filePath)}`);
    }
  } catch (err) {
    console.error(`Error processing ${filePath}: ${err.message}`);
  }
});

console.log("Done!");

// Добавить в package.json
// "scripts": {
//   "fix-imports": "node scripts/fix-imports.js",
// },
