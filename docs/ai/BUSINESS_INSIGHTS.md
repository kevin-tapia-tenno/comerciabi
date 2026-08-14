# ComercioBI - Motor de Business Insights

## Objetivo

La Fase 14.13 transforma las salidas tecnicas del pipeline de IA en informacion
ejecutiva y accionable para API, React, Power BI y futuras automatizaciones.

El motor base es determinista y auditable. No depende de un LLM.

## Principios

1. La logica de negocio vive antes de la interfaz.
2. Cada insight esta vinculado a una `ai_ejecucion_id`.
3. Los resultados DEMO se identifican explicitamente.
4. Un modelo complejo no reemplaza al baseline si no demuestra mejora fuera de muestra.
5. Las recomendaciones de inventario son sugerencias y deben validarse contra presupuesto,
   lead time, lotes minimos y restricciones operativas.
6. Las bandas de incertidumbre actuales son operacionales y no garantias formales de cobertura.

## Serving layer

La migracion 021 crea:

- `analytics.ai_insights`
- `analytics.vw_ai_insights_actual`
- `analytics.vw_ai_insights_resumen_actual`

La vista resumen entrega los insights actuales en JSON ordenado, listo para API/React/BI.

## LLM futuro

Si luego se incorpora un LLM, debe ser una capa opcional de redaccion:

`datos -> modelos -> reglas -> insight estructurado -> LLM opcional -> interfaz`

El LLM no debe decidir cifras, riesgos, modelos campeones ni cantidades de reposicion.
