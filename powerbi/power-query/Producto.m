let
    Source = ConexionPostgreSQL,
    Tabla = Source{[Schema="analytics", Item="dim_producto"]}[Data],
    Seleccion = Table.SelectColumns(
        Tabla,
        {
            "producto_key",
            "source_producto_id",
            "empresa_key",
            "sku",
            "nombre",
            "categoria",
            "costo_actual",
            "activo"
        }
    ),
    Tipos = Table.TransformColumnTypes(
        Seleccion,
        {
            {"producto_key", Int64.Type},
            {"source_producto_id", type text},
            {"empresa_key", Int64.Type},
            {"sku", type text},
            {"nombre", type text},
            {"categoria", type text},
            {"costo_actual", Currency.Type},
            {"activo", type logical}
        }
    )
in
    Tipos
