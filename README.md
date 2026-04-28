# weather-alert-telegram-bot

An AWS Lambda that runs once a day and sends a Telegram message when wind or gust speed in a given location is forecast to exceed configurable thresholds in the next 24 hours.

Built with [AWS CDK](https://docs.aws.amazon.com/cdk/v2/guide/home.html) (TypeScript), scheduled via EventBridge, and deployed through GitHub Actions with OIDC authentication.

## License

[MIT](LICENSE)
