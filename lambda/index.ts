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
  let firstWind = 0
  let firstGust = 0
  let firstRain = 0
  let windTime = ''
  let gustTime = ''
  let rainTime = ''

  for (const h of hours) {
    if (firstWind === 0 && h.wind_kph >= WIND_THRESHOLD_KPH) {
      firstWind = h.wind_kph
      windTime = h.time
      shouldAlert = true
    }
    if (firstGust === 0 && h.gust_kph >= GUST_THRESHOLD_KPH) {
      firstGust = h.gust_kph
      gustTime = h.time
      shouldAlert = true
    }
    if (firstRain === 0 && h.precip_mm >= RAIN_THRESHOLD_MM) {
      firstRain = h.precip_mm
      rainTime = h.time
      shouldAlert = true
    }
  }

  if (shouldAlert) {
    const alerts: string[] = []
    if (firstWind > 0) {
      alerts.push(`💨 Vento a ${firstWind} km/h alle (${windTime}).`)
    } else {
      alerts.push(`💨 Nessun vento previsto.`)
    }
    if (firstGust > 0) {
      alerts.push(`🌪️ Raffiche a ${firstGust} km/h alle (${gustTime}).`)
    } else {
      alerts.push(`🌪️ Nessuna raffica prevista.`)
    }
    if (firstRain > 0) {
      alerts.push(`🌧️ Pioggia a ${firstRain} mm alle (${rainTime}).`)
    } else {
      alerts.push(`🌧️ Nessuna pioggia prevista.`)
    }

    const message =
      `⚠️ Allerta meteo nelle prossime 24 ore in ${location}.\n\n` +
      alerts.join('\n')

    await sendTelegramMessage(botToken, chatId, message)
  }

  return { should_alert: shouldAlert, wind_kmh: firstWind, gust_kmh: firstGust, rain_mm: firstRain, time: windTime }
}
