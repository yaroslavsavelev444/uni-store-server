// Генерация новой версии на основе предыдущей
function incrementVersion(currentVersion, level = 'patch') {
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  switch(level) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error('Invalid version level');
  }
}

// Проверка валидности версии
function isValidVersion(version) {
  return /^\d+\.\d+\.\d+$/.test(version);
}

module.exports = {
  incrementVersion,
  isValidVersion
};