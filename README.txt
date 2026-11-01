WB ЕГЭ — совместимая сборка GitHub Pages.
1. Загрузите все 5 файлов в корень репозитория wb-ege (замените старые).
2. GitHub Settings > Pages > main / (root).
3. В Cloudflare Worker Settings > Variables and Secrets задайте ALLOWED_ORIGIN = https://edholod.github.io (без слеша и пути).
4. Существующий Worker и базу D1 НЕ заменяйте.
5. Откройте https://edholod.github.io/wb-ege/ через WebApp-кнопку Telegram.
6. Проверьте /health на Worker. Если сохранение не работает, проверьте CORS и журнал Workers Logs.
Важно: банк 100 вопросов совпадает по порядку с предоставленным кодом Worker. Реальный E2E тест с Telegram initData и D1 здесь не проводился.
