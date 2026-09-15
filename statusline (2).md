# Claude Code Statusline

**Script:** `/Users/inhdi/.claude/statusline-command.sh`

## Output

```
🦴  in:32.6k out:60 · ctx:16% · ⏱ 4h29m 35% · 7d 69%
```

## Segments

| Segment | JSON field | Note |
|---------|-----------|------|
| `🦴` | `hooks/caveman-statusline.sh` | caveman badge |
| `in:X out:Y` | `.context_window.total_input_tokens` / `.total_output_tokens` | cyan, `k` suffix ≥1000 |
| `ctx:X%` | `.context_window.used_percentage` | green/orange/red |
| `⏱ 4h29m 35%` | `.rate_limits.five_hour.resets_at` + `.used_percentage` | time dim, pct colored |
| `7d 69%` | `.rate_limits.seven_day.used_percentage` | colored |

Segments hidden when field absent (clean on API key plans).

## Colors

```
< 50%  → green  \033[38;5;71m
50–79% → orange \033[38;5;214m
≥ 80%  → red    \033[38;5;196m
```

Separator `·` → dim `\033[38;5;240m`

## JSON structure

```json
{
  "context_window": {
    "total_input_tokens": 32600,
    "total_output_tokens": 60,
    "used_percentage": 16.0
  },
  "rate_limits": {
    "five_hour": {
      "used_percentage": 35.0,
      "resets_at": 1781274600
    },
    "seven_day": {
      "used_percentage": 69.0,
      "resets_at": 1781503200
    }
  }
}
```

`resets_at` = Unix epoch. Remaining: `secs=$((resets_at - $(date +%s)))`.

## Add new segment

```bash
# Before "# --- Assemble ---"
new_part=""
val=$(echo "$input" | jq -r '.some.field // empty')
if [ -n "$val" ]; then
  val_int=$(printf "%.0f" "$val")
  col=$(pct_color "$val_int")
  new_part=$(printf "${SEP}label ${col}%s%%${RESET}" "$val_int")
fi
```

Append `${new_part}` to the `output=` line.

## Full script

```bash
#!/bin/bash
# Claude Code status line

input=$(cat)

DIM="\033[38;5;240m"
CYAN="\033[38;5;75m"
GREEN="\033[38;5;71m"
ORANGE="\033[38;5;214m"
RED="\033[38;5;196m"
RESET="\033[0m"
SEP="${DIM} · ${RESET}"

pct_color() {
  local p=$1
  if   [ "$p" -ge 80 ]; then printf "%s" "$RED"
  elif [ "$p" -ge 50 ]; then printf "%s" "$ORANGE"
  else                        printf "%s" "$GREEN"
  fi
}

# Caveman badge
caveman_out=$(bash "/Users/inhdi/.claude/hooks/caveman-statusline.sh" <<< "" 2>/dev/null)

# Tokens
total_in=$(echo "$input"  | jq -r '.context_window.total_input_tokens  // 0')
total_out=$(echo "$input" | jq -r '.context_window.total_output_tokens // 0')
used_pct=$(echo "$input"  | jq -r '.context_window.used_percentage // empty')

fmt() {
  awk -v n="$1" 'BEGIN { if (n>=1000) printf "%.1fk",n/1000; else printf "%d",n }'
}

tok_part=$(printf "${CYAN}in:$(fmt $total_in) out:$(fmt $total_out)${RESET}")

# Context window
ctx_part=""
if [ -n "$used_pct" ]; then
  ctx_int=$(printf "%.0f" "$used_pct")
  col=$(pct_color "$ctx_int")
  ctx_part=$(printf "${SEP}${col}ctx:%s%%${RESET}" "$ctx_int")
fi

# 5h session
five_part=""
five_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
if [ -n "$five_pct" ]; then
  five_int=$(printf "%.0f" "$five_pct")
  col=$(pct_color "$five_int")

  time_str=""
  reset_at=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
  if [ -n "$reset_at" ]; then
    now=$(date +%s)
    secs=$((reset_at - now))
    if [ "$secs" -gt 0 ]; then
      h=$((secs/3600)); m=$(( (secs%3600)/60 ))
      [ "$h" -gt 0 ] && time_str="${h}h${m}m" || time_str="${m}m"
    fi
  fi

  [ -n "$time_str" ] \
    && five_part=$(printf "${SEP}⏱ ${DIM}%s${RESET} ${col}%s%%${RESET}" "$time_str" "$five_int") \
    || five_part=$(printf "${SEP}⏱ ${col}%s%%${RESET}" "$five_int")
fi

# 7d weekly
week_part=""
week_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')
if [ -n "$week_pct" ]; then
  week_int=$(printf "%.0f" "$week_pct")
  col=$(pct_color "$week_int")
  week_part=$(printf "${SEP}7d ${col}%s%%${RESET}" "$week_int")
fi

# Assemble
output=""
[ -n "$caveman_out" ] && output="${caveman_out}  "
output="${output}${tok_part}${ctx_part}${five_part}${week_part}"

printf "%b" "$output"
```
