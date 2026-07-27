$ErrorActionPreference = 'Stop'

Write-Host '1/3 Verificando compilacion...' -ForegroundColor Cyan
npm run build

Write-Host '2/3 Verificando ESLint...' -ForegroundColor Cyan
npm run lint

Write-Host '3/3 Revisando cambios de Git...' -ForegroundColor Cyan
git status

Write-Host ''
Write-Host 'Verificacion local completada. Falta ejecutar las pruebas funcionales y SQL antes del commit.' -ForegroundColor Green
