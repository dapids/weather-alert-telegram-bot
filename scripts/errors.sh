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

log_group_exists="$(AWS_PAGER='' aws logs describe-log-groups \
  --log-group-name-prefix "/aws/lambda/$function_name" \
  --query "length(logGroups[?logGroupName=='/aws/lambda/$function_name'])" \
  --output text \
  --no-cli-pager 2>/dev/null || echo 0)"

if [ "$log_group_exists" = "0" ] || [ -z "$log_group_exists" ]; then
    echo "No log group yet for $function_name. Invoke the function at least once, then rerun y errors."
    exit 0
fi

AWS_PAGER='' aws logs filter-log-events \
  --log-group-name "/aws/lambda/$function_name" \
  --start-time "$(($(date +%s) - 604800))000" \
  --filter-pattern "?ERROR ?Error ?error" \
  --query "events[*].message" \
  --output text
