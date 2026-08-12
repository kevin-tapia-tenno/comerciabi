let
    Source = ConexionPostgreSQL,
    Tabla = Source{[Schema="analytics", Item="dim_vendedor"]}[Data],
    Seleccion = Table.SelectColumns(
        Tabla,
        {
            "vendedor_key",
            "source_vendedor_empresa_id",
            "empresa_key",
            "nombre_completo",
            "rol",
            "activo"
        }
    ),
    Tipos = Table.TransformColumnTypes(
        Seleccion,
        {
            {"vendedor_key", Int64.Type},
            {"source_vendedor_empresa_id", type text},
            {"empresa_key", Int64.Type},
            {"nombre_completo", type text},
            {"rol", type text},
            {"activo", type logical}
        }
    )
in
    Tipos
