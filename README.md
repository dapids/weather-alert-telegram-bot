# weather-alert-telegram-bot

An AWS Lambda that runs once a day and sends a Telegram message when wind, gust, or rain in a given location is forecast to exceed configurable thresholds in the next 24 hours.

Built with [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/home.html) (TypeScript), scheduled via EventBridge, and deployed through GitHub Actions with OIDC authentication.

## Features

- **Multi-metric alerts**: Triggers on wind speed, gust speed, or rain amount
- **Maximum values**: Shows the highest recorded value for each metric across the entire 24-hour forecast period, with the time it occurs
- **Configurable thresholds**: Set via CDK context or GitHub repository variables
- **Scheduled daily**: Runs at a configurable UTC hour via EventBridge

## Configuration

### Environment Variables / CDK Context

All parameters can be configured at deployment time:

```bash
y deploy \
  -c latitude=48.8566 \
  -c longitude=2.3522 \
  -c locationLabel='Paris, France' \
  -c scheduleHourUtc=17 \
  -c windThresholdKph=10 \
  -c gustThresholdKph=20 \
  -c rainThresholdMm=5
```

Or via GitHub repository variables for automatic CI/CD deploys:
- `AWS_REGION` (default: `eu-west-1`)
- `SCHEDULE_HOUR_UTC` (default: `17`)
- `WIND_THRESHOLD_KPH` (default: `10`)
- `GUST_THRESHOLD_KPH` (default: `20`)
- `RAIN_THRESHOLD_MM` (default: `10`)
- `LATITUDE`, `LONGITUDE`, `LOCATION_LABEL` (can use secrets or vars)

### Required AWS SSM Parameters

Before deploying, create these SecureString parameters in AWS Systems Manager:

```bash
aws ssm put-parameter --name /weather-alert/weatherapi-key --value "<KEY>" --type SecureString
aws ssm put-parameter --name /weather-alert/telegram-bot-token --value "<TOKEN>" --type SecureString
aws ssm put-parameter --name /weather-alert/telegram-chat-id --value "<CHAT_ID>" --type SecureString
```

## Monitoring

Check Lambda invocations over the last 7 days:
```bash
y invocations
```

Check error logs from the last 7 days:
```bash
y errors
```

Both commands support custom stack names via `STACK_NAME` environment variable if needed.

## License

[MIT](LICENSE)
