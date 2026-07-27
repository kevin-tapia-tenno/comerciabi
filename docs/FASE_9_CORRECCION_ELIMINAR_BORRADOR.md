# Corrección de la Fase 9: eliminación de borradores

1. Copiar los archivos del ZIP sobre la raíz de `C:\Proyectos\comerciabi`.
2. Ejecutar en Supabase SQL Editor el archivo:
   `database/migrations/012_corregir_eliminacion_borrador_compra.sql`.
3. Reiniciar Vite con `npm run dev`.
4. Probar la eliminación de una compra en estado `BORRADOR`.
5. Para probar anulación: crear borrador, confirmarlo y usar el botón `Anular` que aparece en estado `CONFIRMADA`.
