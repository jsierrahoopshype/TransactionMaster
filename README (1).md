# NBA Trade Calculator

A clean, minimal web-based tool for finding salary-matching trade options based on NBA CBA rules.

## Features

- **Live Data**: Pulls player salary data directly from a published Google Sheet
- **Real-time Search**: Type to search for any player
- **CBA Compliant**: Implements NBA salary matching rules for all team statuses:
  - Cap Space teams (can use cap room + outgoing salary)
  - Below Tax teams (175% + $250K)
  - Tax Teams (175% + $250K)
  - First Apron teams (110% + $250K)
  - Second Apron teams (100% + $250K)
- **Two-way Sorting**: Sort results by player, team, salary, or status
- **Responsive Design**: Works on desktop and mobile

## How It Works

1. Search for a player by name
2. Select the player from the autocomplete dropdown
3. View all valid single-player trade targets based on:
   - The selected player's team can legally receive the target's salary
   - The target's team can legally receive the selected player's salary

## Data Source

The calculator fetches data from a published Google Sheets CSV:
- Player names
- Team assignments
- 2025-26 salaries
- Team salary cap status
- Available cap space (for Cap Space teams)

## Setup for GitHub Pages

1. Fork or clone this repository
2. Go to Settings → Pages
3. Set source to "Deploy from a branch"
4. Select `main` branch and `/ (root)` folder
5. Save and wait for deployment

## Customization

To use your own data source, update the `CSV_URL` variable in `index.html`:

```javascript
const CSV_URL = 'your-google-sheets-csv-url';
```

Your CSV should have these columns:
- `PLAYER` - Player name
- `TEAM` - Team name
- `2026` - Salary (can include $ and commas)
- `ST 25-26` or `Team Status` - One of: "Cap Space", "Below Tax", "Tax Team", "1st Apron", "2nd Apron"
- `Cap Space` or `H` - Available cap space (for Cap Space teams)

## License

MIT
