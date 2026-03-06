#!/usr/bin/env bash
set -euo pipefail

mode="${INPUT_MODE:-}"
repo_path="${INPUT_REPO_PATH:-.}"
plan_artifact="${INPUT_PLAN_ARTIFACT:-}"
verify_args="${INPUT_VERIFY_ARGS:---ci}"

if [[ -z "$mode" ]]; then
  echo "Input 'mode' is required (verify|plan|apply)." >&2
  exit 1
fi

if [[ ! -d "$repo_path" ]]; then
  echo "repo-path does not exist or is not a directory: $repo_path" >&2
  exit 1
fi

cd "$repo_path"

case "$mode" in
  verify)
    # shellcheck disable=SC2206
    args=( $verify_args )
    playbook verify "${args[@]}"
    ;;
  plan)
    mkdir -p .playbook
    plan_path=".playbook/plan.json"
    playbook plan --json > "$plan_path"
    echo "plan_path=$repo_path/$plan_path" >> "$GITHUB_OUTPUT"
    ;;
  apply)
    if [[ -z "$plan_artifact" ]]; then
      echo "Input 'plan-artifact' is required when mode=apply." >&2
      exit 1
    fi

    if [[ ! -f "$plan_artifact" ]]; then
      echo "Plan artifact file not found: $plan_artifact" >&2
      exit 1
    fi

    playbook apply --from-plan "$plan_artifact"
    ;;
  *)
    echo "Invalid mode '$mode'. Expected verify, plan, or apply." >&2
    exit 1
    ;;
esac
