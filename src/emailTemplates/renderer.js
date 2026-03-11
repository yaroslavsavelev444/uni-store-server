import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import handlebars, {
  compile,
  registerHelper,
  registerPartial,
} from "handlebars";
import layouts from "handlebars-layouts";
import juice from "juice";

// Регистрация хелперов
registerHelper(layouts(handlebars));

// Чтение CSS
const styles = readFileSync(join(__dirname, "styles", "email.css"), "utf8");

// Регистрация partials
const partialsDir = join(__dirname, "partials");
readdirSync(partialsDir).forEach((file) => {
  const name = basename(file, ".hbs");
  const content = readFileSync(join(partialsDir, file), "utf8");
  registerPartial(name, content);
});

// Регистрация baseLayout как partial
const layoutPath = join(__dirname, "templates", "baseLayout.hbs");
const layoutContent = readFileSync(layoutPath, "utf8");
registerPartial("baseLayout", layoutContent);

// Рендер шаблона
const renderTemplate = (templateName, data = {}) => {
  const filePath = join(__dirname, "templates", `${templateName}.hbs`);
  const source = readFileSync(filePath, "utf8");

  const template = compile(source);
  const htmlWithStyles = template({
    ...data,
    inlineStyles: styles,
    year: new Date().getFullYear(),
  });

  return juice(htmlWithStyles);
};

export default renderTemplate;
