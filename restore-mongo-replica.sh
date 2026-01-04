#!/bin/bash

# Конфигурация
DATABASE="polet"
BACKUP_DIR="./backups"

# Цвета
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

error() { echo -e "${RED}❌ $1${NC}"; exit 1; }
success() { echo -e "${GREEN}✅ $1${NC}"; }
info() { echo -e "${YELLOW}📦 $1${NC}"; }

# Функция для выбора бэкапа
select_backup() {
    if [ -n "$1" ]; then
        echo "$1"
        return
    fi
    
    info "Available backups:"
    local backups=()
    local i=1
    
    # Ищем все бэкапы
    for dir in "$BACKUP_DIR"/*/; do
        if [ -d "$dir" ] && [ -f "${dir}${DATABASE}.gz" ]; then
            backups[i]="$dir"
            local date=$(basename "$dir")
            local size=$(stat -f%z "${dir}${DATABASE}.gz" 2>/dev/null || stat -c%s "${dir}${DATABASE}.gz")
            local human_size=$(echo "$size" | awk '{ split( "B KB MB GB TB" , v ); s=1; while( $1>1024 ){ $1/=1024; s++ } printf "%.2f %s", $1, v[s] }')
            echo "  [$i] $date ($human_size)"
            ((i++))
        fi
    done
    
    if [ ${#backups[@]} -eq 0 ]; then
        error "No backups found in $BACKUP_DIR"
    fi
    
    echo ""
    read -p "Select backup number (1-${#backups[@]}): " choice
    
    if [[ ! "$choice" =~ ^[0-9]+$ ]] || [ "$choice" -lt 1 ] || [ "$choice" -gt ${#backups[@]} ]; then
        error "Invalid selection"
    fi
    
    echo "${backups[$choice]}"
}

# Основной скрипт восстановления
main() {
    local backup_path
    local container="mongo1-polet-dev"  # Восстанавливаем в primary
    
    echo "🔄 MongoDB Restore Utility"
    echo "=========================="
    
    # Выбираем бэкап
    backup_path=$(select_backup "$1")
    local backup_file="${backup_path}${DATABASE}.gz"
    
    if [ ! -f "$backup_file" ]; then
        error "Backup file not found: $backup_file"
    fi
    
    # Показываем информацию о бэкапе
    if [ -f "${backup_path}metadata.json" ]; then
        info "Backup information:"
        cat "${backup_path}metadata.json" | python3 -m json.tool 2>/dev/null || cat "${backup_path}metadata.json"
        echo ""
    fi
    
    # Предупреждение
    echo -e "${RED}⚠️  ⚠️  ⚠️  WARNING: ⚠️  ⚠️  ⚠️${NC}"
    echo -e "${RED}This will COMPLETELY OVERWRITE database '$DATABASE'${NC}"
    echo -e "${RED}All current data will be PERMANENTLY LOST!${NC}"
    echo ""
    
    read -p "Type 'RESTORE-$DATABASE' to confirm: " confirmation
    
    if [ "$confirmation" != "RESTORE-$DATABASE" ]; then
        error "Restore cancelled"
    fi
    
    info "Starting restore process..."
    
    # Вариант 1: Простое восстановление (если реплика-сет не критичен)
    info "Method 1: Simple restore to single node"
    
    # Копируем бэкап в контейнер
    docker cp "$backup_file" "${container}:/tmp/restore.gz"
    
    # Восстанавливаем
    docker exec "$container" mongorestore \
        --gzip \
        --archive="/tmp/restore.gz" \
        --drop \
        --noIndexRestore \
        --quiet
    
    # Очищаем
    docker exec "$container" rm -f "/tmp/restore.gz"
    
    success "Database restored to $container"
    
    # Вариант 2: Для реплика-сета - репликация восстановленных данных
    info "Replicating data to other nodes..."
    
    # Даем время на репликацию
    sleep 5
    
    # Проверяем репликацию
    info "Checking replication status..."
    docker exec "$container" mongosh --quiet --eval "
        const status = rs.status();
        const members = status.members || [];
        let healthy = 0;
        
        members.forEach(member => {
            if (member.stateStr === 'PRIMARY' || member.stateStr === 'SECONDARY') {
                healthy++;
            }
        });
        
        print('Healthy nodes: ' + healthy + '/' + members.length);
        
        if (healthy === members.length) {
            print('✅ All nodes are healthy');
        } else {
            print('⚠️  Some nodes may not be synchronized');
        }
    "
    
    success "Restore completed!"
    info "Note: You may need to restart your application containers"
}

# Запускаем
main "$@"