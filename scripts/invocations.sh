#!/usr/bin/env sh
set -eu

stack_name="${STACK_NAME:-WeatherAlertStack}"

function_name="$(aws cloudformation list-stack-resources \
  --stack-name "$stack_name" \
  --query "StackResourceSummaries[?ResourceType=='AWS::Lambda::Function'].PhysicalResourceId | [0]" \
  --output text 2>/dev/null || true)"

if [ -z "$function_name" ] || [ "$function_name" = "None" ]; then
  echo "No deployed WeatherAlert function found for stack $stack_name. Run y deploy first, or set STACK_NAME." >&2
  exit 1
fi

AWS_PAGER='' aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Invocations \
  --dimensions "Name=FunctionName,Value=$function_name" \
  --start-time "$(date -u -v-7d +%Y-%m-%dT%H:%M:%SZ)" \
  --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --period 3600 \
  --statistics Sum \
  --query "sort_by(Datapoints, &Timestamp)[*].{Time:Timestamp,Count:Sum}"
