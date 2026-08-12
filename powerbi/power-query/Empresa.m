let
    Source = ConexionPostgreSQL,
    Tabla = Source{[Schema="analytics", Item="dim_empresa"]}[Data],
    Seleccion = Table.SelectColumns(
        Tabla,
        {
            "empresa_key",
            "source_empresa_id",
            "nombre",
            "zona_horaria",
            "activo"
        }
    ),
    Tipos = Table.TransformColumnTypes(
        Seleccion,
        {
            {"empresa_key", Int64.Type},
            {"source_empresa_id", type text},
            {"nombre", type text},
            {"zona_horaria", type text},
            {"activo", type logical}
        }
    )
in
    Tipos
