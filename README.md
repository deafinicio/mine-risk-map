# Mine Risk Map — Starter

Це мінімальний стартовий проєкт для GitHub Pages із картою на **Leaflet**.

## Файли
- `index.html` — сторінка з картою.
- `data/sessions.geojson` — демо-точки проведених сесій.
- `data/admin_agg.geojson` — демо-полігони громад з сумою учасників (спрощені, неофіційні межі).

## Запуск на GitHub Pages
1. Завантаж все в репозиторій (branch `main`).
2. В налаштуваннях репозиторію (`Settings → Pages`) обери Source: `Deploy from a branch`, Branch: `main / root`.
3. Відкрий адресу: `https://<твій_логін>.github.io/<назва_репозиторію>/`.

## Застереження
- Полігони `admin_agg.geojson` наведені виключно як **демо**. Для реальної роботи слід використати офіційні межі громад та заповнювати `sum_participants` з ваших даних.
