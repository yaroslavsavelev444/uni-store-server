#!/bin/bash

# Скрипт бэкапа для MongoDB реплика-сета
# Важно: бэкап делается только с primary узла с использованием --oplog

DATABASE="polet"
BACKUP_DIR="/var/polet/backups"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_PATH="${BACKUP_DIR}/${TIMESTAMP}"
RETENTION_DAYS=7

# Цвета для вывода
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

error() { echo -e "${RED}❌ $1${NC}"; exit 1; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
info() { echo -e "${YELLOW}📦 $1${NC}"; }

# Находим primary узел БЕЗ вывода в stdout
find_primary() {
    for node in mongo1-prod mongo2-prod mongo3-prod; do
        # Проверяем доступность узла и является ли он primary
        if docker exec "$node" mongosh --quiet --eval "db.isMaster().ismaster" 2>/dev/null | grep -q "true"; then
            echo "$node"
            return 0
        fi
    done
    return 1
}

main() {
    echo "🚀 Starting MongoDB backup for replica set..."
    
    # Проверяем что Docker доступен
    if ! command -v docker &> /dev/null; then
        error "Docker is not available"
    fi
    
    # Создаем основную директорию если не существует
    info "Creating backup directory: $BACKUP_DIR"
    if [ ! -d "$BACKUP_DIR" ]; then
        echo "Creating main backup directory..."
        if ! mkdir -p "$BACKUP_DIR" 2>/dev/null; then
            echo "Trying with sudo..."
            if ! sudo mkdir -p "$BACKUP_DIR"; then
                error "Cannot create backup directory $BACKUP_DIR"
            fi
        fi
    fi
    
    # Создаем поддиректорию с таймштампом
    info "Creating timestamped directory: $BACKUP_PATH"
    if ! mkdir -p "$BACKUP_PATH"; then
        echo "Trying to create directory with different permissions..."
        # Пробуем изменить владельца основной директории
        if ! sudo chown -R $(whoami):$(whoami) "$BACKUP_DIR" 2>/dev/null; then
            echo "Warning: Could not change ownership"
        fi
        # Пробуем создать директорию еще раз
        if ! mkdir -p "$BACKUP_PATH"; then
            error "Failed to create backup directory: $BACKUP_PATH"
        fi
    fi
    
    # Проверяем что директория создана и доступна для записи
    if [ ! -d "$BACKUP_PATH" ]; then
        error "Backup directory $BACKUP_PATH does not exist"
    fi
    
    if [ ! -w "$BACKUP_PATH" ]; then
        error "Backup directory $BACKUP_PATH is not writable"
    fi
    
    info "Backup directory ready: $BACKUP_PATH"
    
    # Находим primary узел
    info "Finding primary node..."
    PRIMARY=$(find_primary)
    
    if [ -z "$PRIMARY" ]; then
        error "No primary node found in replica set"
    fi
    
    info "Using primary node: $PRIMARY"
    
    # Создаем бэкап
    info "Creating backup..."
    
    # Важно: --oplog для консистентности в реплика-сете
    if ! docker exec "$PRIMARY" mongodump \
        --host localhost:27017 \
        --oplog \
        --gzip \
        --archive="/tmp/backup.gz"; then
        error "Failed to create backup from $PRIMARY"
    fi
    
    # Копируем на хост
    info "Copying to host..."
    
    # Проверяем что файл создался в контейнере
    if ! docker exec "$PRIMARY" ls -la "/tmp/backup.gz" &>/dev/null; then
        error "Backup file not found in container"
    fi
    
    # Копируем файл - ВАЖНО: убедитесь что $BACKUP_PATH существует
    echo "Copying from container to: $BACKUP_PATH/backup.gz"
    if ! docker cp "${PRIMARY}:/tmp/backup.gz" "${BACKUP_PATH}/backup.gz"; then
        error "Failed to copy backup from container. Check if directory exists: $BACKUP_PATH"
    fi
    
    # Очищаем в контейнере
    docker exec "$PRIMARY" rm -f "/tmp/backup.gz" 2>/dev/null || true
    
    # Проверяем бэкап
    if [ ! -f "${BACKUP_PATH}/backup.gz" ]; then
        error "Backup file was not created on host"
    fi
    
    # Размер бэкапа
    SIZE=$(stat -f%z "${BACKUP_PATH}/backup.gz" 2>/dev/null || stat -c%s "${BACKUP_PATH}/backup.gz")
    
    # Форматируем размер
    if command -v numfmt &> /dev/null; then
        HUMAN_SIZE=$(numfmt --to=iec --suffix=B "$SIZE")
    else
        HUMAN_SIZE="${SIZE} bytes"
    fi
    
    success "Backup created: $HUMAN_SIZE"
    
    # Метаданные
    cat > "${BACKUP_PATH}/metadata.json" << EOF
{
    "backup_date": "$(date -Iseconds)",
    "database": "$DATABASE",
    "primary_node": "$PRIMARY",
    "size_bytes": $SIZE,
    "size_human": "$HUMAN_SIZE",
    "replica_set": "rs0",
    "nodes": ["mongo1-prod", "mongo2-prod", "mongo3-prod"],
    "backup_type": "mongodump with oplog",
    "mongodb_version": "$(docker exec "$PRIMARY" mongosh --quiet --eval 'db.version()' 2>/dev/null || echo "unknown")"
}
EOF
    
    info "Metadata saved"
    
    # Очистка старых бэкапов
    info "Cleaning old backups (>${RETENTION_DAYS} days)..."
    find "$BACKUP_DIR" -type d -mtime +$RETENTION_DAYS -exec rm -rf {} \; 2>/dev/null || true
    
    success "Backup completed: ${BACKUP_PATH}"
    
    # Выводим информацию о созданном бэкапе
    echo "📁 Backup location: $BACKUP_PATH"
    echo "📄 Files:"
    ls -la "$BACKUP_PATH"
}

main "$@"