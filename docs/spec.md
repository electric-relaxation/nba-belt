# NBA Championship Belt

## Overview
This web app tracks the holder of an unofficial NBA “Championship Belt” for a given NBA season. The rules of the Championship Belt are as follows:

1) At the start of the season, the winner of last season’s NBA Finals holds the belt.
2) During the regular season, the belt is acquired by winning against the current belt holder.

Notes:
- Transfer occurs only when the current holder loses a completed regular-season game.
- Ignore postponed or cancelled games.
- Games that don't involve the belt holder should be ignored.
- Games that don't count towards the regular season record should be ignored. This includes preseason, nba cup finals, play-in, and playoffs.
- A season's result is finalized after the last regular season game.

## Interface

For a given season, the site must:
- Prominently display the current belt holder (team name + logo).
- Display the belt holder’s next scheduled game or an active game if they are currently playing (opponent + logos + date/time).
- Display a chronological list of all games that caused a belt transfer (date, teams w/ logos, score). Sort them with more recent games near the top.
- For every team mention anywhere on the site, show the team logo alongside the team name.
- Dates and times should be shown in the user's timezone.

The homepage should load with the status of the current season, or during the offseason, it should show the completed results from the previous season. There should be a season selector to show the results from a previous season. NBA seasons should be referred to by their start year (e.g. “2025” for the 2025–26 season).

The interface should look nice on both desktop and mobile platforms. Support both light and dark modes and default to the system setting if available.

The site's favicon should be a basketball and the short title in a browser tab should be "NBA Belt".

## Other Requirements
- The website should feel snappy. No long loading times when the page first loads or the user switches seasons.
- The website should automatically update itself as games are played. Somewhere on the site, it should subtly display how long ago it was last updated.
- The website should be deployed at electricrelaxation.com/nba-belt (domain registered with Cloudflare).