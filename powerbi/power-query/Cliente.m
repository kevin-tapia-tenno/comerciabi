let
    Source = ConexionPostgreSQL,
    Tabla = Source{[Schema="analytics", Item="dim_cliente"]}[Data],
    Seleccion = Table.SelectColumns(
        Tabla,
        {
            "cliente_key",
            "source_cliente_id",
            "empresa_key",
            "nombre_completo"
        }
    ),
    Tipos = Table.TransformColumnTypes(
        Seleccion,
        {
            {"cliente_key", Int64.Type},
            {"source_cliente_id", type text},
            {"empresa_key", Int64.Type},
            {"nombre_completo", type text}
        }
    )
in
    Tipos
