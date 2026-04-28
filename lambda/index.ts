import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'

const ssmClient = new SSMClient({})

async function getParameter(name: string): Promise<string> {
  const response = await ssmClient.send(
    new GetParameterCommand({ Name: name, WithDecryption: true }),
  )
  if (!response.Parameter?.Value) throw new Error(`SSM parameter not found: ${name}`)
  return response.Parameter.Value
}

interface ForecastHour {
  time: string
  wind_kph: number
  gust_kph: number
  precip_mm: number
}

interface WeatherApiResponse {
  forecast: {
    forecastday: Array<{
      hour: ForecastHour[]
    }>
  }
}

async function fetchTomorrowHours(
  apiKey: string,
  lat: string,
  lon: string,
): Promise<ForecastHour[]> {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const dt = tomorrow.toISOString().split('T')[0]

  const url =
    `https://api.weatherapi.com/v1/forecast.json` +
    `?key=${encodeURIComponent(apiKey)}` +
    `&q=${encodeURIComponent(`${lat},${lon}`)}` +
    `&days=2&dt=${dt}`

  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`WeatherAPI error: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as WeatherApiResponse
  return data.forecast.forecastday[0].hour
}

async function sendTelegramMessage(token: string, chatId: string, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${token}/sendMessage`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  })
  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Telegram API error: ${response.status} ${body}`)
  }
}

interface HandlerResult {
  should_alert: boolean
  wind_kmh: number
  gust_kmh: number
  rain_mm: number
  time: string
}

export const handler = async (): Promise<HandlerResult> => {
  const [apiKey, botToken, chatId] = await Promise.all([
    getParameter(process.env.WEATHERAPI_KEY_PARAMETER_NAME!),
    getParameter(process.env.TELEGRAM_BOT_TOKEN_PARAMETER_NAME!),
    getParameter(process.env.TELEGRAM_CHAT_ID_PARAMETER_NAME!),
  ])

  const lat = process.env.LATITUDE!
  const lon = process.env.LONGITUDE!
  const location = process.env.LOCATION_LABEL!

  const hours = await fetchTomorrowHours(apiKey, lat, lon)

  const WIND_THRESHOLD_KPH = Number(process.env.WIND_THRESHOLD_KPH ?? '10')
  const GUST_THRESHOLD_KPH = Number(process.env.GUST_THRESHOLD_KPH ?? '20')
  const RAIN_THRESHOLD_MM = Number(process.env.RAIN_THRESHOLD_MM ?? '0')

  let shouldAlert = false
  let wind = 0
  let gust = 0
  let rain = 0
  let time = ''

  for (const h of hours) {
    if (
      h.wind_kph >= WIND_THRESHOLD_KPH ||
      h.gust_kph >= GUST_THRESHOLD_KPH ||
      h.precip_mm >= RAIN_THRESHOLD_MM
    ) {
      shouldAlert = true
      wind = h.wind_kph
      gust = h.gust_kph
      rain = h.precip_mm
      time = h.time
      break
    }
  }

  if (shouldAlert) {
    const alerts: string[] = []
    if (wind >= WIND_THRESHOLD_KPH) alerts.push(`💨 Vento: ${wind} km/h.`)
    if (gust >= GUST_THRESHOLD_KPH) alerts.push(`🌪️ Raffiche: ${gust} km/h.`)
    if (rain >= RAIN_THRESHOLD_MM) alerts.push(`🌧️ Pioggia: ${rain} mm.`)

    const message =
      `⚠️ Allerta meteo nelle prossime 24 ore in ${location}.\n\n` +
      alerts.join('\n') +
      `\n🕒 Orario: ${time}.`

    await sendTelegramMessage(botToken, chatId, message)
  }

  return { should_alert: shouldAlert, wind_kmh: wind, gust_kmh: gust, rain_mm: rain, time }
}
