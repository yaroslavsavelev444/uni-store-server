#!/bin/bash

# Скрипт бэкапа для MongoDB реплика-сета
# Важно: бэкап делается только с primary узла с использованием --oplog

DATABASE="polet"
BACKUP_DIR="/var/polet/backups"  # ← ИЗМЕНЕНО для prod
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
    for node in mongo1-prod mongo2-prod mongo3-prod; do  # ← ИЗМЕНЕНО имена контейнеров
        # Проверяем доступность узла и является ли он primary
        if docker exec "$node" mongosh --quiet --eval "db.isMaster().ismaster" 2>/dev/null | grep -q "true"; then
            echo "$node"  # ТОЛЬКО имя узла в stdout
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
    
    # Проверяем права на запись в директорию
    if [ ! -w "/var/polet" ]; then
        echo "⚠️  /var/polet not writable, checking permissions..."
        # Пробуем создать директорию с sudo если нужно
        if ! sudo mkdir -p "${BACKUP_DIR}" 2>/dev/null; then
            error "Cannot create backup directory ${BACKUP_DIR}"
        fi
        if ! sudo chown -R $(whoami):$(whoami) "${BACKUP_DIR}" 2>/dev/null; then
            echo "Warning: Could not change ownership of ${BACKUP_DIR}"
        fi
    else
        mkdir -p "${BACKUP_PATH}"
    fi
    
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
    # Используем localhost в контейнере, так как подключение происходит внутри контейнера
    if ! docker exec "$PRIMARY" mongodump \
        --host localhost:27017 \
        --oplog \
        --gzip \
        --archive="/tmp/backup.gz"; then
        error "Failed to create backup from $PRIMARY"
    fi
    
    # Копируем на хост
    info "Copying to host..."
    if ! docker cp "${PRIMARY}:/tmp/backup.gz" "${BACKUP_PATH}/backup.gz"; then
        error "Failed to copy backup from container"
    fi
    
    # Очищаем в контейнере
    docker exec "$PRIMARY" rm -f "/tmp/backup.gz" 2>/dev/null || true
    
    # Проверяем бэкап
    if [ ! -f "${BACKUP_PATH}/backup.gz" ]; then
        error "Backup file was not created"
    fi
    
    # Размер бэкапа
    SIZE=$(stat -f%z "${BACKUP_PATH}/backup.gz" 2>/dev/null || stat -c%s "${BACKUP_PATH}/backup.gz")
    if [ "$SIZE" -lt 1024 ]; then
        echo "⚠️  Warning: Backup file is very small ($SIZE bytes)"
    fi
    
    # Форматируем размер
    if command -v numfmt &> /dev/null; then
        HUMAN_SIZE=$(numfmt --to=iec --suffix=B "$SIZE")
    else
        # Простой формат если numfmt нет
        if [ "$SIZE" -gt 1073741824 ]; then
            HUMAN_SIZE=$(echo "scale=2; $SIZE/1073741824" | bc)GB
        elif [ "$SIZE" -gt 1048576 ]; then
            HUMAN_SIZE=$(echo "scale=2; $SIZE/1048576" | bc)MB
        elif [ "$SIZE" -gt 1024 ]; then
            HUMAN_SIZE=$(echo "scale=2; $SIZE/1024" | bc)KB
        else
            HUMAN_SIZE="${SIZE}B"
        fi
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
}

main "$@"