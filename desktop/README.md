# Schoolwell desktop

Windows, macOS and Linux app. It opens the Schoolwell web app in a secure native window, so it shows the same
Supabase data as the website and the mobile app.

```bash
cd desktop
npm install
npm start                      # opens the app (default URL from config.json)
SCHOOLWELL_URL=http://localhost:3000 npm start   # point it at a local web app instead
npm run dist                   # installers for the current OS into desktop/dist
```

Change the school's address in `config.json` (or put a `config.json` with `{"url": "https://your-school.example"}` in the app's user-data folder).
Only `https://` URLs (and `http://localhost`) are accepted. Installers must be built on each target OS (or use the GitHub Actions workflow).
