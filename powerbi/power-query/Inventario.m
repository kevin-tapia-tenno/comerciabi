let
    Source = ConexionPostgreSQL,
    Tabla = Source{[Schema="analytics", Item="fact_inventario_snapshot"]}[Data],
    Seleccion = Table.SelectColumns(
        Tabla,
        {
            "fact_inventario_key",
            "fecha_key",
            "empresa_key",
            "producto_key",
            "almacen_key",
            "stock_actual",
            "stock_minimo",
            "costo_unitario",
            "valor_stock",
            "es_critico",
            "es_agotado"
        }
    ),
    Tipos = Table.TransformColumnTypes(
        Seleccion,
        {
            {"fact_inventario_key", Int64.Type},
            {"fecha_key", Int64.Type},
            {"empresa_key", Int64.Type},
            {"producto_key", Int64.Type},
            {"almacen_key", Int64.Type},
            {"stock_actual", type number},
            {"stock_minimo", type number},
            {"costo_unitario", Currency.Type},
            {"valor_stock", Currency.Type},
            {"es_critico", type logical},
            {"es_agotado", type logical}
        }
    )
in
    Tipos
