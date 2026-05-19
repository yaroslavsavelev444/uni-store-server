import { readdirSync, readFileSync } from "fs";
import Handlebars, { type TemplateDelegate } from "handlebars";
import layouts from "handlebars-layouts";
import juice from "juice";
import path from "path";
import { fileURLToPath } from "url";

// Эмуляция __dirname для ES модулей
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Регистрация хелперов layouts
const layoutHelpers = layouts(Handlebars);
Object.keys(layoutHelpers).forEach((name) => {
  Handlebars.registerHelper(name, layoutHelpers[name]);
});

// Кэш для шаблонов
const templateCache: Map<string, TemplateDelegate> = new Map();

// Чтение CSS
const styles = readFileSync(
  path.join(__dirname, "styles", "email.css"),
  "utf8",
);

// Регистрация partials
const partialsDir = path.join(__dirname, "partials");
try {
  const files = readdirSync(partialsDir);
  files.forEach((file) => {
    const name = path.basename(file, ".hbs");
    const content = readFileSync(path.join(partialsDir, file), "utf8");
    Handlebars.registerPartial(name, content);
  });
} catch (error) {
  console.error("Error loading partials:", error);
}

// Регистрация baseLayout как partial
try {
  const layoutPath = path.join(__dirname, "templates", "baseLayout.hbs");
  const layoutContent = readFileSync(layoutPath, "utf8");
  Handlebars.registerPartial("baseLayout", layoutContent);
} catch (error) {
  console.error("Error loading base layout:", error);
}

export interface RenderTemplateOptions {
  inlineStyles?: string;
  year?: number;
  [key: string]: any;
}

/**
 * Рендер шаблона с кэшированием
 */
const renderTemplate = (
  templateName: string,
  data: RenderTemplateOptions = {},
): string => {
  try {
    let template = templateCache.get(templateName);
    if (!template) {
      const filePath = path.join(__dirname, "templates", `${templateName}.hbs`);
      const source = readFileSync(filePath, "utf8");
      template = Handlebars.compile(source);
      templateCache.set(templateName, template);
    }

    const htmlWithStyles = template({
      ...data,
      inlineStyles: styles,
      year: data.year || new Date().getFullYear(),
    });

    return juice(htmlWithStyles);
  } catch (error) {
    console.error(`Error rendering template ${templateName}:`, error);
    throw new Error(`Failed to render email template: ${templateName}`);
  }
};

export default renderTemplate;
