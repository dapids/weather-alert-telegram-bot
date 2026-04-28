import * as cdk from 'aws-cdk-lib'
import { Construct } from 'constructs'
import * as iam from 'aws-cdk-lib/aws-iam'
import * as lambda from 'aws-cdk-lib/aws-lambda'
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs'
import * as events from 'aws-cdk-lib/aws-events'
import * as targets from 'aws-cdk-lib/aws-events-targets'
import * as logs from 'aws-cdk-lib/aws-logs'
import * as path from 'path'

function getRequiredContext(scope: Construct, key: string): string {
  const value = scope.node.tryGetContext(key) as string | undefined
  if (!value?.trim()) {
    throw new Error(`Missing required CDK context value: ${key}`)
  }
  return value
}

export class WeatherAlertStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // SSM SecureString parameter names — create these before deploying:
    //   aws ssm put-parameter --name /weather-alert/weatherapi-key --value "<KEY>" --type SecureString
    //   aws ssm put-parameter --name /weather-alert/telegram-bot-token --value "<TOKEN>" --type SecureString
    //   aws ssm put-parameter --name /weather-alert/telegram-chat-id --value "<CHAT_ID>" --type SecureString
    const weatherApiKeyParameterName: string =
      (this.node.tryGetContext('weatherApiKeyParameterName') as string | undefined) ??
      '/weather-alert/weatherapi-key'
    const botTokenParameterName: string =
      (this.node.tryGetContext('botTokenParameterName') as string | undefined) ??
      '/weather-alert/telegram-bot-token'
    const chatIdParameterName: string =
      (this.node.tryGetContext('chatIdParameterName') as string | undefined) ??
      '/weather-alert/telegram-chat-id'
    const latitude = getRequiredContext(this, 'latitude')
    const longitude = getRequiredContext(this, 'longitude')
    const locationLabel = getRequiredContext(this, 'locationLabel')
    const scheduleHourUtc: string =
      (this.node.tryGetContext('scheduleHourUtc') as string | undefined) ?? '17'
    const windThresholdKph: string =
      (this.node.tryGetContext('windThresholdKph') as string | undefined) ?? '10'
    const gustThresholdKph: string =
      (this.node.tryGetContext('gustThresholdKph') as string | undefined) ?? '20'
    const rainThresholdMm: string =
      (this.node.tryGetContext('rainThresholdMm') as string | undefined) ?? '0'

    const weatherAlertFn = new lambdaNodejs.NodejsFunction(this, 'WeatherAlertFunction', {
      entry: path.join(__dirname, '../lambda/index.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_22_X,
      timeout: cdk.Duration.seconds(30),
      logRetention: logs.RetentionDays.ONE_WEEK,
      bundling: {
        // @aws-sdk/* is provided by the Node 22 Lambda runtime — no need to bundle it
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        WEATHERAPI_KEY_PARAMETER_NAME: weatherApiKeyParameterName,
        TELEGRAM_BOT_TOKEN_PARAMETER_NAME: botTokenParameterName,
        TELEGRAM_CHAT_ID_PARAMETER_NAME: chatIdParameterName,
        LATITUDE: latitude,
        LONGITUDE: longitude,
        LOCATION_LABEL: locationLabel,
        WIND_THRESHOLD_KPH: windThresholdKph,
        GUST_THRESHOLD_KPH: gustThresholdKph,
        RAIN_THRESHOLD_MM: rainThresholdMm,
      },
    })

    weatherAlertFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:GetParameter'],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter${weatherApiKeyParameterName}`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter${botTokenParameterName}`,
          `arn:aws:ssm:${this.region}:${this.account}:parameter${chatIdParameterName}`,
        ],
      }),
    )

    // EventBridge rule — runs once per day at configured UTC hour
    new events.Rule(this, 'DailySchedule', {
      schedule: events.Schedule.cron({ minute: '0', hour: scheduleHourUtc }),
      description: `Triggers weather-alert Lambda daily at ${scheduleHourUtc}:00 UTC`,
      targets: [new targets.LambdaFunction(weatherAlertFn)],
    })
  }
}
