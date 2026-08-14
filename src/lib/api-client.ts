export interface ApiAuthContext {
  accessToken: string
  empresaId: string
}


type QueryValue =
  | string
  | number
  | boolean
  | null
  | undefined


export type ApiQuery = Record<
  string,
  QueryValue
>


export interface ApiGetOptions {
  query?: ApiQuery
  signal?: AbortSignal
}


export class ApiClientError extends Error {
  readonly status: number
  readonly payload: unknown

  constructor(
    message: string,
    status: number,
    payload: unknown = null,
  ) {
    super(message)

    this.name = 'ApiClientError'
    this.status = status
    this.payload = payload
  }
}


function buildUrl(
  path: string,
  query?: ApiQuery,
): string {
  const url = new URL(
    path,
    window.location.origin,
  )

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (
        value === undefined ||
        value === null
      ) {
        continue
      }

      url.searchParams.set(
        key,
        String(value),
      )
    }
  }

  return url.toString()
}


async function readPayload(
  response: Response,
): Promise<unknown> {
  if (response.status === 204) {
    return null
  }

  const contentType =
    response.headers.get('content-type') ?? ''

  if (
    contentType.includes(
      'application/json',
    )
  ) {
    return response.json()
  }

  const text = await response.text()

  return text.length > 0
    ? text
    : null
}


function extractDetail(
  payload: unknown,
): string | null {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('detail' in payload)
  ) {
    return null
  }

  const detail = (
    payload as {
      detail?: unknown
    }
  ).detail

  if (
    typeof detail === 'string' &&
    detail.trim().length > 0
  ) {
    return detail
  }

  return null
}


function errorMessage(
  status: number,
  payload: unknown,
): string {
  const detail = extractDetail(payload)

  if (detail) {
    return detail
  }

  switch (status) {
    case 400:
      return 'La solicitud enviada a ComercioBI no es válida.'

    case 401:
      return 'Tu sesión no es válida o ha expirado.'

    case 403:
      return 'No tienes permiso para consultar esta información.'

    case 404:
      return 'El recurso solicitado no fue encontrado.'

    case 422:
      return 'La solicitud contiene parámetros no válidos.'

    case 500:
      return 'Ocurrió un error interno en ComercioBI.'

    case 502:
    case 503:
    case 504:
      return 'El servicio no está disponible temporalmente.'

    default:
      return `La API devolvió HTTP ${status}.`
  }
}


export async function apiGet<T>(
  auth: ApiAuthContext,
  path: string,
  options: ApiGetOptions = {},
): Promise<T> {
  let response: Response

  try {
    response = await fetch(
      buildUrl(
        path,
        options.query,
      ),
      {
        method: 'GET',

        headers: {
          Accept: 'application/json',

          Authorization:
            `Bearer ${auth.accessToken}`,

          'X-Empresa-Id':
            auth.empresaId,
        },

        signal: options.signal,
      },
    )
  } catch (error) {
    if (
      error instanceof DOMException &&
      error.name === 'AbortError'
    ) {
      throw error
    }

    throw new ApiClientError(
      'No se pudo conectar con la API de ComercioBI.',
      0,
      error,
    )
  }

  const payload = await readPayload(response)

  if (!response.ok) {
    throw new ApiClientError(
      errorMessage(
        response.status,
        payload,
      ),
      response.status,
      payload,
    )
  }

  if (payload === null) {
    throw new ApiClientError(
      'La API no devolvió contenido.',
      response.status,
      payload,
    )
  }

  return payload as T
}