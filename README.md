# Pension House + Medical Clinic Website

Starter GitHub repository for an integrated **Pension House** and **Medical Clinic** website.

This version is designed to work on **GitHub Pages** while you do not have a domain yet.

## Current Features

- Public homepage
- Rooms section
- Amenities section
- Location section
- Announcements/updates section
- Pension house booking inquiry demo
- Clinic appointment form demo
- Secretary/admin dashboard demo
- CSV export demo
- Sample JSON data structure

## Important Limitation

GitHub Pages is static hosting. That means it can serve HTML, CSS, and JavaScript, but it cannot securely save patient appointments to a server-side JSON file by itself.

For now, this starter uses browser `localStorage` so you can test the appointment flow.

Later, use one of these backend options:

1. Node.js + Express backend on a VPS, Render, Railway, Fly.io, or similar
2. SQLite database for a simple clinic system
3. MySQL or PostgreSQL for a larger production system
4. A secure third-party form or appointment service

## Project Structure

```text
house-of-acs/
├── index.html
├── admin.html
├── assets/
│   ├── css/
│   │   └── styles.css
│   ├── js/
│   │   ├── app.js
│   │   └── admin.js
│   └── images/
├── data/
│   ├── appointments.json
│   ├── announcements.json
│   └── room-bookings.json
├── docs/
│   └── blueprint.md
├── .nojekyll
└── README.md
```

## Local Development

Open `index.html` directly in your browser.

Or run a simple local server:

```bash
cd house-of-acs
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Create GitHub Repo and Push

Replace `YOUR_GITHUB_USERNAME` and `YOUR_REPO_NAME`.

```bash
cd pension-clinic-website

git init
git add .
git commit -m "Initial pension clinic website"

git branch -M main
git remote add origin https://github.com/bozzbet/house-of-acs.git
git push -u origin main
```

## Enable GitHub Pages

1. Open your repository on GitHub.
2. Go to **Settings**.
3. Go to **Pages**.
4. Under **Build and deployment**, choose:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/root`
5. Save.

Your site will be available at:

```text
https://github.com/bozzbet/house-of-acs/
```

## Suggested Repo Name

```text
house-of-acs
```

## Suggested Next Development Steps

1. Replace sample business name and contact details.
2. Replace sample room rates.
3. Add real room photos to `assets/images/`.
4. Replace the QR placeholder with a real QR code image.
5. Add actual Google Map embed.
6. Build backend API for real appointment saving.
7. Add login authentication for secretary/admin.
8. Add real reports and database storage.
