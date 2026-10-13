# Eczar for the app

Copies of `../static/Eczar-*.ttf` with tighter vertical metrics: ascent 950,
descent 300 (hhea and OS/2), instead of 1143 / 634. The original metrics make
room for Devanagari, so Latin text sits low in its line on iOS. The line box
now centers on the capitals (cap height 650).

Eczar has no Reserved Font Name under its OFL, so the modified copies keep the
name. These are the files `app.json` embeds via the expo-font plugin.
