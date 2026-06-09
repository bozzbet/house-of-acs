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
- Secretary/admin authentication for the clinic dashboard
- Server-side clinic appointment file database
- Dashboard analytics for clinic appointment volume
- CSV export
- Sample JSON data structure

## Important Limitation

GitHub Pages is static hosting. That means it can serve HTML, CSS, and JavaScript, but it cannot run the appointment API, authentication, or server-side database.

For the real appointment database and secretary login, run the Node backend in `server.js`.

This first backend uses a private file database at:

```text
private-data/clinic-appointments.json
```

That folder is ignored by Git and should not be uploaded publicly. JSON file storage is acceptable for a first prototype or a single-secretary local deployment. For production clinic use, move to SQLite, PostgreSQL, or MySQL with proper backups.

Backend options for production:

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

You can still open `index.html` directly in your browser for static preview. Appointment submissions will fall back to browser `localStorage`.

To use authentication, the appointment database, and reports, run the backend:

```bash
cd house-of-acs
npm start
```

Then open:

```text
http://localhost:3000
```

Default local secretary login:

```text
Username: secretary
Password: change-this-password
```

Before real use, set a private password:

```bash
ADMIN_USERNAME=secretary ADMIN_PASSWORD="your-strong-password" npm start
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
