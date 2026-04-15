const fs = require("fs");
const path = require("path");
const handlebars = require("handlebars");
const layouts = require("handlebars-layouts");
const juice = require("juice");

// Регистрация хелперов
handlebars.registerHelper(layouts(handlebars));

// Чтение CSS
const styles = fs.readFileSync(path.join(__dirname, "styles", "email.css"), "utf8");

// Регистрация partials
const partialsDir = path.join(__dirname, "partials");
fs.readdirSync(partialsDir).forEach(file => {
  const name = path.basename(file, ".hbs");
  const content = fs.readFileSync(path.join(partialsDir, file), "utf8");
  handlebars.registerPartial(name, content);
});

// Регистрация baseLayout как partial
const layoutPath = path.join(__dirname, "templates", "baseLayout.hbs");
const layoutContent = fs.readFileSync(layoutPath, "utf8");
handlebars.registerPartial("baseLayout", layoutContent);

// Рендер шаблона
const renderTemplate = (templateName, data = {}) => {
  const filePath = path.join(__dirname, "templates", `${templateName}.hbs`);
  const source = fs.readFileSync(filePath, "utf8");

  const template = handlebars.compile(source);
  const htmlWithStyles = template({
    ...data,
    inlineStyles: styles,
    year: new Date().getFullYear(),
  });

  return juice(htmlWithStyles);
};

module.exports = renderTemplate;