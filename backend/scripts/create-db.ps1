# Создание базы doorphone для backend (Windows)
# Запуск: .\scripts\create-db.ps1
# Пароль: задайте переменную $env:PGPASSWORD = "ваш_пароль" перед запуском
#         или скрипт запросит пароль при подключении.

$dbName = "doorphone"
$pgPaths = @(
    "C:\Program Files\PostgreSQL\18\bin\psql.exe",
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe"
)

# Проверяем папку PostgreSQL на наличие других версий
$pgDir = "C:\Program Files\PostgreSQL"
if (Test-Path $pgDir) {
    Get-ChildItem $pgDir -Directory | ForEach-Object {
        $p = Join-Path $_.FullName "bin\psql.exe"
        if ((Test-Path $p) -and ($pgPaths -notcontains $p)) { $pgPaths += $p }
    }
}

$psql = $null
foreach ($p in $pgPaths) {
    if (Test-Path $p) {
        $psql = $p
        break
    }
}

if (-not $psql) {
    Write-Host "PostgreSQL (psql) не найден. Установите PostgreSQL или создайте базу вручную."
    Write-Host "Подробнее: scripts\create-db-windows.md"
    exit 1
}

Write-Host "Найден: $psql"
Write-Host "Создание базы $dbName (хост: localhost, пользователь: postgres)..."
& $psql -h localhost -U postgres -c "CREATE DATABASE $dbName;"
if ($LASTEXITCODE -eq 0) {
    Write-Host "База $dbName создана."
} else {
    Write-Host "Ошибка. Укажите пароль: `$env:PGPASSWORD = 'ваш_пароль'; .\scripts\create-db.ps1"
    Write-Host "Или создайте базу вручную в pgAdmin. Проверьте DB_PASSWORD в .env"
}
