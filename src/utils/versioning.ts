// Генерация новой версии на основе предыдущей
function incrementVersion(
  currentVersion: {
    split: (arg0: string) => {
      (): any;
      new (): any;
      map: { (arg0: NumberConstructor): [any, any, any]; new (): any };
    };
  },
  level = "patch",
) {
  const [major, minor, patch] = currentVersion.split(".").map(Number);

  switch (level) {
    case "major":
      return `${major + 1}.0.0`;
    case "minor":
      return `${major}.${minor + 1}.0`;
    case "patch":
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error("Invalid version level");
  }
}

// Проверка валидности версии
function isValidVersion(version: string) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

export default {
  incrementVersion,
  isValidVersion,
};
