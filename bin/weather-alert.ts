#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib'
import { WeatherAlertStack } from '../lib/weather-alert-stack'

const app = new cdk.App()

new WeatherAlertStack(app, 'WeatherAlertStack', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
})
