Frozen copy of the Midnight Season 2 data (season.json, progression.json, crafted.json, fights/) used by the tests, so that the
season switch (tools/season-promote.js replaces data/ with the next season) never breaks them. Not shipped, not downloaded by the app.
main.js reads it instead of data/ when POLYGNOME_DATA points here (test/e2e.test.js).
