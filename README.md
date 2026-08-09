# IT Servis Třebíč

Web + admin pro IT servis v Třebíči (opravy iPhonů, PC, software, rezervace, sklad).

## Spuštění

```bash
cp .env.example .env   # nastavte ADMIN_PASSWORD a SESSION_SECRET
npm install
npm start
```

Otevřete [http://localhost:8080](http://localhost:8080).  
Admin: [http://localhost:8080/admin/](http://localhost:8080/admin/)

> Web **musí** běžet přes `npm start` (Express). Python `http.server` nestačí — API, admin, rezervace a ceník nebudou fungovat.

## Health check

```bash
curl http://localhost:8080/api/health
```

## Prostředí (.env)

| Proměnná | Popis |
|----------|--------|
| `ADMIN_PASSWORD` | Heslo adminu (uloží se jako bcrypt hash v paměti) |
| `ADMIN_PASSWORD_HASH` | Volitelně hotový bcrypt hash místo plaintext hesla |
| `SESSION_SECRET` | Tajný klíč session (min. 32 znaků) |
| `PORT` | Port (výchozí 8080) |
| `NODE_ENV` | `production` zapne secure cookies |
| `COOKIE_SECURE` | `1` = HTTPS-only cookie i mimo production |
| `TRUST_PROXY` | `0` vypne trust proxy (výchozí zapnuto) |

Za reverse proxy (Nginx/Caddy) s HTTPS nastavte `NODE_ENV=production` nebo `COOKIE_SECURE=1`.

## Co umí

- Veřejný ceník iPhone + rezervace (termíny, doprava/mapa, platba na místě)
- Admin: zakázky, ceník, obsah oprav, termíny, sklad, účetnictví
- Sklad: při 0 ks se rezervace posune (+2 dny); po objednávce se kus odečte
- Zabezpečení: session na disku, bcrypt, rate-limit loginu, helmet, neveřejné `/data`

## Technologie

- Node.js 18+, Express
- HTML/CSS/JS (bez frameworku)
- Data v JSON souborech ve složce `data/`
