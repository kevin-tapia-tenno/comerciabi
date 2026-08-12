let
    Source = ConexionPostgreSQL,
    Tabla = Source{[Schema="analytics", Item="dim_fecha"]}[Data],
    Tipos = Table.TransformColumnTypes(
        Tabla,
        {
            {"fecha_key", Int64.Type},
            {"fecha", type date},
            {"anio", Int64.Type},
            {"trimestre", Int64.Type},
            {"mes", Int64.Type},
            {"mes_nombre", type text},
            {"semana_anio", Int64.Type},
            {"dia", Int64.Type},
            {"dia_semana", Int64.Type},
            {"dia_semana_nombre", type text},
            {"es_fin_semana", type logical}
        }
    )
in
    Tipos
