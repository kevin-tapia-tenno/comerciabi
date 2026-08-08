$ErrorActionPreference = 'Stop'

Write-Host '1/4 Verificando dependencia Recharts...' -ForegroundColor Cyan
npm list recharts --depth=0

Write-Host '2/4 Verificando compilacion...' -ForegroundColor Cyan
npm run build

Write-Host '3/4 Verificando ESLint...' -ForegroundColor Cyan
npm run lint

Write-Host '4/4 Revisando cambios de Git...' -ForegroundColor Cyan
git status

Write-Host ''
Write-Host 'Verificacion local de la Fase 11 completada.' -ForegroundColor Green
Write-Host 'Recuerda validar tambien la migracion 016, el archivo 010_verificaciones_dashboard.sql y las pruebas funcionales en /reportes.' -ForegroundColor Yellow
